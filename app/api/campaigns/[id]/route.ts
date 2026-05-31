import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getCampaignDetail } from '@/lib/campaigns';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const campaign = await getCampaignDetail(id);
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 });
  return NextResponse.json({ campaign });
}
