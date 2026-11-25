import { NextRequest, NextResponse } from 'next/server';
import { getDb, withTransaction } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { roundCurrency } from '@/lib/format';

const VALID_OBSERVED_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned', 'Missing'];

export function getAuditSummary(auditId: number) {
  const db = getDb();
  return db
    .prepare(`
      SELECT
        COUNT(*) AS total_items,
        COALESCE(SUM(recorded_value), 0) AS total_recorded_value,
        COALESCE(SUM(actual_value), 0) AS total_actual_value,
        COALESCE(SUM(financial_difference), 0) AS total_financial_difference,
        COALESCE(SUM(CASE WHEN discrepancy < 0 THEN 1 ELSE 0 END), 0) AS shortage_count,
        COALESCE(SUM(CASE WHEN discrepancy > 0 THEN 1 ELSE 0 END), 0) AS excess_count,
        COALESCE(SUM(CASE WHEN discrepancy = 0 THEN 1 ELSE 0 END), 0) AS matched_count
      FROM audit_items
      WHERE audit_id = ?
    `)
    .get(auditId) as any;
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as any;
  if (!audit) {
    return NextResponse.json({ error: 'Audit record not found.' }, { status: 404 });
  }
  const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY item_name ASC').all(id);
  const history = db.prepare('SELECT * FROM audit_history WHERE audit_id = ? ORDER BY id DESC').all(id);
  const summary = getAuditSummary(id);

  return NextResponse.json({ audit: { ...audit, ...summary }, items, history });
}

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as any;

  if (!audit) {
    return NextResponse.json({ error: 'Audit record not found.' }, { status: 404 });
  }
  if (audit.status === 'Completed') {
    return NextResponse.json(
      { error: 'This audit is finalized (Completed) and locked against any modification.' },
      { status: 403 }
    );
  }

  const { title, audit_date, auditor_name, status, findings, recommendations, remarks, approved_by, items } =
    await req.json().catch(() => ({}));

  const nextStatus = status === 'Draft' || status === 'In Progress' ? status : audit.status;

  try {
    withTransaction(() => {
      db.prepare(`
        UPDATE audits
        SET title = ?, audit_date = ?, auditor_name = ?, status = ?, findings = ?,
            recommendations = ?, remarks = ?, approved_by = ?, updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        title !== undefined ? String(title).trim() : audit.title,
        audit_date !== undefined ? String(audit_date).trim() : audit.audit_date,
        auditor_name !== undefined ? String(auditor_name).trim() : audit.auditor_name,
        nextStatus,
        findings !== undefined ? String(findings).trim() : audit.findings,
        recommendations !== undefined ? String(recommendations).trim() : audit.recommendations,
        remarks !== undefined ? String(remarks).trim() : audit.remarks,
        approved_by !== undefined ? String(approved_by).trim() : audit.approved_by,
        id
      );

      let updatedCount = 0;
      if (Array.isArray(items)) {
        const updateItemStmt = db.prepare(`
          UPDATE audit_items
          SET actual_qty = ?, discrepancy = ?, actual_value = ?, financial_difference = ?,
              observed_condition = ?, remarks = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ? AND audit_id = ?
        `);

        for (const row of items) {
          const existingRow = db
            .prepare('SELECT * FROM audit_items WHERE id = ? AND audit_id = ?')
            .get(Number(row.id), id) as any;
          if (!existingRow) continue;

          const actualQty = Number(row.actual_qty);
          if (!Number.isFinite(actualQty) || actualQty < 0) {
            throw new Error(`Invalid actual quantity for "${existingRow.item_name}". Must be >= 0.`);
          }

          const observedCond = row.observed_condition || existingRow.observed_condition;
          if (!VALID_OBSERVED_CONDITIONS.includes(observedCond)) {
            throw new Error(`Invalid observed condition for "${existingRow.item_name}".`);
          }

          const discrepancy = actualQty - existingRow.recorded_qty;
          const actualValue = roundCurrency(actualQty * existingRow.unit_price);
          const financialDiff = roundCurrency(actualValue - existingRow.recorded_value);

          updateItemStmt.run(
            actualQty,
            discrepancy,
            actualValue,
            financialDiff,
            observedCond,
            row.remarks !== undefined ? String(row.remarks).trim() : existingRow.remarks,
            existingRow.id,
            id
          );
          updatedCount++;
        }
      }

      db.prepare(`
        INSERT INTO audit_history (audit_id, action, details, performed_by, performed_by_name)
        VALUES (?, 'UPDATED', ?, ?, ?)
      `).run(
        id,
        `Updated audit details${updatedCount > 0 ? ` and ${updatedCount} item count(s)` : ''}.`,
        auth.user.id,
        auth.user.full_name
      );
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  logActivity(req, auth.user, 'UPDATE_AUDIT', 'Audits', id, `Updated audit ${audit.audit_ref}`);
  return NextResponse.json({ audit: { ...db.prepare('SELECT * FROM audits WHERE id = ?').get(id), ...getAuditSummary(id) } });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as any;

  if (!audit) {
    return NextResponse.json({ error: 'Audit record not found.' }, { status: 404 });
  }
  if (audit.status === 'Completed') {
    return NextResponse.json({ error: 'Completed audits cannot be deleted.' }, { status: 403 });
  }

  db.prepare('DELETE FROM audits WHERE id = ?').run(id);
  logActivity(req, auth.user, 'DELETE_AUDIT', 'Audits', id, `Deleted draft/in-progress audit ${audit.audit_ref}`);
  return NextResponse.json({ message: 'Audit deleted.' });
}
