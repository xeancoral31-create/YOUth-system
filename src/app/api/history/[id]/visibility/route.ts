import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const { is_hidden } = await req.json().catch(() => ({}));
  const db = getDb();

  const existing = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'History archive record not found.' }, { status: 404 });
  }

  const nextHidden = typeof is_hidden === 'boolean' ? (is_hidden ? 1 : 0) : existing.is_hidden ? 0 : 1;
  db.prepare('UPDATE inventory_history_archives SET is_hidden = ? WHERE id = ?').run(nextHidden, id);

  logActivity(
    req,
    auth.user,
    nextHidden ? 'HIDE_HISTORY' : 'UNHIDE_HISTORY',
    'History',
    id,
    `${nextHidden ? 'Hid' : 'Unhid'} archive record ${existing.archive_ref}`
  );

  return NextResponse.json({ archive: db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) });
}
