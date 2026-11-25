import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, logActivity } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth.error) return auth.error;

  logActivity(req, auth.user, 'LOGOUT', 'Auth', auth.user.id, `User ${auth.user.username} logged out`);
  const res = NextResponse.json({ message: 'Logged out successfully.' });
  res.cookies.delete('bgcyouth_token');
  return res;
}
