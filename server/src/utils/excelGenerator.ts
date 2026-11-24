import ExcelJS from 'exceljs';

export async function generateConsolidatedExcel(
  filePath: string,
  data: {
    generatedBy: string;
    items: any[];
    audits: any[];
  }
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BGCyouth Management System';
  wb.created = new Date();

  const invSheet = wb.addWorksheet('Inventory Valuation');
  invSheet.mergeCells('A1:J1');
  invSheet.getCell('A1').value = 'BGCyouth — CONSOLIDATED INVENTORY & FINANCIAL REPORT';
  invSheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };

  invSheet.mergeCells('A2:J2');
  invSheet.getCell('A2').value = `Generated: ${new Date().toLocaleString('en-PH')} | Prepared By: ${data.generatedBy}`;
  invSheet.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } };

  invSheet.addRow([]);
  const headerRow = invSheet.addRow([
    'Item Name',
    'Quantity',
    'Unit',
    'Unit Price (PHP)',
    'Total Value (PHP)',
    'Supplier',
    'Date Purchased',
    'Condition',
  ]);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  let grandTotal = 0;
  for (const item of data.items) {
    grandTotal += Number(item.total_value || 0);
    const row = invSheet.addRow([
      item.item_name,
      Number(item.quantity),
      item.unit,
      Number(item.unit_price),
      Number(item.total_value),
      item.supplier || '-',
      item.date_purchased || '-',
      item.condition,
    ]);
    row.getCell(4).numFmt = '₱#,##0.00';
    row.getCell(5).numFmt = '₱#,##0.00';
  }

  const totalRow = invSheet.addRow(['GRAND TOTAL INVENTORY VALUE', '', '', '', grandTotal, '', '', '']);
  totalRow.font = { bold: true };
  totalRow.getCell(5).numFmt = '₱#,##0.00';

  invSheet.columns.forEach((col) => {
    col.width = 18;
  });
  invSheet.getColumn(2).width = 28;

  const auditSheet = wb.addWorksheet('Audit Summary');
  auditSheet.addRow(['Audit Ref', 'Title', 'Audit Date', 'Auditor', 'Status', 'Recorded Value', 'Actual Value', 'Financial Diff']);
  auditSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  });
  for (const a of data.audits) {
    const r = auditSheet.addRow([
      a.audit_ref,
      a.title,
      a.audit_date,
      a.auditor_name,
      a.status,
      Number(a.total_recorded_value || 0),
      Number(a.total_actual_value || 0),
      Number(a.total_financial_difference || 0),
    ]);
    r.getCell(6).numFmt = '₱#,##0.00';
    r.getCell(7).numFmt = '₱#,##0.00';
    r.getCell(8).numFmt = '₱#,##0.00';
  }
  auditSheet.columns.forEach((c) => {
    c.width = 20;
  });

  await wb.xlsx.writeFile(filePath);
}

export async function generateIndividualAuditExcel(
  filePath: string,
  data: {
    audit: any;
    items: any[];
    generatedBy: string;
  }
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Audit Report');

  sheet.mergeCells('A1:I1');
  sheet.getCell('A1').value = `BGCyouth — AUDIT REPORT (${data.audit.audit_ref})`;
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };

  sheet.mergeCells('A2:I2');
  sheet.getCell('A2').value = `Title: ${data.audit.title} | Date: ${data.audit.audit_date} | Auditor: ${data.audit.auditor_name} | Status: ${data.audit.status}`;
  sheet.getCell('A2').font = { size: 10, color: { argb: 'FF475569' } };

  sheet.addRow([]);
  const header = sheet.addRow([
    'Item Name',
    'Unit Price',
    'Recorded Qty',
    'Actual Qty',
    'Discrepancy',
    'Financial Difference',
    'Observed Condition',
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  });

  for (const it of data.items) {
    const r = sheet.addRow([
      it.item_name,
      Number(it.unit_price),
      Number(it.recorded_qty),
      Number(it.actual_qty),
      Number(it.discrepancy),
      Number(it.financial_difference),
      it.observed_condition,
    ]);
    r.getCell(2).numFmt = '₱#,##0.00';
    r.getCell(6).numFmt = '₱#,##0.00';
  }

  sheet.columns.forEach((c) => {
    c.width = 18;
  });
  sheet.getColumn(2).width = 28;

  await wb.xlsx.writeFile(filePath);
}
