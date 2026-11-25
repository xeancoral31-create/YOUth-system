import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const archive = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) as any;
  if (!archive) {
    return NextResponse.json({ error: 'History archive record not found.' }, { status: 404 });
  }

  const items = db.prepare('SELECT * FROM inventory_history_items WHERE archive_id = ? ORDER BY id ASC').all(id);
  let auditDetails = {};
  try {
    auditDetails = JSON.parse(archive.audit_details_json || '{}');
  } catch {
    auditDetails = {};
  }

  return NextResponse.json({
    archive: { ...archive, audit_details: auditDetails },
    items,
  });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'History archive record not found.' }, { status: 404 });
  }

  db.prepare('DELETE FROM inventory_history_archives WHERE id = ?').run(id);
  logActivity(req, auth.user, 'DELETE_HISTORY', 'History', id, `Permanently deleted archive record ${existing.archive_ref}`);
  return NextResponse.json({ message: 'Historical record permanently deleted.' });
}
