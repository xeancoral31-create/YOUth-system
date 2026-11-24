import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from 'docx';
import fs from 'node:fs';
import { formatPHP } from './format';

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; fill?: string; color?: string } = {}) {
  return new TableCell({
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text,
            bold: opts.bold,
            size: 18,
            color: opts.color || '0F172A',
            font: 'Calibri',
          }),
        ],
      }),
    ],
  });
}

function buildLetterhead(title: string, subtitle: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'BUTUAN GOSPEL CHURCH • BGC YOUTH MINISTRY',
          bold: true,
          size: 20,
          color: '1E3A5F',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'BGCyouth MANAGEMENT SYSTEM',
          bold: true,
          size: 28,
          color: '0F172A',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 24,
          color: '1E40AF',
          font: 'Calibri',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '1E3A5F' } },
      children: [
        new TextRun({
          text: subtitle,
          size: 18,
          color: '475569',
          font: 'Calibri',
        }),
      ],
    }),
  ];
}

function buildSignatureTable(leftName: string, midName: string, rightName: string): Table {
  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  };
  const sigCol = (label: string, name: string, role: string) =>
    new TableCell({
      borders: noBorder,
      width: { size: 33, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          spacing: { before: 300, after: 400 },
          children: [new TextRun({ text: label, size: 18, color: '475569', font: 'Calibri' })],
        }),
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: '334155' } },
          spacing: { before: 40, after: 20 },
          children: [new TextRun({ text: name, bold: true, size: 19, color: '0F172A', font: 'Calibri' })],
        }),
        new Paragraph({
          children: [new TextRun({ text: role, size: 16, color: '64748B', font: 'Calibri' })],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          sigCol('Prepared By:', leftName, 'Authorized Personnel'),
          sigCol('Verified By:', midName, 'BGC Youth Audit Committee'),
          sigCol('Approved By:', rightName, 'Butuan Gospel Church Board'),
        ],
      }),
    ],
  });
}

export async function generateConsolidatedDocx(
  filePath: string,
  data: {
    generatedBy: string;
    items: any[];
    totals: {
      totalItems: number;
      totalUnits: number;
      totalInventoryValue: number;
      totalFinancialDifference: number;
    };
  }
): Promise<void> {
  const summaryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell('Registered Items', { bold: true, fill: 'F1F5F9' }),
          cell(String(data.totals.totalItems)),
          cell('Total Stock Units', { bold: true, fill: 'F1F5F9' }),
          cell(String(data.totals.totalUnits)),
        ],
      }),
      new TableRow({
        children: [
          cell('Total Inventory Valuation', { bold: true, fill: 'F1F5F9' }),
          cell(formatPHP(data.totals.totalInventoryValue), { bold: true }),
          cell('Net Audit Variance', { bold: true, fill: 'F1F5F9' }),
          cell(formatPHP(data.totals.totalFinancialDifference), { bold: true }),
        ],
      }),
    ],
  });

  const itemHeader = new TableRow({
    children: [
      cell('Item Name', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
      cell('Quantity', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Unit Price', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Total Value', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Supplier/Source', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
      cell('Condition', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
    ],
  });

  const itemRows =
    data.items.length === 0
      ? [
          new TableRow({
            children: [cell('No inventory items recorded.', { color: '64748B' })],
          }),
        ]
      : data.items.map(
          (it, idx) =>
            new TableRow({
              children: [
                cell(it.item_name, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
                cell(`${it.quantity} ${it.unit}`, {
                  align: AlignmentType.RIGHT,
                  fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
                }),
                cell(formatPHP(it.unit_price), {
                  align: AlignmentType.RIGHT,
                  fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
                }),
                cell(formatPHP(it.total_value), {
                  bold: true,
                  align: AlignmentType.RIGHT,
                  fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
                }),
                cell(it.supplier || '-', { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
                cell(it.condition, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
              ],
            })
        );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 900, bottom: 900, left: 900 } },
        },
        children: [
          ...buildLetterhead(
            'CONSOLIDATED INVENTORY & FINANCIAL SUMMARY REPORT',
            `Generated: ${new Date().toLocaleString('en-PH')} | Prepared By: ${data.generatedBy}`
          ),
          new Paragraph({
            spacing: { before: 120, after: 80 },
            children: [new TextRun({ text: '1. EXECUTIVE SUMMARY', bold: true, size: 20, font: 'Calibri' })],
          }),
          summaryTable,
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: '2. INVENTORY VALUATION SCHEDULE', bold: true, size: 20, font: 'Calibri' })],
          }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [itemHeader, ...itemRows] }),
          buildSignatureTable(data.generatedBy, 'Inventory Auditor', 'Church Board'),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}

