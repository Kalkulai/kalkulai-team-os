import { NextRequest, NextResponse } from 'next/server';
import { AuthActor, requireActor } from '@/lib/auth-context';
import { getCompanyDetail, updateCompanyNextStep, updateCompanyPilotStatus, updateCompanyStage } from '@/lib/sales-os';
import { PAUL_MEMBER_ID } from '@/lib/sales-access';
import type { SalesStage } from '@/types/sales';

export const dynamic = 'force-dynamic';

const VALID_STAGES: SalesStage[] = [
  'prospecting', 'discovery', 'evaluation', 'pilot', 'expansion', 'customer', 'disqualified',
];

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
  const memberId = resolveMemberId(actor, req);

  if ('stage' in body) {
    const s = body.stage as unknown;
    if (!VALID_STAGES.includes(s as SalesStage)) {
      return NextResponse.json({ error: 'Ungültige Stage' }, { status: 400 });
    }
    await updateCompanyStage(id, memberId, s as SalesStage);
    return NextResponse.json({ ok: true });
  }

  if ('pilot_status' in body) {
    const ps = body.pilot_status as unknown;
    if (ps !== null && ps !== 'active' && ps !== 'committed') {
      return NextResponse.json({ error: 'Invalid pilot_status' }, { status: 400 });
    }
    await updateCompanyPilotStatus(id, memberId, ps as 'active' | 'committed' | null);
    return NextResponse.json({ ok: true });
  }

  if (typeof body.next_step !== 'string' && body.next_step !== null) {
    return NextResponse.json({ error: 'next_step (string|null) required' }, { status: 400 });
  }
  await updateCompanyNextStep(id, memberId, body.next_step);
  return NextResponse.json({ ok: true });
}
