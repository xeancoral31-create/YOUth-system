import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') || '';
  const doc_type = sp.get('doc_type') || '';

  const db = getDb();
  const conds: string[] = [];
  const params: any[] = [];

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push('(title LIKE ? OR reference_no LIKE ? OR file_name LIKE ? OR generated_by_name LIKE ?)');
    params.push(q, q, q, q);
  }
  if (doc_type.trim()) {
    conds.push('doc_type = ?');
    params.push(doc_type.trim());
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const documents = db.prepare(`SELECT * FROM documents ${where} ORDER BY created_at DESC, id DESC`).all(...params);
  return NextResponse.json({ documents });
}
