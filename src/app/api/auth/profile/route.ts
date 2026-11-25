import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function PUT(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { full_name, email, position } = await req.json().catch(() => ({}));
  if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
  }

  const db = getDb();
  const conflict = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?')
    .get(email.trim(), auth.user.id);
  if (conflict) {
    return NextResponse.json({ error: 'This email address is already used by another account.' }, { status: 409 });
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, email = ?, position = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(full_name.trim(), email.trim(), (position ?? '').trim(), auth.user.id);

  const updated = db
    .prepare('SELECT id, username, full_name, email, role, position FROM users WHERE id = ?')
    .get(auth.user.id);

  logActivity(req, auth.user, 'UPDATE_PROFILE', 'Settings', auth.user.id, 'Updated account profile details');
  return NextResponse.json({ user: updated });
}
