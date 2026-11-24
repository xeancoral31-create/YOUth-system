"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConsolidatedFinancialPdf = generateConsolidatedFinancialPdf;
exports.generateIndividualAuditPdf = generateIndividualAuditPdf;
exports.generateCvPdf = generateCvPdf;
const pdfkit_1 = __importDefault(require("pdfkit"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const format_1 = require("./format");
function drawOfficialHeader(doc, title, subtitle) {
    doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1e3a5f')
        .text('BUTUAN GOSPEL CHURCH • BGC YOUTH MINISTRY', { align: 'center' });
    doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#0f172a')
        .text('BGCyouth MANAGEMENT SYSTEM', { align: 'center' });
    doc.moveDown(0.2);
    doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#1e40af')
        .text(title, { align: 'center' });
    if (subtitle) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(subtitle, { align: 'center' });
    }
    doc.moveDown(0.4);
    doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .lineWidth(1.5)
        .strokeColor('#1e3a5f')
        .stroke();
    doc.moveDown(0.6);
}
function drawSignatureBlock(doc, leftLabel, leftName, midLabel, midName, rightLabel, rightName) {
    if (doc.y > doc.page.height - 150) {
        doc.addPage();
    }
    doc.moveDown(1.5);
    const startY = doc.y;
    const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = usableWidth / 3;
    const cols = [
        { label: leftLabel, name: leftName, x: doc.page.margins.left },
        { label: midLabel, name: midName, x: doc.page.margins.left + colW },
        { label: rightLabel, name: rightName, x: doc.page.margins.left + colW * 2 },
    ];
    for (const col of cols) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(col.label, col.x + 8, startY, { width: colW - 16 });
        doc
            .moveTo(col.x + 8, startY + 34)
            .lineTo(col.x + colW - 16, startY + 34)
            .lineWidth(0.75)
            .strokeColor('#334155')
            .stroke();
        doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#0f172a')
            .text(col.name || '______________________', col.x + 8, startY + 38, { width: colW - 16 });
    }
}
async function generateConsolidatedFinancialPdf(filePath, data) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 40, bufferPages: true });
        const stream = node_fs_1.default.createWriteStream(filePath);
        doc.pipe(stream);
        drawOfficialHeader(doc, 'CONSOLIDATED INVENTORY & FINANCIAL SUMMARY REPORT', `Generated on ${new Date().toLocaleString('en-PH')} | Prepared by: ${data.generatedBy}`);
        // Executive Summary Box
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text('1. EXECUTIVE FINANCIAL & STOCK SUMMARY');
        doc.moveDown(0.3);
        const summaryRows = [
            ['Total Registered Items', String(data.totals.totalItems), 'Total Stock Units', String(data.totals.totalUnits)],
            [
                'Total Inventory Valuation',
                (0, format_1.formatPHPForPdf)(data.totals.totalInventoryValue),
                'Low / Out of Stock Items',
                `${data.totals.lowStockCount} Low / ${data.totals.outOfStockCount} Out`,
            ],
            [
                'Completed / Pending Audits',
                `${data.totals.completedAudits} Completed / ${data.totals.pendingAudits} Pending`,
                'Net Audit Financial Variance',
                (0, format_1.formatPHPForPdf)(data.totals.totalFinancialDifference),
            ],
        ];
        const left = doc.page.margins.left;
        const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const cellW = usableW / 4;
        for (const r of summaryRows) {
            const y = doc.y;
            doc.rect(left, y, usableW, 20).fillAndStroke('#f8fafc', '#cbd5e1');
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text(r[0], left + 6, y + 6, { width: cellW - 10 });
            doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a').text(r[1], left + cellW + 6, y + 6, { width: cellW - 10 });
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text(r[2], left + cellW * 2 + 6, y + 6, { width: cellW - 10 });
            doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a').text(r[3], left + cellW * 3 + 6, y + 6, { width: cellW - 10 });
            doc.y = y + 20;
        }
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text('2. INVENTORY VALUATION SCHEDULE');
        doc.moveDown(0.3);
        const colWidths = [155, 50, 45, 85, 95, 85]; // sum = 515 (A4 595 - 80 = 515)
        const headers = ['Item Name', 'Qty', 'Unit', 'Unit Price', 'Total Value', 'Condition'];
        const drawTableHeader = () => {
            const y = doc.y;
            doc.rect(left, y, usableW, 20).fill('#1e3a5f');
            let cx = left;
            headers.forEach((h, idx) => {
                doc
                    .font('Helvetica-Bold')
                    .fontSize(8)
                    .fillColor('#ffffff')
                    .text(h, cx + 4, y + 6, { width: colWidths[idx] - 8, align: idx === 1 || idx === 3 || idx === 4 ? 'right' : 'left' });
                cx += colWidths[idx];
            });
            doc.y = y + 20;
        };
        drawTableHeader();
        if (data.items.length === 0) {
            doc.font('Helvetica-Oblique').fontSize(9).fillColor('#64748b').text('No inventory items recorded.', left, doc.y + 8);
            doc.moveDown(1);
        }
        else {
            data.items.forEach((item, idx) => {
                if (doc.y > doc.page.height - 80) {
                    doc.addPage();
                    drawTableHeader();
                }
                const y = doc.y;
                doc.rect(left, y, usableW, 18).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f8fafc', '#e2e8f0');
                let cx = left;
                const rowVals = [
                    item.item_name,
                    String(item.quantity),
                    item.unit,
                    (0, format_1.formatPHPForPdf)(item.unit_price),
                    (0, format_1.formatPHPForPdf)(item.total_value),
                    item.condition,
                ];
                rowVals.forEach((val, cIdx) => {
                    doc
                        .font('Helvetica')
                        .fontSize(7.5)
                        .fillColor('#0f172a')
                        .text(val, cx + 4, y + 5, {
                        width: colWidths[cIdx] - 8,
                        align: cIdx === 1 || cIdx === 3 || cIdx === 4 ? 'right' : 'left',
                        ellipsis: true,
                        lineBreak: false,
                    });
                    cx += colWidths[cIdx];
                });
                doc.y = y + 18;
            });
        }
        drawSignatureBlock(doc, 'Prepared By:', data.generatedBy, 'Verified By (Auditor):', '______________________', 'Approved By (Church Board):', '______________________');
        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}