export async function generateIndividualAuditDocx(
  filePath: string,
  data: { audit: any; items: any[]; generatedBy: string }
): Promise<void> {
  const { audit, items } = data;

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell('Audit Title', { bold: true, fill: 'F1F5F9' }),
          cell(audit.title),
          cell('Audit Date', { bold: true, fill: 'F1F5F9' }),
          cell(audit.audit_date),
        ],
      }),
      new TableRow({
        children: [
          cell('Auditor', { bold: true, fill: 'F1F5F9' }),
          cell(audit.auditor_name),
          cell('Status', { bold: true, fill: 'F1F5F9' }),
          cell(audit.status, { bold: true }),
        ],
      }),
      new TableRow({
        children: [
          cell('Actual Valuation', { bold: true, fill: 'F1F5F9' }),
          cell(formatPHP(audit.total_actual_value || 0)),
          cell('Financial Variance', { bold: true, fill: 'F1F5F9' }),
          cell(formatPHP(audit.total_financial_difference || 0), { bold: true }),
        ],
      }),
    ],
  });

  const itemHeader = new TableRow({
    children: [
      cell('Item Name', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
      cell('Recorded', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Actual', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Diff', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Fin. Diff', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: AlignmentType.RIGHT }),
      cell('Condition', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
    ],
  });

  const itemRows = items.map(
    (it, idx) =>
      new TableRow({
        children: [
          cell(it.item_name, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
          cell(String(it.recorded_qty), { align: AlignmentType.RIGHT, fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
          cell(String(it.actual_qty), { align: AlignmentType.RIGHT, fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
          cell((it.discrepancy > 0 ? '+' : '') + String(it.discrepancy), {
            align: AlignmentType.RIGHT,
            fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
          }),
          cell(formatPHP(it.financial_difference), {
            align: AlignmentType.RIGHT,
            fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
          }),
          cell(it.observed_condition, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 900, bottom: 900, left: 900 } },
        },
        children: [
          ...buildLetterhead(
            `OFFICIAL INVENTORY AUDIT REPORT — ${audit.audit_ref}`,
            `Status: ${audit.status} | Generated: ${new Date().toLocaleString('en-PH')} | Prepared By: ${data.generatedBy}`
          ),
          metaTable,
          new Paragraph({
            spacing: { before: 200, after: 80 },
            children: [new TextRun({ text: 'AUDITED ITEMS & DISCREPANCY SCHEDULE', bold: true, size: 20, font: 'Calibri' })],
          }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [itemHeader, ...itemRows] }),
          new Paragraph({
            spacing: { before: 200, after: 40 },
            children: [
              new TextRun({ text: 'Findings: ', bold: true, size: 19, font: 'Calibri' }),
              new TextRun({ text: audit.findings || 'None recorded.', size: 19, font: 'Calibri' }),
            ],
          }),
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: 'Recommendations: ', bold: true, size: 19, font: 'Calibri' }),
              new TextRun({ text: audit.recommendations || 'None recorded.', size: 19, font: 'Calibri' }),
            ],
          }),
          buildSignatureTable(
            audit.auditor_name,
            audit.finalized_by_name || 'Pending',
            audit.approved_by || 'Church Board'
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
}
