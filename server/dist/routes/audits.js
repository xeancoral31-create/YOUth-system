"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const auditLog_1 = require("../middleware/auditLog");
const format_1 = require("../utils/format");
const archiveResetService_1 = require("../services/archiveResetService");
const router = (0, express_1.Router)();
const VALID_OBSERVED_CONDITIONS = ['New', 'Good', 'Fair', 'Needs Repair', 'Damaged', 'Condemned', 'Missing'];
router.use(auth_1.authenticate);
function getAuditSummary(auditId) {
    const db = (0, database_1.getDb)();
    const agg = db
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
        .get(auditId);
    return agg;
}
// List all audits with live aggregated totals
router.get('/', (_req, res) => {
    const db = (0, database_1.getDb)();
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
    res.json({ audits });
});
// Get single audit with items and history
router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
    if (!audit) {
        res.status(404).json({ error: 'Audit record not found.' });
        return;
    }
    const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY item_name ASC').all(id);
    const history = db.prepare('SELECT * FROM audit_history WHERE audit_id = ? ORDER BY id DESC').all(id);
    const summary = getAuditSummary(id);
    res.json({ audit: { ...audit, ...summary }, items, history });
});
// Create new audit
router.post('/', (0, auth_1.authorize)('admin', 'auditor'), (req, res) => {
    const { audit_ref, title, audit_date, auditor_name, remarks, item_ids, include_all_items } = req.body ?? {};
    if (!audit_ref || typeof audit_ref !== 'string' || !audit_ref.trim()) {
        res.status(400).json({ error: 'Audit Reference Number is required.' });
        return;
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Audit title is required.' });
        return;
    }
    if (!audit_date || typeof audit_date !== 'string' || !audit_date.trim()) {
        res.status(400).json({ error: 'Audit date is required.' });
        return;
    }
    const db = (0, database_1.getDb)();
    const dupRef = db.prepare('SELECT id FROM audits WHERE LOWER(audit_ref) = LOWER(?)').get(audit_ref.trim());
    if (dupRef) {
        res.status(409).json({ error: `Audit Reference Number "${audit_ref.trim()}" already exists.` });
        return;
    }
    let inventoryItems = [];
    if (include_all_items) {
        inventoryItems = db.prepare('SELECT * FROM inventory_items ORDER BY item_name ASC').all();
    }
    else if (Array.isArray(item_ids) && item_ids.length > 0) {
        const placeholders = item_ids.map(() => '?').join(',');
        inventoryItems = db
            .prepare(`SELECT * FROM inventory_items WHERE id IN (${placeholders}) ORDER BY item_name ASC`)
            .all(...item_ids.map(Number));
    }
    if (inventoryItems.length === 0) {
        res.status(400).json({
            error: 'Cannot create an audit without inventory items. Register inventory items first or select at least one item.',
        });
        return;
    }
    const resolvedAuditorName = auditor_name && typeof auditor_name === 'string' && auditor_name.trim()
        ? auditor_name.trim()
        : req.user.full_name;
    const auditId = (0, database_1.withTransaction)(() => {
        const result = db
            .prepare(`
        INSERT INTO audits (audit_ref, title, audit_date, auditor_id, auditor_name, status, remarks, created_by)
        VALUES (?, ?, ?, ?, ?, 'In Progress', ?, ?)
      `)
            .run(audit_ref.trim(), title.trim(), audit_date.trim(), req.user.id, resolvedAuditorName, (remarks ?? '').trim(), req.user.id);
        const newAuditId = Number(result.lastInsertRowid);
        const insertItemStmt = db.prepare(`
      INSERT INTO audit_items (
        audit_id, inventory_item_id, item_code, item_name, category, unit, unit_price,
        recorded_qty, actual_qty, discrepancy, recorded_value, actual_value, financial_difference,
        recorded_condition, observed_condition, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const item of inventoryItems) {
            const recordedVal = (0, format_1.roundCurrency)(item.quantity * item.unit_price);
            insertItemStmt.run(newAuditId, item.id, item.item_code || '', item.item_name, item.category, item.unit, item.unit_price, item.quantity, item.quantity, 0, recordedVal, recordedVal, 0, item.condition, item.condition, '');
        }
        db.prepare(`
      INSERT INTO audit_history (audit_id, action, details, performed_by, performed_by_name)
      VALUES (?, 'CREATED', ?, ?, ?)
    `).run(newAuditId, `Audit ${audit_ref.trim()} created with ${inventoryItems.length} inventory item(s).`, req.user.id, req.user.full_name);
        return newAuditId;
    });
    (0, auditLog_1.logActivity)(req, 'CREATE_AUDIT', 'Audits', auditId, `Created audit ${audit_ref.trim()} (${inventoryItems.length} items)`);
    res.status(201).json({ audit: db.prepare('SELECT * FROM audits WHERE id = ?').get(auditId) });
});
// Update audit details and item counts (strictly blocked if Completed)
router.put('/:id', (0, auth_1.authorize)('admin', 'auditor'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
    if (!audit) {
        res.status(404).json({ error: 'Audit record not found.' });
        return;
    }
    if (audit.status === 'Completed') {
        res.status(403).json({ error: 'This audit is finalized (Completed) and locked against any modification.' });
        return;
    }
    const { title, audit_date, auditor_name, status, findings, recommendations, remarks, approved_by, items } = req.body ?? {};
    const nextStatus = status === 'Draft' || status === 'In Progress' ? status : audit.status;
    try {
        (0, database_1.withTransaction)(() => {
            db.prepare(`
      UPDATE audits
      SET title = ?, audit_date = ?, auditor_name = ?, status = ?, findings = ?,
          recommendations = ?, remarks = ?, approved_by = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(title !== undefined ? String(title).trim() : audit.title, audit_date !== undefined ? String(audit_date).trim() : audit.audit_date, auditor_name !== undefined ? String(auditor_name).trim() : audit.auditor_name, nextStatus, findings !== undefined ? String(findings).trim() : audit.findings, recommendations !== undefined ? String(recommendations).trim() : audit.recommendations, remarks !== undefined ? String(remarks).trim() : audit.remarks, approved_by !== undefined ? String(approved_by).trim() : audit.approved_by, id);
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
                        .get(Number(row.id), id);
                    if (!existingRow)
                        continue;
                    const actualQty = Number(row.actual_qty);
                    if (!Number.isFinite(actualQty) || actualQty < 0) {
                        throw new Error(`Invalid actual quantity for "${existingRow.item_name}". Must be >= 0.`);
                    }
                    const observedCond = row.observed_condition || existingRow.observed_condition;
                    if (!VALID_OBSERVED_CONDITIONS.includes(observedCond)) {
                        throw new Error(`Invalid observed condition for "${existingRow.item_name}".`);
                    }
                    const discrepancy = actualQty - existingRow.recorded_qty;
                    const actualValue = (0, format_1.roundCurrency)(actualQty * existingRow.unit_price);
                    const financialDiff = (0, format_1.roundCurrency)(actualValue - existingRow.recorded_value);
                    updateItemStmt.run(actualQty, discrepancy, actualValue, financialDiff, observedCond, row.remarks !== undefined ? String(row.remarks).trim() : existingRow.remarks, existingRow.id, id);
                    updatedCount++;
                }
            }
            db.prepare(`
      INSERT INTO audit_history (audit_id, action, details, performed_by, performed_by_name)
      VALUES (?, 'UPDATED', ?, ?, ?)
    `).run(id, `Updated audit details${updatedCount > 0 ? ` and ${updatedCount} item count(s)` : ''}.`, req.user.id, req.user.full_name);
        });
    }
    catch (err) {
        res.status(400).json({ error: err.message });
        return;
    }
    (0, auditLog_1.logActivity)(req, 'UPDATE_AUDIT', 'Audits', id, `Updated audit ${audit.audit_ref}`);
    res.json({ audit: { ...db.prepare('SELECT * FROM audits WHERE id = ?').get(id), ...getAuditSummary(id) } });
});
// Finalize audit (irreversible lock)
router.post('/:id/finalize', (0, auth_1.authorize)('admin', 'auditor'), (req, res) => {
    const id = Number(req.params.id);
    const { reconcile_inventory, findings, recommendations, approved_by } = req.body ?? {};
    const db = (0, database_1.getDb)();
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
    if (!audit) {
        res.status(404).json({ error: 'Audit record not found.' });
        return;
    }
    if (audit.status === 'Completed') {
        res.status(409).json({ error: 'Audit is already finalized.' });
        return;
    }
    const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ?').all(id);
    if (items.length === 0) {
        res.status(400).json({ error: 'Cannot finalize an audit with zero items.' });
        return;
    }
    const shouldReconcile = Boolean(reconcile_inventory);
    let archiveResult;
    try {
        archiveResult = (0, database_1.withTransaction)(() => {
            if (shouldReconcile) {
                for (const item of items) {
                    if (item.inventory_item_id && item.discrepancy !== 0) {
                        const inv = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item.inventory_item_id);
                        if (inv) {
                            const newTotal = (0, format_1.roundCurrency)(item.actual_qty * inv.unit_price);
                            db.prepare(`
              UPDATE inventory_items
              SET quantity = ?, total_value = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
              WHERE id = ?
            `).run(item.actual_qty, newTotal, req.user.id, inv.id);
                            db.prepare(`
              INSERT INTO inventory_transactions (
                item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
                unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
              ) VALUES (?, ?, 'Audit Reconciliation', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(inv.id, inv.item_name, inv.quantity, item.actual_qty - inv.quantity, item.actual_qty, inv.unit_price, newTotal, audit.audit_ref, `Reconciled from finalized audit ${audit.audit_ref}`, req.user.id, req.user.full_name);
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
    `).run((findings ?? '').trim(), (recommendations ?? '').trim(), (approved_by ?? '').trim(), shouldReconcile ? 1 : 0, req.user.id, req.user.full_name, id);
            db.prepare(`
      INSERT INTO audit_history (audit_id, action, details, performed_by, performed_by_name)
      VALUES (?, 'FINALIZED', ?, ?, ?)
    `).run(id, `Audit finalized and locked.${shouldReconcile ? ' Inventory quantities reconciled to actual counts.' : ''}`, req.user.id, req.user.full_name);
            const finalizedAudit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
            const finalizedItems = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY id ASC').all(id);
            const summary = getAuditSummary(id);
            // Automatically archive inventory snapshot & audit details, then reset active inventory
            return (0, archiveResetService_1.archiveAndResetInventory)({
                triggerType: 'Audit Completed',
                performedById: req.user.id,
                performedByName: req.user.full_name,
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
    }
    catch (err) {
        res.status(500).json({
            error: `Inventory could not be reset because historical records were not successfully saved: ${err.message}`,
        });
        return;
    }
    (0, auditLog_1.logActivity)(req, 'FINALIZE_AUDIT', 'Audits', id, `Finalized audit ${audit.audit_ref} and archived inventory`);
    res.json({
        audit: { ...db.prepare('SELECT * FROM audits WHERE id = ?').get(id), ...getAuditSummary(id) },
        archiveResult,
    });
});
// Delete audit (strictly blocked if Completed)
router.delete('/:id', (0, auth_1.authorize)('admin', 'auditor'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
    if (!audit) {
        res.status(404).json({ error: 'Audit record not found.' });
        return;
    }
    if (audit.status === 'Completed') {
        res.status(403).json({ error: 'Completed audits cannot be deleted.' });
        return;
    }
    db.prepare('DELETE FROM audits WHERE id = ?').run(id);
    (0, auditLog_1.logActivity)(req, 'DELETE_AUDIT', 'Audits', id, `Deleted draft/in-progress audit ${audit.audit_ref}`);
    res.json({ message: 'Audit deleted.' });
});
exports.default = router;
