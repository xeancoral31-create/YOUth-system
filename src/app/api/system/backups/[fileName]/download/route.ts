import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { PATHS } from '@/lib/database';
import { authenticateRequest } from '@/lib/auth';

export async function GET(req: NextRequest, context: { params: Promise<{ fileName: string }> }) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  const { fileName: rawName } = await context.params;
  const fileName = path.basename(rawName);
  const filePath = path.join(PATHS.BACKUPS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Backup file not found.' }, { status: 404 });
  }

  const buf = fs.readFileSync(filePath);
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
