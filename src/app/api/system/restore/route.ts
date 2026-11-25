import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { closeDb, getDb, initDatabase, PATHS } from '@/lib/database';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get('backup') as File | null;
  if (!file) {
    return NextResponse.json({ error: 'No backup .db file uploaded.' }, { status: 400 });
  }

  const uploadedPath = path.join(PATHS.BACKUPS_DIR, `upload_${Date.now()}.db`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(uploadedPath, Buffer.from(arrayBuffer));

    const testDb = new DatabaseSync(uploadedPath, { readOnly: true });
    const check = testDb.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const hasUsers = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
    testDb.close();

    if (check.integrity_check !== 'ok' || !hasUsers) {
      fs.unlinkSync(uploadedPath);
      return NextResponse.json({ error: 'Uploaded file is not a valid BGCyouth SQLite backup.' }, { status: 400 });
    }

    const currentDb = getDb();
    const safetyName = `pre_restore_${Date.now()}.db`;
    currentDb.exec(`VACUUM INTO '${path.join(PATHS.BACKUPS_DIR, safetyName).replace(/'/g, "''")}'`);
    closeDb();

    fs.copyFileSync(uploadedPath, PATHS.DB_PATH);
    fs.unlinkSync(uploadedPath);

    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(PATHS.DB_PATH + suffix)) {
        fs.unlinkSync(PATHS.DB_PATH + suffix);
      }
    }

    initDatabase();
    logActivity(req, auth.user, 'RESTORE_BACKUP', 'System', '', `Restored database from ${file.name}`);
    return NextResponse.json({ message: 'Database restored successfully. A pre-restore safety backup was saved.' });
  } catch (err: any) {
    if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    initDatabase();
    return NextResponse.json({ error: `Restore failed: ${err.message}` }, { status: 500 });
  }
}
