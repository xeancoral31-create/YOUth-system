import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { getDb, PATHS } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const db = getDb();
  const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  const files = fs
    .readdirSync(PATHS.BACKUPS_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const stat = fs.statSync(path.join(PATHS.BACKUPS_DIR, f));
      return {
        file_name: f,
        size: stat.size,
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({
    integrity: integrity.integrity_check,
    backups: files,
  });
}

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  try {
    const db = getDb();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `bgcyouth_backup_${stamp}.db`;
    const backupPath = path.join(PATHS.BACKUPS_DIR, fileName);

    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
    const stat = fs.statSync(backupPath);

    logActivity(req, auth.user, 'CREATE_BACKUP', 'System', fileName, `Created database backup (${stat.size} bytes)`);
    return NextResponse.json(
      {
        backup: {
          file_name: fileName,
          size: stat.size,
          created_at: stat.mtime.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: `Backup failed: ${err.message}` }, { status: 500 });
  }
}
