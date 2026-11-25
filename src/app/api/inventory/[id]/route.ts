import { NextRequest, NextResponse } from 'next/server';
import { getDb, withTransaction } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { roundCurrency } from '@/lib/format';

const VALID_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned'];

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!item) {
    return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 });
  }
  const transactions = db
    .prepare('SELECT * FROM inventory_transactions WHERE item_id = ? ORDER BY id DESC')
    .all(id);
  return NextResponse.json({ item, transactions });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'staff');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 });
  }

  const {
    item_code,
    item_name,
    description,
    category,
    quantity,
    unit,
    unit_price,
    min_stock_level,
    supplier,
    date_purchased,
    condition,
    remarks,
  } = await req.json().catch(() => ({}));

  const nextName = item_name !== undefined ? String(item_name).trim() : existing.item_name;
  const nextCat = category !== undefined && String(category).trim() ? String(category).trim() : existing.category;
  const nextUnit = unit !== undefined ? String(unit).trim() : existing.unit;
  const nextCondition = condition !== undefined ? String(condition) : existing.condition;
  const nextQty = quantity !== undefined ? Number(quantity) : existing.quantity;
  const nextPrice = unit_price !== undefined ? Number(unit_price) : existing.unit_price;
  const nextMinStock = min_stock_level !== undefined ? Number(min_stock_level) : existing.min_stock_level;

  if (!nextName || !nextUnit) {
    return NextResponse.json({ error: 'Item name and unit of measurement cannot be empty.' }, { status: 400 });
  }
  if (!VALID_CONDITIONS.includes(nextCondition)) {
    return NextResponse.json({ error: 'Invalid condition value.' }, { status: 400 });
  }
  if (
    !Number.isFinite(nextQty) ||
    nextQty < 0 ||
    !Number.isFinite(nextPrice) ||
    nextPrice < 0 ||
    !Number.isFinite(nextMinStock) ||
    nextMinStock < 0
  ) {
    return NextResponse.json(
      { error: 'Quantity, unit price, and minimum stock level must be non-negative numbers.' },
      { status: 400 }
    );
  }

  const normalizedCode =
    item_code !== undefined
      ? item_code && String(item_code).trim()
        ? String(item_code).trim()
        : null
      : existing.item_code;

  if (normalizedCode) {
    const conflict = db
      .prepare('SELECT id FROM inventory_items WHERE LOWER(item_code) = LOWER(?) AND id != ?')
      .get(normalizedCode, id);
    if (conflict) {
      return NextResponse.json({ error: `Item code "${normalizedCode}" is already used by another item.` }, { status: 409 });
    }
  }

  const roundedNextPrice = roundCurrency(nextPrice);
  const dupOnUpdate = db
    .prepare(`
      SELECT id, item_name FROM inventory_items
      WHERE LOWER(item_name) = LOWER(?)
        AND LOWER(unit) = LOWER(?)
        AND ROUND(unit_price, 2) = ROUND(?, 2)
        AND id != ?
    `)
    .get(nextName, nextUnit, roundedNextPrice, id) as any;
  if (dupOnUpdate) {
    return NextResponse.json(
      {
        error: `Another record with identical name, unit, and unit price (₱${roundedNextPrice.toFixed(2)}) already exists.`,
      },
      { status: 409 }
    );
  }

  const totalValue = roundCurrency(nextQty * nextPrice);

  withTransaction(() => {
    db.prepare(`
      UPDATE inventory_items
      SET item_code = ?, item_name = ?, description = ?, category = ?, quantity = ?, unit = ?,
          unit_price = ?, total_value = ?, min_stock_level = ?, supplier = ?, date_purchased = ?,
          condition = ?, remarks = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      normalizedCode,
      nextName,
      description !== undefined ? String(description).trim() : existing.description,
      nextCat,
      nextQty,
      nextUnit,
      roundedNextPrice,
      totalValue,
      nextMinStock,
      supplier !== undefined ? String(supplier).trim() : existing.supplier,
      date_purchased !== undefined ? String(date_purchased).trim() : existing.date_purchased,
      nextCondition,
      remarks !== undefined ? String(remarks).trim() : existing.remarks,
      auth.user.id,
      id
    );

    const changeQty = nextQty - existing.quantity;
    db.prepare(`
      INSERT INTO inventory_transactions (
        item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
        unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
      ) VALUES (?, ?, 'Update', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      nextName,
      existing.quantity,
      changeQty,
      nextQty,
      roundedNextPrice,
      totalValue,
      normalizedCode || `ITEM-${id}`,
      'Item record updated',
      auth.user.id,
      auth.user.full_name
    );
  });

  const updated = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  logActivity(req, auth.user, 'UPDATE_ITEM', 'Inventory', id, `Updated item "${nextName}"`);
  return NextResponse.json({ item: updated });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'staff');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 });
  }

  withTransaction(() => {
    db.prepare(`
      INSERT INTO inventory_transactions (
        item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
        unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
      ) VALUES (?, ?, 'Deletion', ?, ?, 0, ?, 0, ?, ?, ?, ?)
    `).run(
      id,
      existing.item_name,
      existing.quantity,
      -existing.quantity,
      existing.unit_price,
      existing.item_code || `ITEM-${id}`,
      'Item deleted from active inventory',
      auth.user.id,
      auth.user.full_name
    );

    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
  });

  logActivity(req, auth.user, 'DELETE_ITEM', 'Inventory', id, `Deleted item "${existing.item_name}"`);
  return NextResponse.json({ message: 'Inventory item deleted.' });
}
