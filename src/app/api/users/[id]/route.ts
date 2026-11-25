import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/database';
import { authenticateRequest, logActivity, UserRole } from '@/lib/auth';

const VALID_ROLES: UserRole[] = ['admin', 'auditor', 'staff', 'viewer'];

export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  const { full_name, email, role, position, is_active, password } = await req.json().catch(() => ({}));

  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!existing) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }

  if (id === auth.user.id && is_active === false) {
    return NextResponse.json({ error: 'You cannot deactivate your own active administrator account.' }, { status: 400 });
  }

  if (password && typeof password === 'string') {
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }
    const newHash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, id);
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, email = ?, role = ?, position = ?, is_active = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    (full_name ?? existing.full_name).trim(),
    (email ?? existing.email).trim(),
    role ?? existing.role,
    (position ?? existing.position).trim(),
    typeof is_active === 'boolean' ? (is_active ? 1 : 0) : existing.is_active,
    id
  );

  const updated = db
    .prepare('SELECT id, username, full_name, email, role, position, is_active, created_at, updated_at FROM users WHERE id = ?')
    .get(id);

  logActivity(req, auth.user, 'UPDATE_USER', 'Users', id, `Updated user ${existing.username}`);
  return NextResponse.json({ user: updated });
}
