import { NextRequest, NextResponse } from 'next/server';
import { getDb, withTransaction } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { roundCurrency } from '@/lib/format';
import { archiveAndResetInventory } from '@/lib/archiveResetService';
import { getAuditSummary } from '../route';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const { reconcile_inventory, findings, recommendations, approved_by } = await req.json().catch(() => ({}));
  const db = getDb();

  const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as any;
  if (!audit) {
    return NextResponse.json({ error: 'Audit record not found.' }, { status: 404 });
  }
  if (audit.status === 'Completed') {
    return NextResponse.json({ error: 'Audit is already finalized.' }, { status: 409 });
  }

  const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ?').all(id) as any[];
  if (items.length === 0) {
    return NextResponse.json({ error: 'Cannot finalize an audit with zero items.' }, { status: 400 });
  }

  const shouldReconcile = Boolean(reconcile_inventory);
  let archiveResult: any;

  try {
    archiveResult = withTransaction(() => {
      if (shouldReconcile) {
        for (const item of items) {
          if (item.inventory_item_id && item.discrepancy !== 0) {
            const inv = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.inventory_item_id) as any;
            if (inv) {
              const newTotal = roundCurrency(item.actual_qty * inv.unit_price);
              db.prepare(`
                UPDATE inventory_items
                SET quantity = ?, total_value = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
                WHERE id = ?
              `).run(item.actual_qty, newTotal, auth.user.id, inv.id);

              db.prepare(`
                INSERT INTO inventory_transactions (
                  item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
                  unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
                ) VALUES (?, ?, 'Audit Reconciliation', ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                inv.id,
                inv.item_name,
                inv.quantity,
                item.actual_qty - inv.quantity,
                item.actual_qty,
                inv.unit_price,
                newTotal,
                audit.audit_ref,
                `Reconciled from finalized audit ${audit.audit_ref}`,
                auth.user.id,
                auth.user.full_name
              );
            }
          }
        }
      }

      db.prepare(`
        UPDATE audits
        SET status = 'Completed',
            findings = COALESCE(NULLIF(?, ''), findings),
            recommendations = COALESCE(NULLIF(?, ''), recommendations),
            approved_by = COALESCE(NULLIF(?, ''), approved_by),
            reconciled_inventory = ?,
            finalized_by = ?,
            finalized_by_name = ?,
            finalized_at = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(
        (findings ?? '').trim(),
        (recommendations ?? '').trim(),
        (approved_by ?? '').trim(),
        shouldReconcile ? 1 : 0,
        auth.user.id,
        auth.user.full_name,
        id
      );

      db.prepare(`
        INSERT INTO audit_history (audit_id, action, details, performed_by, performed_by_name)
        VALUES (?, 'FINALIZED', ?, ?, ?)
      `).run(
        id,
        `Audit finalized and locked.${shouldReconcile ? ' Inventory quantities reconciled to actual counts.' : ''}`,
        auth.user.id,
        auth.user.full_name
      );

      const finalizedAudit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id) as any;
      const finalizedItems = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY id ASC').all(id);
      const summary = getAuditSummary(id);

      return archiveAndResetInventory({
        triggerType: 'Audit Completed',
        performedById: auth.user.id,
        performedByName: auth.user.full_name,
        archiveRef: `AUDIT-${id}`,
        periodLabel: `Audit ${audit.audit_ref} (${audit.audit_date})`,
        auditId: id,
        auditRef: audit.audit_ref,
        auditDetails: {
          ...finalizedAudit,
          ...summary,
          items: finalizedItems,
        },
        inTransaction: true,
      });
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Inventory could not be reset because historical records were not successfully saved: ${err.message}` },
      { status: 500 }
    );
  }

  logActivity(req, auth.user, 'FINALIZE_AUDIT', 'Audits', id, `Finalized audit ${audit.audit_ref} and archived inventory`);
  return NextResponse.json({
    audit: { ...db.prepare('SELECT * FROM audits WHERE id = ?').get(id), ...getAuditSummary(id) },
    archiveResult,
  });
}
