import fs from 'node:fs';
import { getDb, getDbSettings } from './database';

export function getConsolidatedData() {
  const db = getDb();
  const items = db.prepare('SELECT * FROM inventory_items ORDER BY category ASC, item_name ASC').all() as any[];
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
    .all() as any[];

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
    settings: getDbSettings(),
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

export function registerDocumentRecord(params: {
  title: string;
  docType: 'Audit Report' | 'Financial Summary' | 'Excel Export';
  referenceNo: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  relatedModule: string;
  relatedId: number | null;
  user: { id: number; full_name: string };
}) {
  const db = getDb();
  const stats = fs.statSync(params.filePath);
  const relPath = `/uploads/generated/${params.fileName}`;
  db.prepare(`
    INSERT INTO documents (
      title, doc_type, reference_no, file_name, file_path, mime_type,
      file_size, related_module, related_id, generated_by, generated_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.title,
    params.docType,
    params.referenceNo,
    params.fileName,
    relPath,
    params.mimeType,
    stats.size,
    params.relatedModule,
    params.relatedId,
    params.user.id,
    params.user.full_name
  );
}
