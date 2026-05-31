import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { syncCampaignPayload } from '@/lib/campaigns';
import { revalidateDashboard } from '@/lib/revalidate';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  try {
    const imported = await syncCampaignPayload(body);
    revalidateDashboard('campaign-sync');
    return NextResponse.json({ ok: true, imported, note: 'No mails are sent by campaign sync.' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
