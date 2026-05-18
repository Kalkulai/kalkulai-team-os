import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getConversation, updateConversationTitle, deleteConversation, getMessages } from '@/lib/hermes-chat';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const { id } = await params;
  const conv = await getConversation(id, memberId);
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const messages = await getMessages(id);
  return NextResponse.json({ conversation: conv, messages });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { memberId?: string; title?: string } | null;
  if (!body?.memberId || !body.title) return NextResponse.json({ error: 'memberId + title required' }, { status: 400 });
  const { id } = await params;
  await updateConversationTitle(id, body.memberId, body.title);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const { id } = await params;
  await deleteConversation(id, memberId);
  return NextResponse.json({ ok: true });
}
