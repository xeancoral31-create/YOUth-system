import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { PATHS } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';
import { getConsolidatedData, registerDocumentRecord } from '@/lib/reportData';
import { generateConsolidatedFinancialPdf } from '@/lib/pdfGenerator';
import { generateConsolidatedExcel } from '@/lib/excelGenerator';
import { generateConsolidatedDocx } from '@/lib/docxGenerator';

export async function GET(req: NextRequest, context: { params: Promise<{ format: string }> }) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { format } = await context.params;
  const data = getConsolidatedData();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  try {
    if (format === 'pdf') {
      const fileName = `BGCyouth_Financial_Summary_${stamp}.pdf`;
      const filePath = path.join(PATHS.GENERATED_DIR, fileName);
      await generateConsolidatedFinancialPdf(filePath, {
        generatedBy: auth.user.full_name,
        items: data.items,
        audits: data.audits,
        settings: data.settings,
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
        user: auth.user,
      });
      logActivity(req, auth.user, 'EXPORT_FINANCIAL_PDF', 'Reports', '', `Exported ${fileName}`);
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    if (format === 'excel') {
      const fileName = `BGCyouth_Inventory_Financial_${stamp}.xlsx`;
      const filePath = path.join(PATHS.GENERATED_DIR, fileName);
      await generateConsolidatedExcel(filePath, {
        generatedBy: auth.user.full_name,
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
        user: auth.user,
      });
      logActivity(req, auth.user, 'EXPORT_FINANCIAL_EXCEL', 'Reports', '', `Exported ${fileName}`);
      const buf = fs.readFileSync(filePath);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    if (format === 'docx') {
      const fileName = `BGCyouth_Financial_Summary_${stamp}.docx`;
      const filePath = path.join(PATHS.GENERATED_DIR, fileName);
      await generateConsolidatedDocx(filePath, {
        generatedBy: auth.user.full_name,
        items: data.items,
        settings: data.settings,
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
        user: auth.user,
      });
      logActivity(req, auth.user, 'EXPORT_FINANCIAL_DOCX', 'Reports', '', `Exported ${fileName}`);
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
    return NextResponse.json({ error: `Failed to generate report: ${err.message}` }, { status: 500 });
  }
}
