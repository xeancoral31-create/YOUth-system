import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 100, 500);
  const db = getDb();
  const transactions = db.prepare('SELECT * FROM inventory_transactions ORDER BY id DESC LIMIT ?').all(limit);
  return NextResponse.json({ transactions });
}