async function generateIndividualAuditPdf(filePath, data) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 40, bufferPages: true });
        const stream = node_fs_1.default.createWriteStream(filePath);
        doc.pipe(stream);
        const { audit, items } = data;
        drawOfficialHeader(doc, 'OFFICIAL INVENTORY AUDIT REPORT', `Audit Reference: ${audit.audit_ref} | Status: ${audit.status} | Audit Date: ${audit.audit_date}`);
        const left = doc.page.margins.left;
        const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('1. AUDIT METADATA & FINANCIAL SUMMARY');
        doc.moveDown(0.3);
        const metaRows = [
            ['Audit Title', audit.title, 'Auditor', audit.auditor_name],
            ['Recorded Valuation', (0, format_1.formatPHPForPdf)(audit.total_recorded_value || 0), 'Actual Valuation', (0, format_1.formatPHPForPdf)(audit.total_actual_value || 0)],
            [
                'Financial Variance',
                (0, format_1.formatPHPForPdf)(audit.total_financial_difference || 0),
                'Discrepancy Counts',
                `${audit.shortage_count || 0} Shortage | ${audit.excess_count || 0} Excess | ${audit.matched_count || 0} Matched`,
            ],
        ];
        const colW = usableW / 4;
        for (const r of metaRows) {
            const y = doc.y;
            doc.rect(left, y, usableW, 20).fillAndStroke('#f8fafc', '#cbd5e1');
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text(r[0], left + 5, y + 6, { width: colW - 10 });
            doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a').text(r[1], left + colW + 5, y + 6, { width: colW - 10 });
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text(r[2], left + colW * 2 + 5, y + 6, { width: colW - 10 });
            doc.font('Helvetica').fontSize(8.5).fillColor('#0f172a').text(r[3], left + colW * 3 + 5, y + 6, { width: colW - 10 });
            doc.y = y + 20;
        }
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('2. AUDITED ITEMS & DISCREPANCY SCHEDULE');
        doc.moveDown(0.3);
        const colWidths = [165, 55, 55, 55, 90, 95]; // sum = 515
        const headers = ['Item Name', 'Rec.', 'Act.', 'Diff.', 'Condition', 'Fin. Diff.'];
        const drawHeader = () => {
            const y = doc.y;
            doc.rect(left, y, usableW, 20).fill('#1e3a5f');
            let cx = left;
            headers.forEach((h, idx) => {
                doc
                    .font('Helvetica-Bold')
                    .fontSize(8)
                    .fillColor('#ffffff')
                    .text(h, cx + 4, y + 6, { width: colWidths[idx] - 8, align: idx >= 1 && idx <= 3 || idx === 5 ? 'right' : 'left' });
                cx += colWidths[idx];
            });
            doc.y = y + 20;
        };
        drawHeader();
        items.forEach((it, idx) => {
            if (doc.y > doc.page.height - 90) {
                doc.addPage();
                drawHeader();
            }
            const y = doc.y;
            doc.rect(left, y, usableW, 18).fillAndStroke(idx % 2 === 0 ? '#ffffff' : '#f8fafc', '#e2e8f0');
            let cx = left;
            const vals = [
                it.item_name,
                String(it.recorded_qty),
                String(it.actual_qty),
                (it.discrepancy > 0 ? '+' : '') + String(it.discrepancy),
                it.observed_condition,
                (0, format_1.formatPHPForPdf)(it.financial_difference),
            ];
            vals.forEach((v, cIdx) => {
                doc
                    .font('Helvetica')
                    .fontSize(7.5)
                    .fillColor('#0f172a')
                    .text(v, cx + 4, y + 5, {
                    width: colWidths[cIdx] - 8,
                    align: cIdx >= 1 && cIdx <= 3 || cIdx === 5 ? 'right' : 'left',
                    ellipsis: true,
                    lineBreak: false,
                });
                cx += colWidths[cIdx];
            });
            doc.y = y + 18;
        });
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('3. AUDIT FINDINGS & RECOMMENDATIONS', left);
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(8.5).text('Findings:', left);
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(audit.findings || 'No formal findings recorded.', left);
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('Recommendations:', left);
        doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(audit.recommendations || 'No recommendations recorded.', left);
        drawSignatureBlock(doc, 'Prepared / Audited By:', audit.auditor_name, 'Finalized By:', audit.finalized_by_name || 'Pending Finalization', 'Approved By:', audit.approved_by || '______________________');
        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}
