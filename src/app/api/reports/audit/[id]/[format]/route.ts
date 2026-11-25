import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { getDb, getDbSettings, PATHS } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { registerDocumentRecord } from '@/lib/reportData';
import { generateIndividualAuditPdf } from '@/lib/pdfGenerator';
import { generateIndividualAuditExcel } from '@/lib/excelGenerator';
import { generateIndividualAuditDocx } from '@/lib/docxGenerator';
import { sanitizeFilename } from '@/lib/format';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string; format: string }> }) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { id: idStr, format } = await context.params;
  const id = Number(idStr);
  const db = getDb();
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
    .get(id) as any;

  if (!audit) {
    return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });
  }

  const items = db.prepare('SELECT * FROM audit_items WHERE audit_id = ? ORDER BY item_name ASC').all(id);
  const stamp = Date.now();
  const settings = getDbSettings();

  try {
    if (format === 'pdf') {
      const fileName = sanitizeFilename(`Audit_Report_${audit.audit_ref}_${stamp}.pdf`);
      const filePath = path.join(PATHS.GENERATED_DIR, fileName);
      await generateIndividualAuditPdf(filePath, { audit, items, generatedBy: auth.user.full_name, settings });
      registerDocumentRecord({
        title: `Audit Report — ${audit.audit_ref} (${audit.title})`,
        docType: 'Audit Report',
        referenceNo: audit.audit_ref,
        fileName,
        filePath,
        mimeType: 'application/pdf',
        relatedModule: 'Audits',
        relatedId: id,
        user: auth.user,
      });
      logActivity(req, auth.user, 'EXPORT_AUDIT_PDF', 'Reports', id, `Exported PDF for audit ${audit.audit_ref}`);
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    if (format === 'excel') {
      const fileName = sanitizeFilename(`Audit_Report_${audit.audit_ref}_${stamp}.xlsx`);
      const filePath = path.join(PATHS.GENERATED_DIR, fileName);
      await generateIndividualAuditExcel(filePath, { audit, items, generatedBy: auth.user.full_name });
      registerDocumentRecord({
        title: `Audit Excel — ${audit.audit_ref} (${audit.title})`,
        docType: 'Excel Export',
        referenceNo: audit.audit_ref,
        fileName,
        filePath,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        relatedModule: 'Audits',
        relatedId: id,
        user: auth.user,
      });
      logActivity(req, auth.user, 'EXPORT_AUDIT_EXCEL', 'Reports', id, `Exported Excel for audit ${audit.audit_ref}`);
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    if (format === 'docx') {
      const fileName = sanitizeFilename(`Audit_Report_${audit.audit_ref}_${stamp}.docx`);
      const filePath = path.join(PATHS.GENERATED_DIR, fileName);
      await generateIndividualAuditDocx(filePath, { audit, items, generatedBy: auth.user.full_name, settings });
      registerDocumentRecord({
        title: `Audit Report Word — ${audit.audit_ref} (${audit.title})`,
        docType: 'Audit Report',
        referenceNo: audit.audit_ref,
        fileName,
        filePath,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        relatedModule: 'Audits',
        relatedId: id,
        user: auth.user,
      });
      logActivity(req, auth.user, 'EXPORT_AUDIT_DOCX', 'Reports', id, `Exported Word (.docx) for audit ${audit.audit_ref}`);
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported report format.' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to generate audit report: ${err.message}` }, { status: 500 });
  }
}
