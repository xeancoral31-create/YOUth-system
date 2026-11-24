"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeekPeriodInfo = getWeekPeriodInfo;
exports.archiveAndResetInventory = archiveAndResetInventory;
const node_crypto_1 = __importDefault(require("node:crypto"));
const database_1 = require("../db/database");
const format_1 = require("../utils/format");
function getWeekPeriodInfo(date = new Date()) {
    // Compute Sunday of the current week (0 = Sunday)
    const sunday = new Date(date);
    sunday.setHours(0, 0, 0, 0);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fmtShort = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    const sundayDateStr = fmt(sunday);
    return {
        weekKey: `WEEKLY-${sundayDateStr}`,
        periodLabel: `${fmtShort(sunday)} – ${fmtShort(saturday)}`,
        sundayDateStr,
    };
}
function executeArchiveAndReset(params) {
    const db = (0, database_1.getDb)();
    const items = db.prepare('SELECT * FROM inventory_items ORDER BY id ASC').all();
    const { periodLabel } = getWeekPeriodInfo();
    const resolvedPeriod = params.periodLabel || periodLabel;
    let resolvedRef = params.archiveRef;
    if (!resolvedRef) {
        if (params.triggerType === 'Audit Completed' && params.auditId) {
            resolvedRef = `AUDIT-${params.auditId}`;
        }
        else if (params.triggerType === 'Weekly Sunday Reset') {
            resolvedRef = getWeekPeriodInfo().weekKey;
        }
        else {
            // Deterministic hash of current items + date so accidental double-click print doesn't duplicate
            const fingerprint = JSON.stringify(items.map((i) => [i.id, i.item_name, i.quantity, i.unit_price, i.updated_at]));
            const hash = node_crypto_1.default.createHash('sha256').update(fingerprint).digest('hex').slice(0, 12);
            const day = new Date().toISOString().slice(0, 10);
            resolvedRef = `PRINT-${day}-${hash}`;
        }
    }
    // Duplicate prevention check
    const existingArchive = db
        .prepare('SELECT * FROM inventory_history_archives WHERE archive_ref = ?')
        .get(resolvedRef);
    if (existingArchive) {
        return {
            alreadyArchived: true,
            archive: existingArchive,
            archivedItemCount: existingArchive.registered_item_count,
        };
    }
    // If printing or weekly reset with 0 active items, do not create empty clutter records
    if (items.length === 0 && params.triggerType !== 'Audit Completed') {
        return {
            alreadyArchived: false,
            skippedEmpty: true,
            archive: null,
            archivedItemCount: 0,
        };
    }
    const totalUnits = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    const totalValue = (0, format_1.roundCurrency)(items.reduce((sum, i) => sum + Number(i.total_value || 0), 0));
    const archiveRes = db
        .prepare(`
      INSERT INTO inventory_history_archives (
        archive_ref, period_label, trigger_type, audit_id, audit_ref, audit_details_json,
        registered_item_count, total_units, total_inventory_value, performed_by, performed_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(resolvedRef, resolvedPeriod, params.triggerType, params.auditId ?? null, params.auditRef ?? '', JSON.stringify(params.auditDetails ?? {}), items.length, totalUnits, totalValue, params.performedById, params.performedByName);
    const archiveId = Number(archiveRes.lastInsertRowid);
    const insertHistoryItem = db.prepare(`
    INSERT INTO inventory_history_items (
      archive_id, original_item_id, item_code, item_name, description, category,
      quantity, unit, unit_price, total_value, min_stock_level, supplier,
      date_purchased, condition, remarks, original_created_at, original_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const insertTx = db.prepare(`
    INSERT INTO inventory_transactions (
      item_id, item_name, transaction_type, previous_qty, change_qty, new_qty,
      unit_price, total_value_after, reference_no, reason, performed_by, performed_by_name
    ) VALUES (?, ?, 'Deletion', ?, ?, 0, ?, 0, ?, ?, ?, ?)
  `);
    let insertedCount = 0;
    for (const item of items) {
        insertHistoryItem.run(archiveId, item.id, item.item_code || '', item.item_name, item.description || '', item.category || 'General', item.quantity, item.unit, item.unit_price, item.total_value, item.min_stock_level ?? 5, item.supplier || '', item.date_purchased || '', item.condition, item.remarks || '', item.created_at || '', item.updated_at || '');
        insertedCount++;
        insertTx.run(item.id, item.item_name, item.quantity, -item.quantity, item.unit_price, resolvedRef, `Archived (${params.triggerType}) & inventory reset`, params.performedById, params.performedByName);
    }
    // Integrity check: verify every single active item was archived before resetting
    if (insertedCount !== items.length) {
        throw new Error('Archive verification failed: archived item count mismatch. Reset cancelled.');
    }
    const verifyRow = db
        .prepare('SELECT COUNT(*) AS cnt FROM inventory_history_items WHERE archive_id = ?')
        .get(archiveId);
    if (verifyRow.cnt !== items.length) {
        throw new Error('Archive verification failed in database. Reset cancelled.');
    }
    // Safe to reset active inventory now that archive is verified
    if (items.length > 0) {
        db.prepare('DELETE FROM inventory_items').run();
    }
    db.prepare(`
    INSERT INTO activity_logs (user_id, username, role, action, module, entity_id, details)
    VALUES (?, ?, ?, 'ARCHIVE_AND_RESET', 'History', ?, ?)
  `).run(params.performedById, params.performedByName, params.performedById ? 'user' : 'system', String(archiveId), `[${params.triggerType}] Archived ${items.length} item(s) (${resolvedRef}) and reset active inventory.`);
    const createdArchive = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(archiveId);
    return {
        alreadyArchived: false,
        archive: createdArchive,
        archivedItemCount: items.length,
    };
}
function archiveAndResetInventory(params) {
    if (params.inTransaction) {
        return executeArchiveAndReset(params);
    }
    return (0, database_1.withTransaction)(() => executeArchiveAndReset(params));
}
