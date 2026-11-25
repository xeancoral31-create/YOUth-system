import { NextResponse } from 'next/server';
import { ensureWeeklyScheduler } from '@/lib/weeklyScheduler';

export async function GET() {
  ensureWeeklyScheduler();
  return NextResponse.json({
    status: 'ok',
    system: 'BGCyouth Management System (Next.js)',
    timestamp: new Date().toISOString(),
  });
}
