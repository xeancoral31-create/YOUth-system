import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));
  if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json(
      { error: 'Current password and a new password (min 8 characters) are required.' },
      { status: 400 }
    );
  }

  const db = getDb();
  const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(auth.user.id) as any;
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(
    newHash,
    auth.user.id
  );

  logActivity(req, auth.user, 'CHANGE_PASSWORD', 'Auth', auth.user.id, 'User changed their password');
  return NextResponse.json({ message: 'Password updated successfully.' });
}
