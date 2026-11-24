import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/database';
import { authenticate, authorize, AuthRequest, UserRole } from '../middleware/auth';
import { logActivity } from '../middleware/auditLog';

const router = Router();
const VALID_ROLES: UserRole[] = ['admin', 'auditor', 'staff', 'viewer'];

router.use(authenticate);

router.get('/', authorize('admin', 'auditor'), (_req: AuthRequest, res: Response) => {
  const db = getDb();
  const users = db
    .prepare('SELECT id, username, full_name, email, role, position, is_active, created_at, updated_at FROM users ORDER BY created_at DESC')
    .all();
  res.json({ users });
});

router.post('/', authorize('admin'), (req: AuthRequest, res: Response) => {
  const { username, full_name, email, password, role, position } = req.body ?? {};

  if (!username || !full_name || !email || !password || !role) {
    res.status(400).json({ error: 'Username, full name, email, password, and role are required.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (!VALID_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Allowed: ${VALID_ROLES.join(', ')}` });
    return;
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
    .get(username.trim(), email.trim());
  if (existing) {
    res.status(409).json({ error: 'Username or email is already registered.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare(`
      INSERT INTO users (username, full_name, email, password_hash, role, position, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `)
    .run(username.trim(), full_name.trim(), email.trim(), hash, role, (position ?? '').trim());

  const created = db
    .prepare('SELECT id, username, full_name, email, role, position, is_active, created_at FROM users WHERE id = ?')
    .get(result.lastInsertRowid);

  logActivity(req, 'CREATE_USER', 'Users', Number(result.lastInsertRowid), `Created user ${username} with role ${role}`);
  res.status(201).json({ user: created });
});

router.put('/:id', authorize('admin'), (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { full_name, email, role, position, is_active, password } = req.body ?? {};

  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
  if (!existing) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (role && !VALID_ROLES.includes(role)) {
    res.status(400).json({ error: 'Invalid role.' });
    return;
  }

  // Prevent admin from deactivating themselves
  if (id === req.user!.id && is_active === false) {
    res.status(400).json({ error: 'You cannot deactivate your own active administrator account.' });
    return;
  }

  if (password && typeof password === 'string') {
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }
    const newHash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, id);
  }

  db.prepare(`
    UPDATE users
    SET full_name = ?, email = ?, role = ?, position = ?, is_active = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    (full_name ?? existing.full_name).trim(),
    (email ?? existing.email).trim(),
    role ?? existing.role,
    (position ?? existing.position).trim(),
    typeof is_active === 'boolean' ? (is_active ? 1 : 0) : existing.is_active,
    id
  );

  const updated = db
    .prepare('SELECT id, username, full_name, email, role, position, is_active, created_at, updated_at FROM users WHERE id = ?')
    .get(id);

  logActivity(req, 'UPDATE_USER', 'Users', id, `Updated user ${existing.username}`);
  res.json({ user: updated });
});

export default router;
