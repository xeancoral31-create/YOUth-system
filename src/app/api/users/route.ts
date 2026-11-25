import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/database';
import { authenticateRequest, logActivity, UserRole } from '@/lib/auth';

const VALID_ROLES: UserRole[] = ['admin', 'auditor', 'staff', 'viewer'];

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const db = getDb();
  const users = db
    .prepare('SELECT id, username, full_name, email, role, position, is_active, created_at, updated_at FROM users ORDER BY created_at DESC')
    .all();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const { username, full_name, email, password, role, position } = await req.json().catch(() => ({}));
  if (!username || !full_name || !email || !password || !role) {
    return NextResponse.json({ error: 'Username, full name, email, password, and role are required.' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` }, { status: 400 });
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
    .get(username.trim(), email.trim());
  if (existing) {
    return NextResponse.json({ error: 'Username or email is already registered.' }, { status: 409 });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare(`
      INSERT INTO users (username, full_name, email, password_hash, role, position, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `)
    .run(username.trim(), full_name.trim(), email.trim(), hash, role, (position ?? '').trim());

  const created = db
    .prepare('SELECT id, username, full_name, email, role, position, is_active, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);

  logActivity(req, auth.user, 'CREATE_USER', 'Users', Number(result.lastInsertRowid), `Created user ${username} with role ${role}`);
  return NextResponse.json({ user: created }, { status: 201 });
}
