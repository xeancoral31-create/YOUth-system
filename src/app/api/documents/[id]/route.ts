import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { getDb, PATHS } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  if (!doc) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }

  const absPath = path.join(PATHS.UPLOADS_DIR, doc.file_path.replace(/^\/uploads\//, ''));
  if (fs.existsSync(absPath)) {
    try {
      fs.unlinkSync(absPath);
    } catch {
      // ignore unlink error
    }
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  logActivity(req, auth.user, 'DELETE_DOCUMENT', 'Document Center', id, `Deleted document "${doc.title}"`);
  return NextResponse.json({ message: 'Document removed.' });
}
