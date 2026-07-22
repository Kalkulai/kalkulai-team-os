import { NextRequest, NextResponse } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { listCompaniesForMember, createCompany } from '@/lib/sales-os';
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

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = actor.type === 'member' ? actor.memberId! : PAUL_MEMBER_ID;
  const body = await req.json().catch(() => ({})) as { name?: string; website?: string; phone?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });
  try {
    const id = await createCompany({ name: body.name, website: body.website, phone: body.phone, ownerMemberId: memberId });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error('createCompany failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
