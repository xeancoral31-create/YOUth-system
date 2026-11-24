import { Router, Response } from 'express';
import { getDb, getDbSettings, withTransaction } from '../db/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { logActivity } from '../middleware/auditLog';
import { roundCurrency } from '../utils/format';

const router = Router();
const VALID_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned'];

router.use(authenticate);

// List inventory items with search, filter, and sorting
router.get('/', (req: AuthRequest, res: Response) => {
  const { search = '', category = '', condition = '', stock_status = '', sort_by = 'updated_at', sort_dir = 'desc' } =
    req.query as Record<string, string>;

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

  res.json({
    items,
    categories: categories.map((c) => c.category),
  });
});

// Get all transactions across inventory
router.get('/transactions/all', (req: AuthRequest, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const db = getDb();
  const transactions = db
    .prepare('SELECT * FROM inventory_transactions ORDER BY id DESC LIMIT ?')
    .all(limit);
  res.json({ transactions });
});

// Get single item + its transactions
router.get('/:id', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  if (!item) {
    res.status(404).json({ error: 'Inventory item not found.' });
    return;
  }
  const transactions = db
    .prepare('SELECT * FROM inventory_transactions WHERE item_id = ? ORDER BY id DESC')
    .all(id);
  res.json({ item, transactions });
});

// Create inventory item (manual entry, strict validation, duplicate check)
router.post('/', authorize('admin', 'staff'), (req: AuthRequest, res: Response) => {
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
    confirmDuplicate,
  } = req.body ?? {};

  if (!item_name || typeof item_name !== 'string' || !item_name.trim()) {
    res.status(400).json({ error: 'Item name is required.' });
    return;
  }
  if (!unit || typeof unit !== 'string' || !unit.trim()) {
    res.status(400).json({ error: 'Unit of measurement is required.' });
    return;
  }
  if (!condition || !VALID_CONDITIONS.includes(condition)) {
    res.status(400).json({ error: `Valid condition is required (${VALID_CONDITIONS.join(', ')}).` });
    return;
  }

  const settings = getDbSettings();
  const defaultMin = Number(settings.default_min_stock_level) || 5;
  const qty = Number(quantity);
  const price = Number(unit_price);
  const minStock = min_stock_level === '' || min_stock_level === undefined ? defaultMin : Number(min_stock_level);

  if (!Number.isFinite(qty) || qty < 0) {
    res.status(400).json({ error: 'Quantity must be a valid non-negative number.' });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: 'Unit price must be a valid non-negative number.' });
    return;
  }
  if (!Number.isFinite(minStock) || minStock < 0) {
    res.status(400).json({ error: 'Minimum stock level must be a valid non-negative number.' });
    return;
  }

  const db = getDb();
  const normalizedCode = item_code && typeof item_code === 'string' && item_code.trim() ? item_code.trim() : null;

  if (normalizedCode) {
    const codeExists = db.prepare('SELECT id, item_name FROM inventory_items WHERE LOWER(item_code) = LOWER(?)').get(normalizedCode) as any;
    if (codeExists) {
      res.status(409).json({
        error: `Item code "${normalizedCode}" is already assigned to "${codeExists.item_name}".`,
      });
      return;
    }
  }

  const resolvedCategory = category && typeof category === 'string' && category.trim() ? category.trim() : 'General';

  // Allow same item when unit price differs; block identical name + unit + unit_price
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
    res.status(409).json({
      code: 'DUPLICATE_DETECTED',
      error: `Identical item "${dup.item_name}" (${dup.unit}, ₱${roundedPrice.toFixed(2)}) already exists. Update its quantity or use a different unit price.`,
      existingItem: dup,
    });
    return;
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
        roundCurrency(price),
        totalValue,
        minStock,
        (supplier ?? '').trim(),
        (date_purchased ?? '').trim(),
        condition,
        (remarks ?? '').trim(),
        req.user!.id,
        req.user!.id
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
      roundCurrency(price),
      totalValue,
      normalizedCode || `ITEM-${newId}`,
      'Manual initial item registration',
      req.user!.id,
      req.user!.full_name
    );

    return newId;
  });

  const created = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId);
  logActivity(req, 'CREATE_ITEM', 'Inventory', itemId, `Registered item "${item_name.trim()}" (${qty} ${unit.trim()})`);
  res.status(201).json({ item: created });
});

