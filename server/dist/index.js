"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const helmet_1 = __importDefault(require("helmet"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const database_1 = require("./db/database");
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const inventory_1 = __importDefault(require("./routes/inventory"));
const audits_1 = __importDefault(require("./routes/audits"));
const reports_1 = __importDefault(require("./routes/reports"));
const documents_1 = __importDefault(require("./routes/documents"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const system_1 = __importDefault(require("./routes/system"));
const history_1 = __importDefault(require("./routes/history"));
const weeklyScheduler_1 = require("./services/weeklyScheduler");
(0, database_1.initDatabase)();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 4000;
app.use((0, helmet_1.default)({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
}));
app.use((0, cors_1.default)({
    origin: true,
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' }));
app.use((0, cookie_parser_1.default)());
// Serve uploaded photos & documents
app.use('/uploads', express_1.default.static(database_1.PATHS.UPLOADS_DIR));
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/inventory', inventory_1.default);
app.use('/api/audits', audits_1.default);
app.use('/api/reports', reports_1.default);
app.use('/api/documents', documents_1.default);
app.use('/api/dashboard', dashboard_1.default);
app.use('/api/system', system_1.default);
app.use('/api/history', history_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', system: 'BGCyouth Management System', timestamp: new Date().toISOString() });
});
// Serve built React frontend in production if present
const clientDist = node_path_1.default.resolve(__dirname, '../../client/dist');
if (node_fs_1.default.existsSync(clientDist)) {
    app.use(express_1.default.static(clientDist));
    app.use((_req, res) => {
        res.sendFile(node_path_1.default.join(clientDist, 'index.html'));
    });
}
// Error handler
app.use((err, _req, res, _next) => {
    console.error('Server error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});
app.listen(PORT, () => {
    console.log(`BGCyouth Server running on http://localhost:${PORT}`);
    (0, weeklyScheduler_1.startWeeklyScheduler)();
});
