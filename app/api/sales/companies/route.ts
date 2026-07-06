import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { listCompaniesForMember } from '@/lib/sales-os';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:read'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId =
    actor.type === 'member' ? actor.memberId! : (req.nextUrl.searchParams.get('memberId') ?? PAUL_MEMBER_ID);
  const companies = await listCompaniesForMember(memberId);
  return NextResponse.json({ companies });
}
