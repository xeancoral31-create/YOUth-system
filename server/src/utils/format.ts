export function formatPHP(amount: number): string {
  const num = Number.isFinite(amount) ? amount : 0;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPHPForPdf(amount: number): string {
  // Standard PDF Helvetica font lacks the ₱ glyph in WinAnsi encoding; use PHP prefix for crisp PDF rendering
  const num = Number.isFinite(amount) ? amount : 0;
  return `PHP ${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
