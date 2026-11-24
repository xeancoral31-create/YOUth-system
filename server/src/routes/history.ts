import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { logActivity } from '../middleware/auditLog';

const router = Router();
router.use(authenticate);

// List archived history snapshots (admin & auditor)
router.get('/', authorize('admin', 'auditor'), (req: AuthRequest, res: Response) => {
  const {
    search = '',
    trigger_type = '',
    date_from = '',
    date_to = '',
    include_hidden = 'false',
  } = req.query as Record<string, string>;

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
    conds.push("date(a.archived_at) >= date(?)");
    params.push(date_from.trim());
  }
  if (date_to.trim()) {
    conds.push("date(a.archived_at) <= date(?)");
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

  res.json({ archives });
});

// Get full snapshot details + archived items
router.get('/:id', authorize('admin', 'auditor'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const archive = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) as any;
  if (!archive) {
    res.status(404).json({ error: 'History archive record not found.' });
    return;
  }

  const items = db.prepare('SELECT * FROM inventory_history_items WHERE archive_id = ? ORDER BY id ASC').all(id);
  let auditDetails = {};
  try {
    auditDetails = JSON.parse(archive.audit_details_json || '{}');
  } catch {
    auditDetails = {};
  }

  res.json({
    archive: { ...archive, audit_details: auditDetails },
    items,
  });
});

// Hide or unhide from default History view (does NOT delete stored information)
router.patch('/:id/visibility', authorize('admin'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { is_hidden } = req.body ?? {};
  const db = getDb();

  const existing = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'History archive record not found.' });
    return;
  }

  const nextHidden = typeof is_hidden === 'boolean' ? (is_hidden ? 1 : 0) : existing.is_hidden ? 0 : 1;
  db.prepare('UPDATE inventory_history_archives SET is_hidden = ? WHERE id = ?').run(nextHidden, id);

  logActivity(
    req,
    nextHidden ? 'HIDE_HISTORY' : 'UNHIDE_HISTORY',
    'History',
    id,
    `${nextHidden ? 'Hid' : 'Unhid'} archive record ${existing.archive_ref}`
  );

  res.json({ archive: db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) });
});

// Permanently delete historical archive (Admin only, independent of active inventory)
router.delete('/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const existing = db.prepare('SELECT * FROM inventory_history_archives WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'History archive record not found.' });
    return;
  }

  db.prepare('DELETE FROM inventory_history_archives WHERE id = ?').run(id);
  logActivity(req, 'DELETE_HISTORY', 'History', id, `Permanently deleted archive record ${existing.archive_ref}`);
  res.json({ message: 'Historical record permanently deleted.' });
});

export default router;
