"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const auditLog_1 = require("../middleware/auditLog");
const archiveResetService_1 = require("../services/archiveResetService");
const pdfGenerator_1 = require("../utils/pdfGenerator");
const excelGenerator_1 = require("../utils/excelGenerator");
const docxGenerator_1 = require("../utils/docxGenerator");
const format_1 = require("../utils/format");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
function getConsolidatedData() {
    const db = (0, database_1.getDb)();
    const items = db.prepare('SELECT * FROM inventory_items ORDER BY category ASC, item_name ASC').all();
    const audits = db
        .prepare(`
      SELECT a.*,
        (SELECT COALESCE(SUM(ai.recorded_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_recorded_value,
        (SELECT COALESCE(SUM(ai.actual_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_actual_value,
        (SELECT COALESCE(SUM(ai.financial_difference), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_financial_difference,
        (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy < 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS shortage_count,
        (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy > 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS excess_count
      FROM audits a
      ORDER BY a.audit_date DESC, a.id DESC
    `)
        .all();
    const totalItems = items.length;
    const totalUnits = items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    const totalInventoryValue = items.reduce((sum, i) => sum + Number(i.total_value || 0), 0);
    const lowStockCount = items.filter((i) => i.quantity > 0 && i.quantity <= i.min_stock_level).length;
    const outOfStockCount = items.filter((i) => i.quantity <= 0).length;
    const completedAudits = audits.filter((a) => a.status === 'Completed').length;
    const pendingAudits = audits.filter((a) => a.status !== 'Completed').length;
    const totalFinancialDifference = audits.reduce((sum, a) => sum + Number(a.total_financial_difference || 0), 0);
    return {
        items,
        audits,
        settings: (0, database_1.getDbSettings)(),
        totals: {
            totalItems,
            totalUnits,
            totalInventoryValue,
            lowStockCount,
            outOfStockCount,
            completedAudits,
            pendingAudits,
            totalFinancialDifference,
        },
    };
}
function registerDocumentRecord(params) {
    const db = (0, database_1.getDb)();
    const stats = node_fs_1.default.statSync(params.filePath);
    const relPath = `/uploads/generated/${params.fileName}`;
    db.prepare(`
    INSERT INTO documents (
      title, doc_type, reference_no, file_name, file_path, mime_type,
      file_size, related_module, related_id, generated_by, generated_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(params.title, params.docType, params.referenceNo, params.fileName, relPath, params.mimeType, stats.size, params.relatedModule, params.relatedId, params.user.id, params.user.full_name);
}
// Get live consolidated financial & audit report data for A4 preview
router.get('/consolidated', (_req, res) => {
    res.json(getConsolidatedData());
});
// Archive & Reset Inventory upon Administrator Print Report
router.post('/print-archive', (0, auth_1.authorize)('admin'), (req, res) => {
    try {
        const { archive_ref, period_label } = req.body ?? {};
        const result = (0, archiveResetService_1.archiveAndResetInventory)({
            triggerType: 'Print Report',
            performedById: req.user.id,
            performedByName: req.user.full_name,
            archiveRef: typeof archive_ref === 'string' && archive_ref.trim() ? archive_ref.trim() : undefined,
            periodLabel: typeof period_label === 'string' && period_label.trim() ? period_label.trim() : undefined,
        });
        res.json(result);
    }
    catch (err) {
        res.status(500).json({
            error: `Inventory could not be reset because historical records were not successfully saved: ${err.message}`,
        });
    }
});
// Export Consolidated Financial Summary PDF
router.get('/consolidated/pdf', async (req, res) => {
    try {
        const data = getConsolidatedData();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `BGCyouth_Financial_Summary_${stamp}.pdf`;
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, pdfGenerator_1.generateConsolidatedFinancialPdf)(filePath, {
            generatedBy: req.user.full_name,
            items: data.items,
            audits: data.audits,
            totals: data.totals,
        });
        registerDocumentRecord({
            title: `Consolidated Inventory & Financial Summary (${stamp})`,
            docType: 'Financial Summary',
            referenceNo: `FIN-${stamp}`,
            fileName,
            filePath,
            mimeType: 'application/pdf',
            relatedModule: 'Reports',
            relatedId: null,
            user: req.user,
        });
        (0, auditLog_1.logActivity)(req, 'EXPORT_FINANCIAL_PDF', 'Reports', '', `Exported ${fileName}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to generate PDF: ${err.message}` });
    }
});
// Export Consolidated Financial Summary Excel
router.get('/consolidated/excel', async (req, res) => {
    try {
        const data = getConsolidatedData();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `BGCyouth_Inventory_Financial_${stamp}.xlsx`;
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, excelGenerator_1.generateConsolidatedExcel)(filePath, {
            generatedBy: req.user.full_name,
            items: data.items,
            audits: data.audits,
        });
        registerDocumentRecord({
            title: `Consolidated Inventory & Audit Excel (${stamp})`,
            docType: 'Excel Export',
            referenceNo: `XLS-${stamp}`,
            fileName,
            filePath,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            relatedModule: 'Reports',
            relatedId: null,
            user: req.user,
        });
        (0, auditLog_1.logActivity)(req, 'EXPORT_FINANCIAL_EXCEL', 'Reports', '', `Exported ${fileName}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to generate Excel: ${err.message}` });
    }
});
// Export Individual Audit PDF
router.get('/audit/:id/pdf', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const db = (0, database_1.getDb)();
        const audit = db
            .prepare(`
        SELECT a.*,
          (SELECT COALESCE(SUM(ai.recorded_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_recorded_value,
          (SELECT COALESCE(SUM(ai.actual_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_actual_value,
          (SELECT COALESCE(SUM(ai.financial_difference), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_financial_difference,
          (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy < 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS shortage_count,
          (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy > 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS excess_count,
          (SELECT COALESCE(SUM(CASE WHEN ai.discrepancy = 0 THEN 1 ELSE 0 END), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS matched_count
        FROM audits a WHERE a.id = ?
      `)
            .get(id);
        if (!audit) {
            res.status(404).json({ error: 'Audit not found.' });
            return;
        }
        const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY item_name ASC').all(id);
        const stamp = Date.now();
        const fileName = (0, format_1.sanitizeFilename)(`Audit_Report_${audit.audit_ref}_${stamp}.pdf`);
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, pdfGenerator_1.generateIndividualAuditPdf)(filePath, {
            audit,
            items,
            generatedBy: req.user.full_name,
        });
        registerDocumentRecord({
            title: `Audit Report — ${audit.audit_ref} (${audit.title})`,
            docType: 'Audit Report',
            referenceNo: audit.audit_ref,
            fileName,
            filePath,
            mimeType: 'application/pdf',
            relatedModule: 'Audits',
            relatedId: id,
            user: req.user,
        });
        (0, auditLog_1.logActivity)(req, 'EXPORT_AUDIT_PDF', 'Reports', id, `Exported PDF for audit ${audit.audit_ref}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to generate Audit PDF: ${err.message}` });
    }
});
// Export Individual Audit Excel
router.get('/audit/:id/excel', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const db = (0, database_1.getDb)();
        const audit = db.prepare('SELECT * FROM audits WHERE id = ?').get(id);
        if (!audit) {
            res.status(404).json({ error: 'Audit not found.' });
            return;
        }
        const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY item_name ASC').all(id);
        const stamp = Date.now();
        const fileName = (0, format_1.sanitizeFilename)(`Audit_Report_${audit.audit_ref}_${stamp}.xlsx`);
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, excelGenerator_1.generateIndividualAuditExcel)(filePath, {
            audit,
            items,
            generatedBy: req.user.full_name,
        });
        registerDocumentRecord({
            title: `Audit Excel — ${audit.audit_ref} (${audit.title})`,
            docType: 'Excel Export',
            referenceNo: audit.audit_ref,
            fileName,
            filePath,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            relatedModule: 'Audits',
            relatedId: id,
            user: req.user,
        });
        (0, auditLog_1.logActivity)(req, 'EXPORT_AUDIT_EXCEL', 'Reports', id, `Exported Excel for audit ${audit.audit_ref}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to generate Audit Excel: ${err.message}` });
    }
});
// Export Consolidated Financial Summary Word (.docx)
router.get('/consolidated/docx', async (req, res) => {
    try {
        const data = getConsolidatedData();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `BGCyouth_Financial_Summary_${stamp}.docx`;
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, docxGenerator_1.generateConsolidatedDocx)(filePath, {
            generatedBy: req.user.full_name,
            items: data.items,
            totals: data.totals,
        });
        registerDocumentRecord({
            title: `Consolidated Inventory & Financial Word (${stamp})`,
            docType: 'Financial Summary',
            referenceNo: `DOCX-${stamp}`,
            fileName,
            filePath,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            relatedModule: 'Reports',
            relatedId: null,
            user: req.user,
        });
        (0, auditLog_1.logActivity)(req, 'EXPORT_FINANCIAL_DOCX', 'Reports', '', `Exported ${fileName}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to generate Word document: ${err.message}` });
    }
});
// Export Individual Audit Word (.docx)
router.get('/audit/:id/docx', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const db = (0, database_1.getDb)();
        const audit = db
            .prepare(`
        SELECT a.*,
          (SELECT COALESCE(SUM(ai.recorded_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_recorded_value,
          (SELECT COALESCE(SUM(ai.actual_value), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_actual_value,
          (SELECT COALESCE(SUM(ai.financial_difference), 0) FROM audit_items ai WHERE ai.audit_id = a.id) AS total_financial_difference
        FROM audits a WHERE a.id = ?
      `)
            .get(id);
        if (!audit) {
            res.status(404).json({ error: 'Audit not found.' });
            return;
        }
        const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY item_name ASC').all(id);
        const stamp = Date.now();
        const fileName = (0, format_1.sanitizeFilename)(`Audit_Report_${audit.audit_ref}_${stamp}.docx`);
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, docxGenerator_1.generateIndividualAuditDocx)(filePath, {
            audit,
            items,
            generatedBy: req.user.full_name,
        });
        registerDocumentRecord({
            title: `Audit Report Word — ${audit.audit_ref} (${audit.title})`,
            docType: 'Audit Report',
            referenceNo: audit.audit_ref,
            fileName,
            filePath,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            relatedModule: 'Audits',
            relatedId: id,
            user: req.user,
        });
        (0, auditLog_1.logActivity)(req, 'EXPORT_AUDIT_DOCX', 'Reports', id, `Exported Word (.docx) for audit ${audit.audit_ref}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to generate Audit Word document: ${err.message}` });
    }
});
exports.default = router;
