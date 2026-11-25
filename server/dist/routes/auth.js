"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../db/database");
const auth_1 = require("../middleware/auth");
const auditLog_1 = require("../middleware/auditLog");
const router = (0, express_1.Router)();
router.post('/login', (req, res) => {
    const { username, password } = req.body ?? {};
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Username and password are required.' });
        return;
    }
    const db = (0, database_1.getDb)();
    const user = db
        .prepare('SELECT id, username, full_name, email, password_hash, role, position, is_active FROM users WHERE username = ? OR email = ?')
        .get(username.trim(), username.trim());
    if (!user || !bcryptjs_1.default.compareSync(password, user.password_hash)) {
        res.status(401).json({ error: 'Invalid username or password.' });
        return;
    }
    if (!user.is_active) {
        res.status(403).json({ error: 'Your account has been deactivated. Contact an administrator.' });
        return;
    }
    const authUser = {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        position: user.position,
    };
    const token = (0, auth_1.signToken)(authUser);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.cookie('bgcyouth_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isHttps,
        maxAge: 12 * 60 * 60 * 1000,
    });
    const authReq = req;
    authReq.user = authUser;
    (0, auditLog_1.logActivity)(authReq, 'LOGIN', 'Auth', user.id, `User ${user.username} logged in`);
    res.json({ user: authUser, token });
});
router.post('/logout', auth_1.authenticate, (req, res) => {
    (0, auditLog_1.logActivity)(req, 'LOGOUT', 'Auth', req.user?.id ?? '', `User ${req.user?.username} logged out`);
    res.clearCookie('bgcyouth_token');
    res.json({ message: 'Logged out successfully.' });
});
router.get('/me', auth_1.authenticate, (req, res) => {
    res.json({ user: req.user });
});
router.put('/profile', auth_1.authenticate, (req, res) => {
    const { full_name, email, position } = req.body ?? {};
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        res.status(400).json({ error: 'Full name is required.' });
        return;
    }
    if (!email || typeof email !== 'string' || !email.trim()) {
        res.status(400).json({ error: 'Email address is required.' });
        return;
    }
    const db = (0, database_1.getDb)();
    const conflict = db
        .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?')
        .get(email.trim(), req.user.id);
    if (conflict) {
        res.status(409).json({ error: 'This email address is already used by another account.' });
        return;
    }
    db.prepare(`
    UPDATE users
    SET full_name = ?, email = ?, position = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(full_name.trim(), email.trim(), (position ?? '').trim(), req.user.id);
    const updated = db
        .prepare('SELECT id, username, full_name, email, role, position FROM users WHERE id = ?')
        .get(req.user.id);
    (0, auditLog_1.logActivity)(req, 'UPDATE_PROFILE', 'Settings', req.user.id, 'Updated account profile details');
    res.json({ user: updated });
});
router.post('/change-password', auth_1.authenticate, (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        res.status(400).json({ error: 'Current password and a new password (min 8 characters) are required.' });
        return;
    }
    const db = (0, database_1.getDb)();
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user || !bcryptjs_1.default.compareSync(currentPassword, user.password_hash)) {
        res.status(400).json({ error: 'Current password is incorrect.' });
        return;
    }
    const newHash = bcryptjs_1.default.hashSync(newPassword, 12);
    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`).run(newHash, req.user.id);
    (0, auditLog_1.logActivity)(req, 'CHANGE_PASSWORD', 'Auth', req.user.id, 'User changed their password');
    res.json({ message: 'Password updated successfully.' });
});
exports.default = router;
