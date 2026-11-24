"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPHP = formatPHP;
exports.formatPHPForPdf = formatPHPForPdf;
exports.roundCurrency = roundCurrency;
exports.sanitizeFilename = sanitizeFilename;
function formatPHP(amount) {
    const num = Number.isFinite(amount) ? amount : 0;
    return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatPHPForPdf(amount) {
    // Standard PDF Helvetica font lacks the ₱ glyph in WinAnsi encoding; use PHP prefix for crisp PDF rendering
    const num = Number.isFinite(amount) ? amount : 0;
    return `PHP ${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function roundCurrency(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