// Update inventory item
router.put('/:id', authorize('admin', 'staff'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Inventory item not found.' });
    return;
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
  } = req.body ?? {};

  const nextName = item_name !== undefined ? String(item_name).trim() : existing.item_name;
  const nextCat = category !== undefined && String(category).trim() ? String(category).trim() : existing.category;
  const nextUnit = unit !== undefined ? String(unit).trim() : existing.unit;
  const nextCondition = condition !== undefined ? String(condition) : existing.condition;
  const nextQty = quantity !== undefined ? Number(quantity) : existing.quantity;
  const nextPrice = unit_price !== undefined ? Number(unit_price) : existing.unit_price;
  const nextMinStock = min_stock_level !== undefined ? Number(min_stock_level) : existing.min_stock_level;

  if (!nextName || !nextUnit) {
    res.status(400).json({ error: 'Item name and unit of measurement cannot be empty.' });
    return;
  }
  if (!VALID_CONDITIONS.includes(nextCondition)) {
    res.status(400).json({ error: 'Invalid condition value.' });
    return;
  }
  if (!Number.isFinite(nextQty) || nextQty < 0 || !Number.isFinite(nextPrice) || nextPrice < 0 || !Number.isFinite(nextMinStock) || nextMinStock < 0) {
    res.status(400).json({ error: 'Quantity, unit price, and minimum stock level must be non-negative numbers.' });
    return;
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
      res.status(409).json({ error: `Item code "${normalizedCode}" is already used by another item.` });
      return;
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
    res.status(409).json({
      error: `Another record with identical name, unit, and unit price (₱${roundedNextPrice.toFixed(2)}) already exists.`,
    });
    return;
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
      roundCurrency(nextPrice),
      totalValue,
      nextMinStock,
      supplier !== undefined ? String(supplier).trim() : existing.supplier,
      date_purchased !== undefined ? String(date_purchased).trim() : existing.date_purchased,
      nextCondition,
      remarks !== undefined ? String(remarks).trim() : existing.remarks,
      req.user!.id,
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
      roundCurrency(nextPrice),
      totalValue,
      normalizedCode || `ITEM-${id}`,
      'Item record updated',
      req.user!.id,
      req.user!.full_name
    );
  });

  const updated = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  logActivity(req, 'UPDATE_ITEM', 'Inventory', id, `Updated item "${nextName}"`);
  res.json({ item: updated });
});

// Stock adjustment endpoint
router.post('/:id/adjust', authorize('admin', 'staff'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { adjustment_type, quantity_change, reason, reference_no } = req.body ?? {};

  const validTypes = ['Stock In', 'Stock Out', 'Adjustment', 'Damage Write-Off'];
  if (!validTypes.includes(adjustment_type)) {
    res.status(400).json({ error: `Invalid adjustment type. Allowed: ${validTypes.join(', ')}` });
    return;
  }

  const amount = Number(quantity_change);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: 'Adjustment quantity must be a valid non-negative number.' });
    return;
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    res.status(400).json({ error: 'A reason for the stock adjustment is required.' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Inventory item not found.' });
    return;
  }

  let newQty = existing.quantity;
  let change = 0;

  if (adjustment_type === 'Stock In') {
    change = amount;
    newQty = existing.quantity + amount;
  } else if (adjustment_type === 'Stock Out' || adjustment_type === 'Damage Write-Off') {
    if (amount > existing.quantity) {
      res.status(400).json({
        error: `Cannot deduct ${amount} ${existing.unit}; only ${existing.quantity} ${existing.unit} available in stock.`,
      });
      return;
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
    `).run(newQty, newTotalValue, req.user!.id, id);

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
      req.user!.id,
      req.user!.full_name
    );
  });

  const updated = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id);
  logActivity(
    req,
    'ADJUST_STOCK',
    'Inventory',
    id,
    `${adjustment_type} on "${existing.item_name}": ${existing.quantity} -> ${newQty} (${reason.trim()})`
  );
  res.json({ item: updated });
});

// Delete inventory item
router.delete('/:id', authorize('admin', 'staff'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'Inventory item not found.' });
    return;
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
      req.user!.id,
      req.user!.full_name
    );

    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
  });
  logActivity(req, 'DELETE_ITEM', 'Inventory', id, `Deleted item "${existing.item_name}"`);
  res.json({ message: 'Inventory item deleted.' });
});

export default router;
