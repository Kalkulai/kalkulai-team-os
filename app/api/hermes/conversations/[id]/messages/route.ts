import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import {
  getConversation,
  getMessages,
  addMessage,
  sendToHermes,
  buildHistoryFromMessages,
  ensureFirstTitle,
} from '@/lib/hermes-chat';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 200;

interface MemberRow {
  id: string;
  name: string;
  telegram_chat_id: string | null;
}

async function getMember(memberId: string): Promise<MemberRow | null> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('id, name, telegram_chat_id')
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  return (data as MemberRow | null) ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) return NextResponse.json({ error: 'memberId required' }, { status: 400 });
  const { id } = await params;
  const conv = await getConversation(id, memberId);
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const messages = await getMessages(id);
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { memberId?: string; content?: string } | null;
  if (!body?.memberId || !body.content?.trim()) {
    return NextResponse.json({ error: 'memberId + content required' }, { status: 400 });
  }
  const { id: conversationId } = await params;
  const conv = await getConversation(conversationId, body.memberId);
  if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });

  const member = await getMember(body.memberId);
  if (!member) return NextResponse.json({ error: 'member not found' }, { status: 404 });

  const userMsg = await addMessage(conversationId, 'user', body.content.trim());
  await ensureFirstTitle(conversationId, body.memberId, body.content.trim());

  // Build history (excluding the message we just added, since it's "new")
  const prior = (await getMessages(conversationId)).filter((m) => m.id !== userMsg.id);
  const history = buildHistoryFromMessages(prior);

  let reply: string;
  try {
    reply = await sendToHermes({
      message: body.content.trim(),
      userLabel: member.name,
      userTelegramId: member.telegram_chat_id,
      history,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const failMsg = await addMessage(conversationId, 'system', `Hermes konnte nicht antworten: ${errMsg}`);
    return NextResponse.json({ userMessage: userMsg, error: errMsg, systemMessage: failMsg }, { status: 502 });
  }

  if (!reply) {
    const failMsg = await addMessage(conversationId, 'system', 'Hermes hat eine leere Antwort zurückgegeben.');
    return NextResponse.json({ userMessage: userMsg, systemMessage: failMsg });
  }

  const assistantMsg = await addMessage(conversationId, 'assistant', reply);
  return NextResponse.json({ userMessage: userMsg, assistantMessage: assistantMsg });
}
