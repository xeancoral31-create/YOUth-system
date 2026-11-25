import { NextRequest, NextResponse } from 'next/server';
import { getDb, withTransaction } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { roundCurrency } from '@/lib/format';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'staff');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const { adjustment_type, quantity_change, reason, reference_no } = await req.json().catch(() => ({}));

  const validTypes = ['Stock In', 'Stock Out', 'Adjustment', 'Damage Write-Off'];
  if (!validTypes.includes(adjustment_type)) {
    return NextResponse.json({ error: `Invalid adjustment type. Allowed: ${validTypes.join(', ')}` }, { status: 400 });
  }

  const amount = Number(quantity_change);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Adjustment quantity must be a valid non-negative number.' }, { status: 400 });
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: 'A reason for the stock adjustment is required.' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'Inventory item not found.' }, { status: 404 });
  }

  let newQty = existing.quantity;
  let change = 0;

  if (adjustment_type === 'Stock In') {
    change = amount;
    newQty = existing.quantity + amount;
  } else if (adjustment_type === 'Stock Out' || adjustment_type === 'Damage Write-Off') {
    if (amount > existing.quantity) {
      return NextResponse.json(
        {
          error: `Cannot deduct ${amount} ${existing.unit}; only ${existing.quantity} ${existing.unit} available in stock.`,
        },
        { status: 400 }
      );
    }
    change = -amount;
    newQty = existing.quantity - amount;
  } else if (adjustment_type === 'Adjustment') {
    newQty = amount;
    change = amount - existing.quantity;
  }

  const newTotalValue = roundCurrency(newQty * existing.unit_price);

  withTransaction(() => {
    db.prepare(`
      UPDATE inventory_items
      SET quantity = ?, total_value = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(newQty, newTotalValue, auth.user.id, id);

    db.prepare(`
      INSERT INTO inventory_transactions (
        item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
        unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      existing.item_name,
      adjustment_type,
      existing.quantity,
      change,
      newQty,
      existing.unit_price,
      newTotalValue,
      (reference_no ?? '').trim(),
      reason.trim(),
      auth.user.id,
      auth.user.full_name
    );
  });

  const updated = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  logActivity(
    req,
    auth.user,
    'ADJUST_STOCK',
    'Inventory',
    id,
    `${adjustment_type} on "${existing.item_name}": ${existing.quantity} -> ${newQty} (${reason.trim()})`
  );
  return NextResponse.json({ item: updated });
}
