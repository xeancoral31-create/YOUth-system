"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.authenticate = authenticate;
exports.authorize = authorize;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../db/database");
const JWT_SECRET = process.env.BGCYOUTH_JWT_SECRET || 'bgcyouth-official-secret-key-change-in-production-2026';
function signToken(user) {
    return jsonwebtoken_1.default.sign({
        id: user.id,
        username: user.username,
        role: user.role,
    }, JWT_SECRET, { expiresIn: '12h' });
}
function authenticate(req, res, next) {
    const cookieToken = req.cookies?.bgcyouth_token;
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = cookieToken || bearerToken;
    if (!token) {
        res.status(401).json({ error: 'Authentication required. Please log in.' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const db = (0, database_1.getDb)();
        const user = db
            .prepare('SELECT id, username, full_name, email, role, position, is_active FROM users WHERE id = ?')
            .get(decoded.id);
        if (!user || !user.is_active) {
            res.status(401).json({ error: 'Account is inactive or no longer exists.' });
            return;
        }
        req.user = {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            email: user.email,
            role: user.role,
            position: user.position,
        };
        next();
    }
    catch {
        res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }
}
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required.' });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                error: `Access denied. Required role: ${allowedRoles.join(' or ')}. Your role: ${req.user.role}.`,
            });
            return;
        }
        next();
    };
}
