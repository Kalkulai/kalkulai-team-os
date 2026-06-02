import { NextRequest, NextResponse } from 'next/server';
import { requireActor, type AuthActor } from '@/lib/auth-context';
import { recordAuditEvent } from '@/lib/audit';
import { listConversations, createConversation } from '@/lib/hermes-chat';

function subjectMemberId(actor: AuthActor, requested: string | null | undefined): string | null {
  return requested || actor.memberId || null;
}

export async function GET(req: NextRequest) {
  const actor = await requireActor(req, { scopes: ['hermes:chat'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = subjectMemberId(actor, req.nextUrl.searchParams.get('memberId'));
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const conversations = await listConversations(memberId);
  return NextResponse.json(conversations);
}

export async function POST(req: NextRequest) {
  const actor = await requireActor(req, { scopes: ['hermes:chat'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { memberId?: string; title?: string } | null;
  const memberId = subjectMemberId(actor, body?.memberId);
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const conv = await createConversation(memberId, body?.title);
  await recordAuditEvent({
    actor,
    scope: 'hermes:chat',
    action: 'hermes.conversation.create',
    resourceType: 'hermes_conversation',
    resourceId: conv.id,
    onBehalfOfMemberId: memberId,
  });
  return NextResponse.json(conv);
}
