import { NextRequest, NextResponse } from 'next/server';
import { requireActor, type AuthActor } from '@/lib/auth-context';
import { recordAuditEvent } from '@/lib/audit';
import {
  getConversation,
  getMessages,
  addMessage,
  streamHermes,
  buildHistoryFromMessages,
  ensureFirstTitle,
} from '@/lib/hermes-chat';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 240;

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
  return NextResponse.json(messages);
}

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor(req, { scopes: ['hermes:chat'] });
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null) as { memberId?: string; content?: string } | null;
  const memberId = subjectMemberId(actor, body?.memberId);
  if (!memberId || !body?.content?.trim()) {
    return NextResponse.json({ error: 'memberId + content required' }, { status: 400 });
  }
  const { id: conversationId } = await params;
  const userContent = body.content.trim();

  const conv = await getConversation(conversationId, memberId);
  if (!conv) return NextResponse.json({ error: 'conversation not found' }, { status: 404 });

  const member = await getMember(memberId);
  if (!member) return NextResponse.json({ error: 'member not found' }, { status: 404 });
  const actorMember = actor.memberId ? await getMember(actor.memberId) : null;

  const userMsg = await addMessage(conversationId, 'user', userContent);
  await ensureFirstTitle(conversationId, memberId, userContent);
  await recordAuditEvent({
    actor,
    scope: 'hermes:chat',
    action: 'hermes.message.user',
    resourceType: 'hermes_conversation',
    resourceId: conversationId,
    onBehalfOfMemberId: memberId,
    metadata: { messageId: userMsg.id },
  });

  const prior = (await getMessages(conversationId)).filter((m) => m.id !== userMsg.id);
  const history = buildHistoryFromMessages(prior);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sseLine(event, data)));
      }
      emit('user', { message: userMsg });

      let bridgeRes: Response;
      try {
        bridgeRes = await streamHermes({
          message: userContent,
          userLabel: actorMember?.name ?? member.name,
          userTelegramId: actorMember?.telegram_chat_id ?? member.telegram_chat_id,
          history,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const sysMsg = await addMessage(conversationId, 'system', `Hermes-Bridge nicht erreichbar: ${errMsg}`);
        emit('error', { message: errMsg, systemMessage: sysMsg });
        controller.close();
        return;
      }

      const reader = bridgeRes.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let replyText: string | null = null;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let sep: number;
          while ((sep = buf.indexOf('\n\n')) !== -1) {
            const raw = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            let evName: string | null = null;
            let evData = '';
            for (const line of raw.split('\n')) {
              if (line.startsWith('event:')) evName = line.slice(6).trim();
              else if (line.startsWith('data:')) evData += line.slice(5).trim();
            }
            if (!evName) continue;
            const parsed = evData ? JSON.parse(evData) : {};
            if (evName === 'reply') {
              replyText = String(parsed.reply ?? '').trim();
            }
            emit(evName, parsed);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emit('error', { message: `stream-broke: ${errMsg}` });
      }

      if (replyText) {
        try {
          const assistantMsg = await addMessage(conversationId, 'assistant', replyText);
          await recordAuditEvent({
            actor: { type: 'hermes', id: 'hermes', scopes: ['*'] },
            scope: 'hermes:chat',
            action: 'hermes.message.assistant',
            resourceType: 'hermes_conversation',
            resourceId: conversationId,
            onBehalfOfMemberId: memberId,
            metadata: { messageId: assistantMsg.id, requestedByActor: actor.id },
          });
          emit('persisted', { assistantMessage: assistantMsg });
        } catch (err) {
          emit('error', { message: `persist failed: ${err instanceof Error ? err.message : String(err)}` });
        }
      } else {
        const sysMsg = await addMessage(conversationId, 'system', 'Hermes hat keine Antwort geliefert.');
        emit('error', { message: 'empty reply', systemMessage: sysMsg });
      }
      emit('done', {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
