import { Router, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { getDb, PATHS } from '../db/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { logActivity } from '../middleware/auditLog';

const router = Router();
router.use(authenticate);

router.get('/', (req: AuthRequest, res: Response) => {
  const { search = '', doc_type = '' } = req.query as Record<string, string>;
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
  res.json({ documents });
});

router.get('/:id/download', (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const absPath = path.join(PATHS.UPLOADS_DIR, doc.file_path.replace(/^\/uploads\//, ''));
  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'File no longer exists on disk.' });
    return;
  }

  res.download(absPath, doc.file_name);
});

router.delete('/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
  if (!doc) {
    res.status(404).json({ error: 'Document not found.' });
    return;
  }

  const absPath = path.join(PATHS.UPLOADS_DIR, doc.file_path.replace(/^\/uploads\//, ''));
  if (fs.existsSync(absPath)) {
    try {
      fs.unlinkSync(absPath);
    } catch {
      // ignore unlink error
    }
  }

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  logActivity(req, 'DELETE_DOCUMENT', 'Document Center', id, `Deleted document "${doc.title}"`);
  res.json({ message: 'Document removed.' });
});

export default router;
