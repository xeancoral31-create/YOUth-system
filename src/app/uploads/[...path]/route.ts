import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { PATHS } from '@/lib/database';

const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export async function GET(_req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const rel = path.normalize(segments.join('/')).replace(/^(\.\.(\/|\\|$))+/, '');
  const absPath = path.join(PATHS.UPLOADS_DIR, rel);

  if (!absPath.startsWith(PATHS.UPLOADS_DIR) || !fs.existsSync(absPath)) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  const ext = path.extname(absPath).toLowerCase();
  const mime = MIME_MAP[ext] || 'application/octet-stream';
  const buf = fs.readFileSync(absPath);

  return new NextResponse(buf, {
    headers: { 'Content-Type': mime },
  });
}
