import { Router, Response } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { DatabaseSync } from 'node:sqlite';
import { closeDb, getDb, initDatabase, PATHS } from '../db/database';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { logActivity } from '../middleware/auditLog';

const router = Router();
router.use(authenticate);

const restoreUpload = multer({
  dest: PATHS.BACKUPS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Current user's own recent activity
router.get('/my-logs', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const logs = db
    .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 30')
    .all(req.user!.id);
  res.json({ logs });
});

// Organization & System Settings
router.get('/settings', (_req: AuthRequest, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value, updated_at FROM system_settings').all() as {
    key: string;
    value: string;
    updated_at: string;
  }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

router.put('/settings', authorize('admin'), (req: AuthRequest, res: Response) => {
  const allowedKeys = [
    'organization_name',
    'barangay_location',
    'default_approving_officer',
    'default_min_stock_level',
    'report_footer_note',
  ];
  const body = req.body ?? {};
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now', 'localtime')
  `);

  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      stmt.run(key, String(body[key]).trim());
    }
  }

  logActivity(req, 'UPDATE_SETTINGS', 'Settings', '', 'Updated organization and report settings');
  const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

// Activity logs
router.get('/logs', authorize('admin', 'auditor'), (req: AuthRequest, res: Response) => {
  const { module = '', search = '', limit = '150' } = req.query as Record<string, string>;
  const db = getDb();
  const conds: string[] = [];
  const params: any[] = [];

  if (module.trim()) {
    conds.push('module = ?');
    params.push(module.trim());
  }
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conds.push('(username LIKE ? OR action LIKE ? OR details LIKE ?)');
    params.push(q, q, q);
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const maxRows = Math.min(Number(limit) || 150, 500);
  const logs = db.prepare(`SELECT * FROM activity_logs ${where} ORDER BY id DESC LIMIT ?`).all(...params, maxRows);
  res.json({ logs });
});

// Database integrity & backup list
router.get('/backups', authorize('admin'), (_req: AuthRequest, res: Response) => {
  const db = getDb();
  const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  const files = fs
    .readdirSync(PATHS.BACKUPS_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(PATHS.BACKUPS_DIR, f));
      return {
        file_name: f,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  res.json({
    integrity: integrity.integrity_check,
    backups: files,
  });
});

// Create live SQLite backup
router.post('/backups', authorize('admin'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `bgcyouth_backup_${stamp}.db`;
    const backupPath = path.join(PATHS.BACKUPS_DIR, fileName);

    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    const stat = fs.statSync(backupPath);

    logActivity(req, 'CREATE_BACKUP', 'System', fileName, `Created database backup (${stat.size} bytes)`);
    res.status(201).json({
      backup: {
        file_name: fileName,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: `Backup failed: ${err.message}` });
  }
});

// Download backup file
router.get('/backups/:fileName/download', authorize('admin'), (req: AuthRequest, res: Response) => {
  const fileName = path.basename(String(req.params.fileName));
  const filePath = path.join(PATHS.BACKUPS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Backup file not found.' });
    return;
  }
  res.download(filePath, fileName);
});

// Restore database from uploaded .db backup
router.post('/restore', authorize('admin'), restoreUpload.single('backup'), (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No backup .db file uploaded.' });
    return;
  }

  const uploadedPath = req.file.path;
  try {
    // Verify SQLite integrity before replacing live DB
    const testDb = new DatabaseSync(uploadedPath, { readOnly: true });
    const check = testDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const hasUsers = testDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
      .get();
    testDb.close();

    if (check.integrity_check !== 'ok' || !hasUsers) {
      fs.unlinkSync(uploadedPath);
      res.status(400).json({ error: 'Uploaded file is not a valid BGCyouth SQLite backup.' });
      return;
    }

    // Create safety pre-restore backup first
    const currentDb = getDb();
    const safetyName = `pre_restore_${Date.now()}.db`;
    currentDb.exec(`VACUUM INTO '${path.join(PATHS.BACKUPS_DIR, safetyName).replace(/'/g, "''")}'`);
    closeDb();

    fs.copyFileSync(uploadedPath, PATHS.DB_PATH);
    fs.unlinkSync(uploadedPath);

    // Clean WAL/SHM sidecar files if present
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(PATHS.DB_PATH + suffix)) {
        fs.unlinkSync(PATHS.DB_PATH + suffix);
      }
    }

    initDatabase();
    logActivity(req, 'RESTORE_BACKUP', 'System', '', `Restored database from ${req.file.originalname}`);
    res.json({ message: 'Database restored successfully. A pre-restore safety backup was saved.' });
  } catch (err: any) {
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    initDatabase();
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  }
});

export default router;
