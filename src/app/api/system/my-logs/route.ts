import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const db = getDb();
  const logs = db
    .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 30')
    .all(auth.user.id);
  return NextResponse.json({ logs });
}
