import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { getDb, PATHS } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  if (!doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const absPath = path.join(PATHS.UPLOADS_DIR, doc.file_path.replace(/^\/uploads\//, ''));
  if (!fs.existsSync(absPath)) {
    return NextResponse.json({ error: 'File no longer exists on disk.' }, { status: 404 });
  }

  const buf = fs.readFileSync(absPath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': doc.mime_type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${doc.file_name}"`,
    },
  });
}
