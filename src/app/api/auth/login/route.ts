import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/database';
import { logActivity, signToken } from '@/lib/auth';
import { ensureWeeklyScheduler } from '@/lib/weeklyScheduler';

export async function POST(req: NextRequest) {
  ensureWeeklyScheduler();
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Username and password are required.' }, { status: 400 });
  }

  const db = getDb();
  const user = db
    .prepare(
      'SELECT id, username, full_name, email, password_hash, role, position, is_active FROM users WHERE username = ? OR email = ?'
    )
    .get(username.trim(), username.trim()) as any;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return NextResponse.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  if (!user.is_active) {
    return NextResponse.json({ error: 'Your account has been deactivated. Contact an administrator.' }, { status: 403 });
  }

  const authUser = {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    position: user.position,
  };

  const token = signToken(authUser);
  const res = NextResponse.json({ user: authUser, token });
  const isHttps = req.nextUrl.protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';

  res.cookies.set('bgcyouth_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: 12 * 60 * 60,
    path: '/',
  });

  logActivity(req, authUser, 'LOGIN', 'Auth', user.id, `User ${user.username} logged in`);
  return res;
}
