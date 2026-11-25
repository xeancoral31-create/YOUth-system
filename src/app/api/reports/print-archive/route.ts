import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth';
import { archiveAndResetInventory } from '@/lib/archiveResetService';

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req, 'admin');
  if (auth.error) return auth.error;

  try {
    const { archive_ref, period_label } = await req.json().catch(() => ({}));
    const result = archiveAndResetInventory({
      triggerType: 'Print Report',
      performedById: auth.user.id,
      performedByName: auth.user.full_name,
      archiveRef: typeof archive_ref === 'string' && archive_ref.trim() ? archive_ref.trim() : undefined,
      periodLabel: typeof period_label === 'string' && period_label.trim() ? period_label.trim() : undefined,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Inventory could not be reset because historical records were not successfully saved: ${err.message}` },
      { status: 500 }
    );
  }
}
