"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logActivity = logActivity;
const database_1 = require("../db/database");
function logActivity(req, action, module, entityId = '', details = '') {
    try {
        const db = (0, database_1.getDb)();
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket.remoteAddress ||
            '';
        db.prepare(`
      INSERT INTO activity_logs (user_id, username, role, action, module, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user?.id ?? null, req.user?.username ?? 'system', req.user?.role ?? 'system', action, module, String(entityId), details, ip);
    }
    catch (err) {
        console.error('Failed to write activity log:', err);
    }
}
