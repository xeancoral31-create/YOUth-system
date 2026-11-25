import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin', 'auditor');
  if (auth.error) return auth.error;

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') || '';
  const trigger_type = sp.get('trigger_type') || '';
  const date_from = sp.get('date_from') || '';
  const date_to = sp.get('date_to') || '';
  const include_hidden = sp.get('include_hidden') || 'false';

  const conds: string[] = [];
  const params: any[] = [];

  if (include_hidden !== 'true') {
    conds.push('a.is_hidden = 0');
  }
  if (trigger_type.trim()) {
    conds.push('a.trigger_type = ?');
    params.push(trigger_type.trim());
  }
  if (date_from.trim()) {
    conds.push('date(a.archived_at) >= date(?)');
    params.push(date_from.trim());
  }
  if (date_to.trim()) {
    conds.push('date(a.archived_at) <= date(?)');
    params.push(date_to.trim());
  }
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push(`(
      a.archive_ref LIKE ?
      OR a.period_label LIKE ?
      OR a.audit_ref LIKE ?
      OR a.performed_by_name LIKE ?
      OR EXISTS (
        SELECT 1 FROM inventory_history_items hi
        WHERE hi.archive_id = a.id AND (hi.item_name LIKE ? OR hi.supplier LIKE ?)
      )
    )`);
    params.push(q, q, q, q, q, q);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const db = getDb();
  const archives = db
    .prepare(`SELECT a.* FROM inventory_history_archives a ${where} ORDER BY a.archived_at DESC, a.id DESC`)
    .all(...params);

  return NextResponse.json({ archives });
}
