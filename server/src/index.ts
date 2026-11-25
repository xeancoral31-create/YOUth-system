import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, PATHS } from './db/database';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import inventoryRoutes from './routes/inventory';
import auditRoutes from './routes/audits';
import reportRoutes from './routes/reports';
import documentRoutes from './routes/documents';
import dashboardRoutes from './routes/dashboard';
import systemRoutes from './routes/system';
import historyRoutes from './routes/history';
import { startWeeklyScheduler } from './services/weeklyScheduler';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 4000;
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Serve uploaded photos & documents
app.use('/uploads', express.static(PATHS.UPLOADS_DIR));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/history', historyRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', system: 'BGCyouth Management System', timestamp: new Date().toISOString() });
});

// Serve built React frontend in production if present
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`BGCyouth Server running on http://0.0.0.0:${PORT}`);
  startWeeklyScheduler();
});