async function generateCvPdf(filePath, cv, uploadsRoot) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ size: 'A4', margin: 45 });
        const stream = node_fs_1.default.createWriteStream(filePath);
        doc.pipe(stream);
        const left = doc.page.margins.left;
        const usableW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        // Header with optional profile photo
        const headerStartY = doc.y;
        let textWidth = usableW;
        if (cv.photo_path) {
            const absPhoto = node_path_1.default.join(uploadsRoot, cv.photo_path.replace(/^\/uploads\//, ''));
            if (node_fs_1.default.existsSync(absPhoto)) {
                try {
                    doc.image(absPhoto, doc.page.width - doc.page.margins.right - 78, headerStartY, {
                        width: 75,
                        height: 75,
                        fit: [75, 75],
                    });
                    textWidth = usableW - 90;
                }
                catch {
                    // ignore invalid image format
                }
            }
        }
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#1e3a5f').text('BGCyouth • CURRICULUM VITAE', left, headerStartY, { width: textWidth });
        doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(cv.full_name, left, doc.y + 2, { width: textWidth });
        if (cv.position) {
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#1e40af').text(cv.position, left, doc.y + 2, { width: textWidth });
        }
        const contactLine = [cv.email, cv.phone, cv.address].filter(Boolean).join('  |  ');
        if (contactLine) {
            doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(contactLine, left, doc.y + 4, { width: textWidth });
        }
        const personalMeta = [
            cv.date_of_birth ? `DOB: ${cv.date_of_birth}` : '',
            cv.civil_status ? `Civil Status: ${cv.civil_status}` : '',
            cv.nationality ? `Nationality: ${cv.nationality}` : '',
        ]
            .filter(Boolean)
            .join('  |  ');
        if (personalMeta) {
            doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(personalMeta, left, doc.y + 2, { width: textWidth });
        }
        doc.y = Math.max(doc.y + 12, headerStartY + 84);
        doc.moveTo(left, doc.y).lineTo(left + usableW, doc.y).lineWidth(1.2).strokeColor('#1e3a5f').stroke();
        doc.moveDown(0.6);
        const drawSection = (title) => {
            if (doc.y > doc.page.height - 90)
                doc.addPage();
            doc.moveDown(0.4);
            doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1e3a5f').text(title, left);
            doc.moveTo(left, doc.y + 1).lineTo(left + usableW, doc.y + 1).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
            doc.moveDown(0.35);
        };
        if (cv.objective) {
            drawSection('CAREER OBJECTIVE / PROFILE SUMMARY');
            doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(cv.objective, left, doc.y, { width: usableW });
        }
        const education = Array.isArray(cv.education) ? cv.education : [];
        if (education.length > 0) {
            drawSection('EDUCATION');
            for (const ed of education) {
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(`${ed.degree || ed.level || ''} — ${ed.institution || ''}`, left);
                doc
                    .font('Helvetica')
                    .fontSize(8.5)
                    .fillColor('#475569')
                    .text([ed.field, ed.years, ed.honors].filter(Boolean).join(' • '), left);
                doc.moveDown(0.25);
            }
        }
        const experience = Array.isArray(cv.experience) ? cv.experience : [];
        if (experience.length > 0) {
            drawSection('EXPERIENCE & LEADERSHIP');
            for (const exp of experience) {
                doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(`${exp.role || ''} — ${exp.organization || ''}`, left);
                if (exp.period)
                    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#64748b').text(exp.period, left);
                if (exp.responsibilities)
                    doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b').text(exp.responsibilities, left);
                doc.moveDown(0.25);
            }
        }
        const skills = Array.isArray(cv.skills) ? cv.skills : [];
        if (skills.length > 0) {
            drawSection('SKILLS & COMPETENCIES');
            const skillText = skills.map((s) => (s.level ? `${s.name} (${s.level})` : s.name)).join('  •  ');
            doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(skillText, left, doc.y, { width: usableW });
        }
        const achievements = Array.isArray(cv.achievements) ? cv.achievements : [];
        if (achievements.length > 0) {
            drawSection('ACHIEVEMENTS & AWARDS');
            for (const ach of achievements) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(`${ach.title || ''} (${ach.date || ''})`, left);
                if (ach.issuer || ach.description) {
                    doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text([ach.issuer, ach.description].filter(Boolean).join(' — '), left);
                }
                doc.moveDown(0.2);
            }
        }
        const training = Array.isArray(cv.training) ? cv.training : [];
        if (training.length > 0) {
            drawSection('TRAINING & SEMINARS');
            for (const tr of training) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(tr.title || '', left);
                doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text([tr.organizer, tr.date, tr.hours].filter(Boolean).join(' • '), left);
                doc.moveDown(0.2);
            }
        }
        const references = Array.isArray(cv.references) ? cv.references : [];
        if (references.length > 0) {
            drawSection('CHARACTER REFERENCES');
            for (const ref of references) {
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(ref.name || '', left);
                doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text([ref.position, ref.organization, ref.contact].filter(Boolean).join(' | '), left);
                doc.moveDown(0.2);
            }
        }
        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
    });
}
