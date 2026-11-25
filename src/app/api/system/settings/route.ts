import { NextRequest, NextResponse } from 'next/server';
import { getDb, getDbSettings } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;
  return NextResponse.json({ settings: getDbSettings() });
}

export async function PUT(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const allowedKeys = [
    'organization_name',
    'barangay_location',
    'default_approving_officer',
    'default_min_stock_level',
    'report_footer_note',
  ];
  const body = await req.json().catch(() => ({}));
  const db = getDb();
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

  logActivity(req, auth.user, 'UPDATE_SETTINGS', 'Settings', '', 'Updated organization and report settings');
  return NextResponse.json({ settings: getDbSettings() });
}
