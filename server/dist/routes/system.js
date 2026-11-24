"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const multer_1 = __importDefault(require("multer"));
const node_sqlite_1 = require("node:sqlite");
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const auditLog_1 = require("../middleware/auditLog");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const restoreUpload = (0, multer_1.default)({
    dest: database_1.PATHS.BACKUPS_DIR,
    limits: { fileSize: 100 * 1024 * 1024 },
});
// Current user's own recent activity
router.get('/my-logs', (req, res) => {
    const db = (0, database_1.getDb)();
    const logs = db
        .prepare('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 30')
        .all(req.user.id);
    res.json({ logs });
});
// Organization & System Settings
router.get('/settings', (_req, res) => {
    const db = (0, database_1.getDb)();
    const rows = db.prepare('SELECT key, value, updated_at FROM system_settings').all();
    const settings = {};
    for (const r of rows)
        settings[r.key] = r.value;
    res.json({ settings });
});
router.put('/settings', (0, auth_1.authorize)('admin'), (req, res) => {
    const allowedKeys = [
        'organization_name',
        'barangay_location',
        'default_approving_officer',
        'default_min_stock_level',
        'report_footer_note',
    ];
    const body = req.body ?? {};
    const db = (0, database_1.getDb)();
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
    (0, auditLog_1.logActivity)(req, 'UPDATE_SETTINGS', 'Settings', '', 'Updated organization and report settings');
    const rows = db.prepare('SELECT key, value FROM system_settings').all();
    const settings = {};
    for (const r of rows)
        settings[r.key] = r.value;
    res.json({ settings });
});
// Activity logs
router.get('/logs', (0, auth_1.authorize)('admin', 'auditor'), (req, res) => {
    const { module = '', search = '', limit = '150' } = req.query;
    const db = (0, database_1.getDb)();
    const conds = [];
    const params = [];
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
router.get('/backups', (0, auth_1.authorize)('admin'), (_req, res) => {
    const db = (0, database_1.getDb)();
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const files = node_fs_1.default
        .readdirSync(database_1.PATHS.BACKUPS_DIR)
        .filter((f) => f.endsWith('.db'))
        .map((f) => {
        const stat = node_fs_1.default.statSync(node_path_1.default.join(database_1.PATHS.BACKUPS_DIR, f));
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
router.post('/backups', (0, auth_1.authorize)('admin'), (req, res) => {
    try {
        const db = (0, database_1.getDb)();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const fileName = `bgcyouth_backup_${stamp}.db`;
        const backupPath = node_path_1.default.join(database_1.PATHS.BACKUPS_DIR, fileName);
        db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
        const stat = node_fs_1.default.statSync(backupPath);
        (0, auditLog_1.logActivity)(req, 'CREATE_BACKUP', 'System', fileName, `Created database backup (${stat.size} bytes)`);
        res.status(201).json({
            backup: {
                file_name: fileName,
                size: stat.size,
                created_at: stat.mtime.toISOString(),
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: `Backup failed: ${err.message}` });
    }
});
// Download backup file
router.get('/backups/:fileName/download', (0, auth_1.authorize)('admin'), (req, res) => {
    const fileName = node_path_1.default.basename(String(req.params.fileName));
    const filePath = node_path_1.default.join(database_1.PATHS.BACKUPS_DIR, fileName);
    if (!node_fs_1.default.existsSync(filePath)) {
        res.status(404).json({ error: 'Backup file not found.' });
        return;
    }
    res.download(filePath, fileName);
});
// Restore database from uploaded .db backup
router.post('/restore', (0, auth_1.authorize)('admin'), restoreUpload.single('backup'), (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: 'No backup .db file uploaded.' });
        return;
    }
    const uploadedPath = req.file.path;
    try {
        // Verify SQLite integrity before replacing live DB
        const testDb = new node_sqlite_1.DatabaseSync(uploadedPath, { readOnly: true });
        const check = testDb.prepare('PRAGMA integrity_check').get();
        const hasUsers = testDb
            .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
            .get();
        testDb.close();
        if (check.integrity_check !== 'ok' || !hasUsers) {
            node_fs_1.default.unlinkSync(uploadedPath);
            res.status(400).json({ error: 'Uploaded file is not a valid BGCyouth SQLite backup.' });
            return;
        }
        // Create safety pre-restore backup first
        const currentDb = (0, database_1.getDb)();
        const safetyName = `pre_restore_${Date.now()}.db`;
        currentDb.exec(`VACUUM INTO '${node_path_1.default.join(database_1.PATHS.BACKUPS_DIR, safetyName).replace(/'/g, "''")}'`);
        (0, database_1.closeDb)();
        node_fs_1.default.copyFileSync(uploadedPath, database_1.PATHS.DB_PATH);
        node_fs_1.default.unlinkSync(uploadedPath);
        // Clean WAL/SHM sidecar files if present
        for (const suffix of ['-wal', '-shm']) {
            if (node_fs_1.default.existsSync(database_1.PATHS.DB_PATH + suffix)) {
                node_fs_1.default.unlinkSync(database_1.PATHS.DB_PATH + suffix);
            }
        }
        (0, database_1.initDatabase)();
        (0, auditLog_1.logActivity)(req, 'RESTORE_BACKUP', 'System', '', `Restored database from ${req.file.originalname}`);
        res.json({ message: 'Database restored successfully. A pre-restore safety backup was saved.' });
    }
    catch (err) {
        if (node_fs_1.default.existsSync(uploadedPath))
            node_fs_1.default.unlinkSync(uploadedPath);
        (0, database_1.initDatabase)();
        res.status(500).json({ error: `Restore failed: ${err.message}` });
    }
});
exports.default = router;
