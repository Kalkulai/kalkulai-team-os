import { NextRequest, NextResponse } from 'next/server';
import { requireActor, type AuthActor } from '@/lib/auth-context';
import { recordAuditEvent } from '@/lib/audit';
import { getConversation, updateConversationTitle, deleteConversation, getMessages } from '@/lib/hermes-chat';

function subjectMemberId(actor: AuthActor, requested: string | null | undefined): string | null {
  return requested || actor.memberId || null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { scopes: ['hermes:chat'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = subjectMemberId(actor, req.nextUrl.searchParams.get('memberId'));
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const { id } = await params;
  const conv = await getConversation(id, memberId);
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const messages = await getMessages(id);
  return NextResponse.json({ conversation: conv, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { scopes: ['hermes:chat'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { memberId?: string; title?: string } | null;
  const memberId = subjectMemberId(actor, body?.memberId);
  if (!memberId || !body?.title) return NextResponse.json({ error: 'memberId + title required' }, { status: 400 });
  const { id } = await params;
  await updateConversationTitle(id, memberId, body.title);
  await recordAuditEvent({
    actor,
    scope: 'hermes:chat',
    action: 'hermes.conversation.rename',
    resourceType: 'hermes_conversation',
    resourceId: id,
    onBehalfOfMemberId: memberId,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { scopes: ['hermes:chat'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = subjectMemberId(actor, req.nextUrl.searchParams.get('memberId'));
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const { id } = await params;
  await deleteConversation(id, memberId);
  await recordAuditEvent({
    actor,
    scope: 'hermes:chat',
    action: 'hermes.conversation.delete',
    resourceType: 'hermes_conversation',
    resourceId: id,
    onBehalfOfMemberId: memberId,
  });
  return NextResponse.json({ ok: true });
}
