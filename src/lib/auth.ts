import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getDb } from './database';

export type UserRole = 'admin' | 'auditor' | 'staff' | 'viewer';

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  position: string;
}

const JWT_SECRET = process.env.BGCYOUTH_JWT_SECRET || 'bgcyouth-official-secret-key-change-in-production-2026';

export function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function authenticateRequest(
  req: NextRequest,
  ...allowedRoles: UserRole[]
): { user: AuthUser; error?: never } | { user?: never; error: NextResponse } {
  const cookieToken = req.cookies.get('bgcyouth_token')?.value;
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = cookieToken || bearerToken;

  if (!token) {
    return { error: NextResponse.json({ error: 'Authentication required. Please log in.' }, { status: 401 }) };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string; role: UserRole };
    const db = getDb();
    const row = db
      .prepare('SELECT id, username, full_name, email, role, position, is_active FROM users WHERE id = ?')
      .get(decoded.id) as (AuthUser & { is_active: number }) | undefined;

    if (!row || !row.is_active) {
      return { error: NextResponse.json({ error: 'Account is inactive or no longer exists.' }, { status: 401 }) };
    }

    const user: AuthUser = {
      id: row.id,
      username: row.username,
      full_name: row.full_name,
      email: row.email,
      role: row.role,
      position: row.position,
    };

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      return {
        error: NextResponse.json(
          { error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${user.role}.` },
          { status: 403 }
        ),
      };
    }

    return { user };
  } catch {
    return {
      error: NextResponse.json({ error: 'Session expired or invalid token. Please log in again.' }, { status: 401 }),
    };
  }
}

export function logActivity(
  req: NextRequest | null,
  user: AuthUser | null,
  action: string,
  module: string,
  entityId: string | number = '',
  details: string = ''
): void {
  try {
    const db = getDb();
    const ip = req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
    db.prepare(`
      INSERT INTO activity_logs (user_id, username, role, action, module, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      user?.id ?? null,
      user?.username ?? 'system',
      user?.role ?? 'system',
      action,
      module,
      String(entityId),
      details,
      ip
    );
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}
