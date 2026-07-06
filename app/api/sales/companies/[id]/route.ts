import { NextRequest, NextResponse } from 'next/server';
import { AuthActor, requireActor } from '@/lib/auth-context';
import { getCompanyDetail, updateCompanyNextStep } from '@/lib/sales-os';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';

export const dynamic = 'force-dynamic';

function resolveMemberId(actor: AuthActor, req: NextRequest): string {
  return actor.type === 'member' && actor.memberId
    ? actor.memberId
    : (req.nextUrl.searchParams.get('memberId') ?? PAUL_MEMBER_ID);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:read'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const detail = await getCompanyDetail(id, resolveMemberId(actor, req));
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { allowMember: true, scopes: ['sales:write'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (typeof body.next_step !== 'string' && body.next_step !== null) {
    return NextResponse.json({ error: 'next_step (string|null) required' }, { status: 400 });
  }
  await updateCompanyNextStep(id, resolveMemberId(actor, req), body.next_step);
  return NextResponse.json({ ok: true });
}
