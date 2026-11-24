"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const auditLog_1 = require("../middleware/auditLog");
const pdfGenerator_1 = require("../utils/pdfGenerator");
const format_1 = require("../utils/format");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
const photoStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, database_1.PATHS.PHOTOS_DIR),
    filename: (_req, file, cb) => {
        const ext = node_path_1.default.extname(file.originalname).toLowerCase();
        cb(null, `photo_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`);
    },
});
const uploadPhoto = (0, multer_1.default)({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = node_path_1.default.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
            cb(new Error('Only JPG, PNG, or WEBP images are allowed for profile photos.'));
            return;
        }
        cb(null, true);
    },
});
const docStorage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, database_1.PATHS.DOCS_DIR),
    filename: (_req, file, cb) => {
        cb(null, `cvdoc_${Date.now()}_${(0, format_1.sanitizeFilename)(file.originalname)}`);
    },
});
const uploadSupportingDoc = (0, multer_1.default)({
    storage: docStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];
        const ext = node_path_1.default.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
            cb(new Error('Allowed supporting document formats: PDF, JPG, PNG, DOC, DOCX.'));
            return;
        }
        cb(null, true);
    },
});
function parseCvRow(row) {
    if (!row)
        return null;
    const parseJson = (str) => {
        try {
            return JSON.parse(str || '[]');
        }
        catch {
            return [];
        }
    };
    return {
        ...row,
        education: parseJson(row.education_json),
        experience: parseJson(row.experience_json),
        skills: parseJson(row.skills_json),
        achievements: parseJson(row.achievements_json),
        training: parseJson(row.training_json),
        references: parseJson(row.references_json),
        supporting_docs: parseJson(row.supporting_docs_json),
    };
}
router.get('/', (req, res) => {
    const { search = '', status = '' } = req.query;
    const db = (0, database_1.getDb)();
    const conds = [];
    const params = [];
    if (search.trim()) {
        const q = `%${search.trim()}%`;
        conds.push('(full_name LIKE ? OR position LIKE ? OR email LIKE ?)');
        params.push(q, q, q);
    }
    if (status === 'Active' || status === 'Inactive') {
        conds.push('status = ?');
        params.push(status);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM cvs ${where} ORDER BY updated_at DESC, id DESC`).all(...params);
    res.json({ cvs: rows.map(parseCvRow) });
});
router.get('/:id', (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const row = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    if (!row) {
        res.status(404).json({ error: 'CV record not found.' });
        return;
    }
    res.json({ cv: parseCvRow(row) });
});
router.post('/', (0, auth_1.authorize)('admin', 'staff', 'auditor'), (req, res) => {
    const { full_name, position, email, phone, address, date_of_birth, civil_status, nationality, objective, education, experience, skills, achievements, training, references, status, } = req.body ?? {};
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        res.status(400).json({ error: 'Full name is required.' });
        return;
    }
    const db = (0, database_1.getDb)();
    const result = db
        .prepare(`
      INSERT INTO cvs (
        full_name, position, email, phone, address, date_of_birth, civil_status, nationality,
        objective, education_json, experience_json, skills_json, achievements_json,
        training_json, references_json, status, created_by, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
        .run(full_name.trim(), (position ?? '').trim(), (email ?? '').trim(), (phone ?? '').trim(), (address ?? '').trim(), (date_of_birth ?? '').trim(), (civil_status ?? '').trim(), (nationality ?? '').trim(), (objective ?? '').trim(), JSON.stringify(Array.isArray(education) ? education : []), JSON.stringify(Array.isArray(experience) ? experience : []), JSON.stringify(Array.isArray(skills) ? skills : []), JSON.stringify(Array.isArray(achievements) ? achievements : []), JSON.stringify(Array.isArray(training) ? training : []), JSON.stringify(Array.isArray(references) ? references : []), status === 'Inactive' ? 'Inactive' : 'Active', req.user.id, req.user.id);
    const id = Number(result.lastInsertRowid);
    const created = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    (0, auditLog_1.logActivity)(req, 'CREATE_CV', 'CV', id, `Created CV for ${full_name.trim()}`);
    res.status(201).json({ cv: parseCvRow(created) });
});
router.put('/:id', (0, auth_1.authorize)('admin', 'staff', 'auditor'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const existing = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: 'CV record not found.' });
        return;
    }
    const b = req.body ?? {};
    const nextName = b.full_name !== undefined ? String(b.full_name).trim() : existing.full_name;
    if (!nextName) {
        res.status(400).json({ error: 'Full name cannot be empty.' });
        return;
    }
    db.prepare(`
    UPDATE cvs
    SET full_name = ?, position = ?, email = ?, phone = ?, address = ?, date_of_birth = ?,
        civil_status = ?, nationality = ?, objective = ?, education_json = ?, experience_json = ?,
        skills_json = ?, achievements_json = ?, training_json = ?, references_json = ?,
        status = ?, updated_by = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(nextName, b.position !== undefined ? String(b.position).trim() : existing.position, b.email !== undefined ? String(b.email).trim() : existing.email, b.phone !== undefined ? String(b.phone).trim() : existing.phone, b.address !== undefined ? String(b.address).trim() : existing.address, b.date_of_birth !== undefined ? String(b.date_of_birth).trim() : existing.date_of_birth, b.civil_status !== undefined ? String(b.civil_status).trim() : existing.civil_status, b.nationality !== undefined ? String(b.nationality).trim() : existing.nationality, b.objective !== undefined ? String(b.objective).trim() : existing.objective, b.education !== undefined ? JSON.stringify(Array.isArray(b.education) ? b.education : []) : existing.education_json, b.experience !== undefined ? JSON.stringify(Array.isArray(b.experience) ? b.experience : []) : existing.experience_json, b.skills !== undefined ? JSON.stringify(Array.isArray(b.skills) ? b.skills : []) : existing.skills_json, b.achievements !== undefined ? JSON.stringify(Array.isArray(b.achievements) ? b.achievements : []) : existing.achievements_json, b.training !== undefined ? JSON.stringify(Array.isArray(b.training) ? b.training : []) : existing.training_json, b.references !== undefined ? JSON.stringify(Array.isArray(b.references) ? b.references : []) : existing.references_json, b.status === 'Inactive' ? 'Inactive' : b.status === 'Active' ? 'Active' : existing.status, req.user.id, id);
    const updated = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    (0, auditLog_1.logActivity)(req, 'UPDATE_CV', 'CV', id, `Updated CV for ${nextName}`);
    res.json({ cv: parseCvRow(updated) });
});
// Upload profile photo
router.post('/:id/photo', (0, auth_1.authorize)('admin', 'staff', 'auditor'), uploadPhoto.single('photo'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const existing = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: 'CV record not found.' });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: 'No photo file uploaded.' });
        return;
    }
    const photoPath = `/uploads/photos/${req.file.filename}`;
    db.prepare(`UPDATE cvs SET photo_path = ?, updated_by = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(photoPath, req.user.id, id);
    (0, auditLog_1.logActivity)(req, 'UPLOAD_CV_PHOTO', 'CV', id, `Uploaded profile photo for ${existing.full_name}`);
    res.json({ photo_path: photoPath, cv: parseCvRow(db.prepare('SELECT * FROM cvs WHERE id = ?').get(id)) });
});
// Upload supporting document & register in Document Center
router.post('/:id/documents', (0, auth_1.authorize)('admin', 'staff', 'auditor'), uploadSupportingDoc.single('document'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const existing = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: 'CV record not found.' });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: 'No document file uploaded.' });
        return;
    }
    const docs = JSON.parse(existing.supporting_docs_json || '[]');
    const docEntry = {
        id: Date.now(),
        original_name: req.file.originalname,
        file_name: req.file.filename,
        file_path: `/uploads/documents/${req.file.filename}`,
        size: req.file.size,
        uploaded_at: new Date().toISOString(),
    };
    docs.push(docEntry);
    db.prepare(`UPDATE cvs SET supporting_docs_json = ?, updated_by = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(JSON.stringify(docs), req.user.id, id);
    db.prepare(`
    INSERT INTO documents (
      title, doc_type, reference_no, file_name, file_path, mime_type,
      file_size, related_module, related_id, generated_by, generated_by_name
    ) VALUES (?, 'Supporting Document', ?, ?, ?, ?, ?, 'CV', ?, ?, ?)
  `).run(`${existing.full_name} — ${req.file.originalname}`, `CV-${id}`, req.file.filename, docEntry.file_path, req.file.mimetype, req.file.size, id, req.user.id, req.user.full_name);
    (0, auditLog_1.logActivity)(req, 'UPLOAD_CV_DOC', 'CV', id, `Uploaded supporting document "${req.file.originalname}"`);
    res.json({ document: docEntry, cv: parseCvRow(db.prepare('SELECT * FROM cvs WHERE id = ?').get(id)) });
});
// Delete supporting document from CV
router.delete('/:id/documents/:docId', (0, auth_1.authorize)('admin', 'staff', 'auditor'), (req, res) => {
    const id = Number(req.params.id);
    const docId = Number(req.params.docId);
    const db = (0, database_1.getDb)();
    const existing = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: 'CV record not found.' });
        return;
    }
    const docs = JSON.parse(existing.supporting_docs_json || '[]');
    const filtered = docs.filter((d) => d.id !== docId);
    db.prepare(`UPDATE cvs SET supporting_docs_json = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(JSON.stringify(filtered), id);
    res.json({ cv: parseCvRow(db.prepare('SELECT * FROM cvs WHERE id = ?').get(id)) });
});
// Export CV to official A4 PDF & register in Document Center
router.get('/:id/pdf', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const db = (0, database_1.getDb)();
        const row = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
        if (!row) {
            res.status(404).json({ error: 'CV record not found.' });
            return;
        }
        const cv = parseCvRow(row);
        const fileName = (0, format_1.sanitizeFilename)(`CV_${cv.full_name}_${Date.now()}.pdf`);
        const filePath = node_path_1.default.join(database_1.PATHS.GENERATED_DIR, fileName);
        await (0, pdfGenerator_1.generateCvPdf)(filePath, cv, database_1.PATHS.UPLOADS_DIR);
        const stats = node_fs_1.default.statSync(filePath);
        db.prepare(`
      INSERT INTO documents (
        title, doc_type, reference_no, file_name, file_path, mime_type,
        file_size, related_module, related_id, generated_by, generated_by_name
      ) VALUES (?, 'CV Export', ?, ?, ?, 'application/pdf', ?, 'CV', ?, ?, ?)
    `).run(`Curriculum Vitae — ${cv.full_name}`, `CV-${id}`, fileName, `/uploads/generated/${fileName}`, stats.size, id, req.user.id, req.user.full_name);
        (0, auditLog_1.logActivity)(req, 'EXPORT_CV_PDF', 'CV', id, `Exported CV PDF for ${cv.full_name}`);
        res.download(filePath, fileName);
    }
    catch (err) {
        res.status(500).json({ error: `Failed to export CV PDF: ${err.message}` });
    }
});
router.delete('/:id', (0, auth_1.authorize)('admin', 'staff'), (req, res) => {
    const id = Number(req.params.id);
    const db = (0, database_1.getDb)();
    const existing = db.prepare('SELECT * FROM cvs WHERE id = ?').get(id);
    if (!existing) {
        res.status(404).json({ error: 'CV record not found.' });
        return;
    }
    db.prepare('DELETE FROM cvs WHERE id = ?').run(id);
    (0, auditLog_1.logActivity)(req, 'DELETE_CV', 'CV', id, `Deleted CV for ${existing.full_name}`);
    res.json({ message: 'CV deleted.' });
});
exports.default = router;
