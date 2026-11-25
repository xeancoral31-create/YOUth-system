import { NextRequest, NextResponse } from 'next/server';
import { getDb, withTransaction } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { roundCurrency } from '@/lib/format';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const db = getDb();
  const audits = db
    .prepare(`
      SELECT a.*,
        (SELECT COUNT(*) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_items,
        (SELECT COALESCE(SUM(ai.recorded_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_recorded_value,
        (SELECT COALESCE(SUM(ai.actual_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_actual_value,
        (SELECT COALESCE(SUM(ai.financial_difference), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_financial_difference,
        (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy < 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS shortage_count,
        (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy > 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS excess_count,
        (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy = 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS matched_count
      FROM audits a
      ORDER BY a.audit_date DESC, a.id DESC
    `)
    .all();

  return NextResponse.json({ audits });
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const { audit_ref, title, audit_date, auditor_name, remarks, item_ids, include_all_items } =
    await req.json().catch(() => ({}));

  if (!audit_ref || typeof audit_ref !== 'string' || !audit_ref.trim()) {
    return NextResponse.json({ error: 'Audit Reference Number is required.' }, { status: 400 });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Audit title is required.' }, { status: 400 });
  }
  if (!audit_date || typeof audit_date !== 'string' || !audit_date.trim()) {
    return NextResponse.json({ error: 'Audit date is required.' }, { status: 400 });
  }

  const db = getDb();
  const dupRef = db.prepare('SELECT id FROM audits WHERE LOWER(audit_ref) = LOWER(?)').get(audit_ref.trim());
  if (dupRef) {
    return NextResponse.json({ error: `Audit Reference Number "${audit_ref.trim()}" already exists.` }, { status: 409 });
  }

  let inventoryItems: any[] = [];
  if (include_all_items) {
    inventoryItems = db.prepare('SELECT * FROM inventory_items ORDER BY item_name ASC').all();
  } else if (Array.isArray(item_ids) && item_ids.length > 0) {
    const placeholders = item_ids.map(() => '?').join(',');
    inventoryItems = db
      .prepare(`SELECT * FROM inventory_items WHERE id IN (${placeholders}) ORDER BY item_name ASC`)
      .all(...item_ids.map(Number));
  }

  if (inventoryItems.length === 0) {
    return NextResponse.json(
      {
        error: 'Cannot create an audit without inventory items. Register inventory items first or select at least one item.',
      },
      { status: 400 }
    );
  }

  const resolvedAuditorName =
    auditor_name && typeof auditor_name === 'string' && auditor_name.trim()
      ? auditor_name.trim()
      : auth.user.full_name;

  const auditId = withTransaction(() => {
    const result = db
      .prepare(`
        INSERT INTO audits (audit_ref, title, audit_date, auditor_id, auditor_name, status, remarks, created_by)
        VALUES (?, ?, ?, ?, ?, 'In Progress', ?, ?)
      `)
      .run(
        audit_ref.trim(),
        title.trim(),
        audit_date.trim(),
        auth.user.id,
        resolvedAuditorName,
        (remarks ?? '').trim(),
        auth.user.id
      );

    const newAuditId = Number(result.lastInsertRowid);

    const insertItemStmt = db.prepare(`
      INSERT INTO audit_items (
        audit_id, inventory_item_id, item_code, item_name, category, unit, unit_price,
        recorded_qty, actual_qty, discrepancy, recorded_value, actual_value, financial_difference,
        recorded_condition, observed_condition, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of inventoryItems) {
      const recordedVal = roundCurrency(item.quantity * item.unit_price);
      insertItemStmt.run(
        newAuditId,
        item.id,
        item.item_code || '',
        item.item_name,
        item.category,
        item.unit,
        item.unit_price,
        item.quantity,
        item.quantity,
        0,
        recordedVal,
        recordedVal,
        0,
        item.condition,
        item.condition,
        ''
      );
    }

    db.prepare(`
      INSERT INTO audit_history (audit_id, action, details, performed_by, performed_by_name)
      VALUES (?, 'CREATED', ?, ?, ?)
    `).run(
      newAuditId,
      `Audit ${audit_ref.trim()} created with ${inventoryItems.length} inventory item(s).`,
      auth.user.id,
      auth.user.full_name
    );

    return newAuditId;
  });

  logActivity(req, auth.user, 'CREATE_AUDIT', 'Audits', auditId, `Created audit ${audit_ref.trim()} (${inventoryItems.length} items)`);
  return NextResponse.json({ audit: db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId) }, { status: 201 });
}
