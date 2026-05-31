import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { routeCampaignActions } from '@/lib/campaigns';
import { revalidateDashboard } from '@/lib/revalidate';

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await routeCampaignActions();
  revalidateDashboard('campaign-route-actions');
  return NextResponse.json(result);
}
