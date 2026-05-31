import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { listCampaignSummaries } from '@/lib/campaigns';

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const campaigns = await listCampaignSummaries();
  return NextResponse.json({ campaigns });
}
