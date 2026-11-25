import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const mod = sp.get('module') || '';
  const search = sp.get('search') || '';
  const limit = sp.get('limit') || '150';

  const db = getDb();
  const conds: string[] = [];
  const params: any[] = [];

  if (mod.trim()) {
    conds.push('module = ?');
    params.push(mod.trim());
  }
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push('(username LIKE ? OR action LIKE ? OR details LIKE ?)');
    params.push(q, q, q);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const maxRows = Math.min(Number(limit) || 150, 500);
  const logs = db.prepare(`SELECT * FROM activity_logs ${where} ORDER BY id DESC LIMIT ?`).all(...params, maxRows);
  return NextResponse.json({ logs });
}
