"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const auditLog_1 = require("../middleware/auditLog");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
router.get('/', (req, res) => {
    const { search = '', doc_type = '' } = req.query;
    const db = (0, database_1.getDb)();
    const conds = [];
    const params = [];
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
router.get('/:id/download', (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
    }
    const absPath = node_path_1.default.join(database_1.PATHS.UPLOADS_DIR, doc.file_path.replace(/^\/uploads\//, ''));
    if (!node_fs_1.default.existsSync(absPath)) {
        res.status(404).json({ error: 'File no longer exists on disk.' });
        return;
    }
    res.download(absPath, doc.file_name);
});
router.delete('/:id', (0, auth_1.authorize)('admin'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
    }
    const absPath = node_path_1.default.join(database_1.PATHS.UPLOADS_DIR, doc.file_path.replace(/^\/uploads\//, ''));
    if (node_fs_1.default.existsSync(absPath)) {
        try {
            node_fs_1.default.unlinkSync(absPath);
        }
        catch {
            // ignore unlink error
        }
    }
    db.prepare('DELETE FROM documents WHERE id = ?').run(id);
    (0, auditLog_1.logActivity)(req, 'DELETE_DOCUMENT', 'Document Center', id, `Deleted document "${doc.title}"`);
    res.json({ message: 'Document removed.' });
});
exports.default = router;
