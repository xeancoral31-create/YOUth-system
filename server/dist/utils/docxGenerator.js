"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConsolidatedDocx = generateConsolidatedDocx;
exports.generateIndividualAuditDocx = generateIndividualAuditDocx;
const docx_1 = require("docx");
const node_fs_1 = __importDefault(require("node:fs"));
const format_1 = require("./format");
function cell(text, opts = {}) {
    return new docx_1.TableCell({
        shading: opts.fill ? { type: docx_1.ShadingType.CLEAR, fill: opts.fill } : undefined,
        children: [
            new docx_1.Paragraph({
                alignment: opts.align || docx_1.AlignmentType.LEFT,
                spacing: { before: 60, after: 60 },
                children: [
                    new docx_1.TextRun({
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
function buildLetterhead(title, subtitle) {
    return [
        new docx_1.Paragraph({
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
                new docx_1.TextRun({
                    text: 'BUTUAN GOSPEL CHURCH • BGC YOUTH MINISTRY',
                    bold: true,
                    size: 20,
                    color: '1E3A5F',
                    font: 'Calibri',
                }),
            ],
        }),
        new docx_1.Paragraph({
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 40 },
            children: [
                new docx_1.TextRun({
                    text: 'BGCyouth MANAGEMENT SYSTEM',
                    bold: true,
                    size: 28,
                    color: '0F172A',
                    font: 'Calibri',
                }),
            ],
        }),
        new docx_1.Paragraph({
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [
                new docx_1.TextRun({
                    text: title,
                    bold: true,
                    size: 24,
                    color: '1E40AF',
                    font: 'Calibri',
                }),
            ],
        }),
        new docx_1.Paragraph({
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { after: 200 },
            border: { bottom: { style: docx_1.BorderStyle.SINGLE, size: 12, color: '1E3A5F' } },
            children: [
                new docx_1.TextRun({
                    text: subtitle,
                    size: 18,
                    color: '475569',
                    font: 'Calibri',
                }),
            ],
        }),
    ];
}
function buildSignatureTable(leftName, midName, rightName) {
    const noBorder = {
        top: { style: docx_1.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: docx_1.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: docx_1.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: docx_1.BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };
    const sigCol = (label, name, role) => new docx_1.TableCell({
        borders: noBorder,
        width: { size: 33, type: docx_1.WidthType.PERCENTAGE },
        children: [
            new docx_1.Paragraph({
                spacing: { before: 300, after: 400 },
                children: [new docx_1.TextRun({ text: label, size: 18, color: '475569', font: 'Calibri' })],
            }),
            new docx_1.Paragraph({
                border: { top: { style: docx_1.BorderStyle.SINGLE, size: 6, color: '334155' } },
                spacing: { before: 40, after: 20 },
                children: [new docx_1.TextRun({ text: name, bold: true, size: 19, color: '0F172A', font: 'Calibri' })],
            }),
            new docx_1.Paragraph({
                children: [new docx_1.TextRun({ text: role, size: 16, color: '64748B', font: 'Calibri' })],
            }),
        ],
    });
    return new docx_1.Table({
        width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
        rows: [
            new docx_1.TableRow({
                children: [
                    sigCol('Prepared By:', leftName, 'Authorized Personnel'),
                    sigCol('Verified By:', midName, 'BGC Youth Audit Committee'),
                    sigCol('Approved By:', rightName, 'Butuan Gospel Church Board'),
                ],
            }),
        ],
    });
}
async function generateConsolidatedDocx(filePath, data) {
    const summaryTable = new docx_1.Table({
        width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
        rows: [
            new docx_1.TableRow({
                children: [
                    cell('Registered Items', { bold: true, fill: 'F1F5F9' }),
                    cell(String(data.totals.totalItems)),
                    cell('Total Stock Units', { bold: true, fill: 'F1F5F9' }),
                    cell(String(data.totals.totalUnits)),
                ],
            }),
            new docx_1.TableRow({
                children: [
                    cell('Total Inventory Valuation', { bold: true, fill: 'F1F5F9' }),
                    cell((0, format_1.formatPHP)(data.totals.totalInventoryValue), { bold: true }),
                    cell('Net Audit Variance', { bold: true, fill: 'F1F5F9' }),
                    cell((0, format_1.formatPHP)(data.totals.totalFinancialDifference), { bold: true }),
                ],
            }),
        ],
    });
    const itemHeader = new docx_1.TableRow({
        children: [
            cell('Item Name', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
            cell('Quantity', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Unit Price', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Total Value', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Supplier/Source', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
            cell('Condition', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
        ],
    });
    const itemRows = data.items.length === 0
        ? [
            new docx_1.TableRow({
                children: [cell('No inventory items recorded.', { color: '64748B' })],
            }),
        ]
        : data.items.map((it, idx) => new docx_1.TableRow({
            children: [
                cell(it.item_name, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
                cell(`${it.quantity} ${it.unit}`, {
                    align: docx_1.AlignmentType.RIGHT,
                    fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
                }),
                cell((0, format_1.formatPHP)(it.unit_price), {
                    align: docx_1.AlignmentType.RIGHT,
                    fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
                }),
                cell((0, format_1.formatPHP)(it.total_value), {
                    bold: true,
                    align: docx_1.AlignmentType.RIGHT,
                    fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
                }),
                cell(it.supplier || '-', { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
                cell(it.condition, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
            ],
        }));
    const doc = new docx_1.Document({
        sections: [
            {
                properties: {
                    page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 900, bottom: 900, left: 900 } },
                },
                children: [
                    ...buildLetterhead('CONSOLIDATED INVENTORY & FINANCIAL SUMMARY REPORT', `Generated: ${new Date().toLocaleString('en-PH')} | Prepared By: ${data.generatedBy}`),
                    new docx_1.Paragraph({
                        spacing: { before: 120, after: 80 },
                        children: [new docx_1.TextRun({ text: '1. EXECUTIVE SUMMARY', bold: true, size: 20, font: 'Calibri' })],
                    }),
                    summaryTable,
                    new docx_1.Paragraph({
                        spacing: { before: 200, after: 80 },
                        children: [new docx_1.TextRun({ text: '2. INVENTORY VALUATION SCHEDULE', bold: true, size: 20, font: 'Calibri' })],
                    }),
                    new docx_1.Table({ width: { size: 100, type: docx_1.WidthType.PERCENTAGE }, rows: [itemHeader, ...itemRows] }),
                    buildSignatureTable(data.generatedBy, 'Inventory Auditor', 'Church Board'),
                ],
            },
        ],
    });
    const buffer = await docx_1.Packer.toBuffer(doc);
    node_fs_1.default.writeFileSync(filePath, buffer);
}
async function generateIndividualAuditDocx(filePath, data) {
    const { audit, items } = data;
    const metaTable = new docx_1.Table({
        width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
        rows: [
            new docx_1.TableRow({
                children: [
                    cell('Audit Title', { bold: true, fill: 'F1F5F9' }),
                    cell(audit.title),
                    cell('Audit Date', { bold: true, fill: 'F1F5F9' }),
                    cell(audit.audit_date),
                ],
            }),
            new docx_1.TableRow({
                children: [
                    cell('Auditor', { bold: true, fill: 'F1F5F9' }),
                    cell(audit.auditor_name),
                    cell('Status', { bold: true, fill: 'F1F5F9' }),
                    cell(audit.status, { bold: true }),
                ],
            }),
            new docx_1.TableRow({
                children: [
                    cell('Actual Valuation', { bold: true, fill: 'F1F5F9' }),
                    cell((0, format_1.formatPHP)(audit.total_actual_value || 0)),
                    cell('Financial Variance', { bold: true, fill: 'F1F5F9' }),
                    cell((0, format_1.formatPHP)(audit.total_financial_difference || 0), { bold: true }),
                ],
            }),
        ],
    });
    const itemHeader = new docx_1.TableRow({
        children: [
            cell('Item Name', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
            cell('Recorded', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Actual', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Diff', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Fin. Diff', { bold: true, fill: '1E3A5F', color: 'FFFFFF', align: docx_1.AlignmentType.RIGHT }),
            cell('Condition', { bold: true, fill: '1E3A5F', color: 'FFFFFF' }),
        ],
    });
    const itemRows = items.map((it, idx) => new docx_1.TableRow({
        children: [
            cell(it.item_name, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
            cell(String(it.recorded_qty), { align: docx_1.AlignmentType.RIGHT, fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
            cell(String(it.actual_qty), { align: docx_1.AlignmentType.RIGHT, fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
            cell((it.discrepancy > 0 ? '+' : '') + String(it.discrepancy), {
                align: docx_1.AlignmentType.RIGHT,
                fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
            }),
            cell((0, format_1.formatPHP)(it.financial_difference), {
                align: docx_1.AlignmentType.RIGHT,
                fill: idx % 2 === 1 ? 'F8FAFC' : undefined,
            }),
            cell(it.observed_condition, { fill: idx % 2 === 1 ? 'F8FAFC' : undefined }),
        ],
    }));
    const doc = new docx_1.Document({
        sections: [
            {
                properties: {
                    page: { size: { width: 11906, height: 16838 }, margin: { top: 900, right: 900, bottom: 900, left: 900 } },
                },
                children: [
                    ...buildLetterhead(`OFFICIAL INVENTORY AUDIT REPORT — ${audit.audit_ref}`, `Status: ${audit.status} | Generated: ${new Date().toLocaleString('en-PH')} | Prepared By: ${data.generatedBy}`),
                    metaTable,
                    new docx_1.Paragraph({
                        spacing: { before: 200, after: 80 },
                        children: [new docx_1.TextRun({ text: 'AUDITED ITEMS & DISCREPANCY SCHEDULE', bold: true, size: 20, font: 'Calibri' })],
                    }),
                    new docx_1.Table({ width: { size: 100, type: docx_1.WidthType.PERCENTAGE }, rows: [itemHeader, ...itemRows] }),
                    new docx_1.Paragraph({
                        spacing: { before: 200, after: 40 },
                        children: [
                            new docx_1.TextRun({ text: 'Findings: ', bold: true, size: 19, font: 'Calibri' }),
                            new docx_1.TextRun({ text: audit.findings || 'None recorded.', size: 19, font: 'Calibri' }),
                        ],
                    }),
                    new docx_1.Paragraph({
                        spacing: { after: 120 },
                        children: [
                            new docx_1.TextRun({ text: 'Recommendations: ', bold: true, size: 19, font: 'Calibri' }),
                            new docx_1.TextRun({ text: audit.recommendations || 'None recorded.', size: 19, font: 'Calibri' }),
                        ],
                    }),
                    buildSignatureTable(audit.auditor_name, audit.finalized_by_name || 'Pending', audit.approved_by || 'Church Board'),
                ],
            },
        ],
    });
    const buffer = await docx_1.Packer.toBuffer(doc);
    node_fs_1.default.writeFileSync(filePath, buffer);
}
