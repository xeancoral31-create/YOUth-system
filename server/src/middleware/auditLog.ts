import { getDb } from '../db/database';
import { AuthRequest } from './auth';

export function logActivity(
  req: AuthRequest,
  action: string,
  module: string,
  entityId: string | number = '',
  details: string = ''
): void {
  try {
    const db = getDb();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    db.prepare(`
      INSERT INTO activity_logs (user_id, username, role, action, module, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user?.id ?? null,
      req.user?.username ?? 'system',
      req.user?.role ?? 'system',
      action,
      module,
      String(entityId),
      details,
      ip
    );
  } catch (err) {
    console.error('Failed to write activity log:', err);
  }
}
