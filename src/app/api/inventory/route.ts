import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDbSettings, withTransaction } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { roundCurrency } from '@/lib/format';

const VALID_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned'];

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') || '';
  const category = sp.get('category') || '';
  const condition = sp.get('condition') || '';
  const stock_status = sp.get('stock_status') || '';
  const sort_by = sp.get('sort_by') || 'updated_at';
  const sort_dir = sp.get('sort_dir') || 'desc';

  const allowedSortColumns: Record<string, string> = {
    item_code: 'item_code',
    item_name: 'item_name',
    category: 'category',
    quantity: 'quantity',
    unit_price: 'unit_price',
    total_value: 'total_value',
    date_purchased: 'date_purchased',
    condition: 'condition',
    updated_at: 'updated_at',
    created_at: 'created_at',
  };

  const orderCol = allowedSortColumns[sort_by] || 'updated_at';
  const orderDir = sort_dir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const conditions: string[] = [];
  const params: any[] = [];

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push('(item_name LIKE ? OR item_code LIKE ? OR description LIKE ? OR supplier LIKE ? OR category LIKE ?)');
    params.push(q, q, q, q, q);
  }
  if (category.trim()) {
    conditions.push('category = ?');
    params.push(category.trim());
  }
  if (condition.trim()) {
    conditions.push('condition = ?');
    params.push(condition.trim());
  }
  if (stock_status === 'out_of_stock') {
    conditions.push('quantity <= 0');
  } else if (stock_status === 'low_stock') {
    conditions.push('quantity > 0 AND quantity <= min_stock_level');
  } else if (stock_status === 'in_stock') {
    conditions.push('quantity > min_stock_level');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const db = getDb();

  const items = db.prepare(`SELECT * FROM inventory_items ${whereClause} ORDER BY ${orderCol} ${orderDir}`).all(...params);
  const categories = db.prepare('SELECT DISTINCT category FROM inventory_items ORDER BY category ASC').all() as {
    category: string;
  }[];

  return NextResponse.json({
    items,
    categories: categories.map((c) => c.category),
  });
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin', 'staff');
  if (auth.error) return auth.error;

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

  if (!item_name || typeof item_name !== 'string' || !item_name.trim()) {
    return NextResponse.json({ error: 'Item name is required.' }, { status: 400 });
  }
  if (!unit || typeof unit !== 'string' || !unit.trim()) {
    return NextResponse.json({ error: 'Unit of measurement is required.' }, { status: 400 });
  }
  if (!condition || !VALID_CONDITIONS.includes(condition)) {
    return NextResponse.json(
      { error: `Valid condition is required (${VALID_CONDITIONS.join(', ')}).` },
      { status: 400 }
    );
  }

  const settings = getDbSettings();
  const defaultMin = Number(settings.default_min_stock_level) || 5;
  const qty = Number(quantity);
  const price = Number(unit_price);
  const minStock = min_stock_level === '' || min_stock_level === undefined ? defaultMin : Number(min_stock_level);

  if (!Number.isFinite(qty) || qty < 0) {
    return NextResponse.json({ error: 'Quantity must be a valid non-negative number.' }, { status: 400 });
  }
  if (!Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'Unit price must be a valid non-negative number.' }, { status: 400 });
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    return NextResponse.json({ error: 'Minimum stock level must be a valid non-negative number.' }, { status: 400 });
  }

  const db = getDb();
  const normalizedCode = item_code && typeof item_code === 'string' && item_code.trim() ? item_code.trim() : null;

  if (normalizedCode) {
    const codeExists = db
      .prepare('SELECT id, item_name FROM inventory_items WHERE LOWER(item_code) = LOWER(?)')
      .get(normalizedCode) as any;
    if (codeExists) {
      return NextResponse.json(
        { error: `Item code "${normalizedCode}" is already assigned to "${codeExists.item_name}".` },
        { status: 409 }
      );
    }
  }

  const resolvedCategory = category && typeof category === 'string' && category.trim() ? category.trim() : 'General';
  const roundedPrice = roundCurrency(price);
  const dup = db
    .prepare(`
      SELECT id, item_name, unit, unit_price, quantity
      FROM inventory_items
      WHERE LOWER(item_name) = LOWER(?)
        AND LOWER(unit) = LOWER(?)
        AND ROUND(unit_price, 2) = ROUND(?, 2)
    `)
    .get(item_name.trim(), unit.trim(), roundedPrice) as any;

  if (dup) {
    return NextResponse.json(
      {
        code: 'DUPLICATE_DETECTED',
        error: `Identical item "${dup.item_name}" (${dup.unit}, ₱${roundedPrice.toFixed(2)}) already exists. Update its quantity or use a different unit price.`,
        existingItem: dup,
      },
      { status: 409 }
    );
  }

  const totalValue = roundCurrency(qty * price);

  const itemId = withTransaction(() => {
    const result = db
      .prepare(`
        INSERT INTO inventory_items (
          item_code, item_name, description, category, quantity, unit,
          unit_price, total_value, min_stock_level, supplier, date_purchased,
          condition, remarks, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        normalizedCode,
        item_name.trim(),
        (description ?? '').trim(),
        resolvedCategory,
        qty,
        unit.trim(),
        roundedPrice,
        totalValue,
        minStock,
        (supplier ?? '').trim(),
        (date_purchased ?? '').trim(),
        condition,
        (remarks ?? '').trim(),
        auth.user.id,
        auth.user.id
      );

    const newId = Number(result.lastInsertRowid);

    db.prepare(`
      INSERT INTO inventory_transactions (
        item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
        unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
      ) VALUES (?, ?, 'Initial Entry', 0, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      item_name.trim(),
      qty,
      qty,
      roundedPrice,
      totalValue,
      normalizedCode || `ITEM-${newId}`,
      'Manual initial item registration',
      auth.user.id,
      auth.user.full_name
    );

    return newId;
  });

  const created = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  logActivity(req, auth.user, 'CREATE_ITEM', 'Inventory', itemId, `Registered item "${item_name.trim()}" (${qty} ${unit.trim()})`);
  return NextResponse.json({ item: created }, { status: 201 });
}
