import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { getConsolidatedData } from '@/lib/reportData';

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;
  return NextResponse.json(getConsolidatedData());
}
