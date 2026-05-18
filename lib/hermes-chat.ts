import { supabaseAdmin } from '@/lib/supabase';

export interface HermesConversation {
  id: string;
  member_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface HermesMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

const HISTORY_FOR_CONTEXT = 20;

export async function listConversations(memberId: string): Promise<HermesConversation[]> {
  const { data, error } = await supabaseAdmin
    .from('hermes_conversations')
    .select('*')
    .eq('member_id', memberId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as HermesConversation[];
}

export async function createConversation(memberId: string, title?: string): Promise<HermesConversation> {
  const { data, error } = await supabaseAdmin
    .from('hermes_conversations')
    .insert({ member_id: memberId, title: title?.trim() || 'Neue Konversation' })
    .select('*')
    .single();
  if (error) throw error;
  return data as HermesConversation;
}

export async function getConversation(id: string, memberId: string): Promise<HermesConversation | null> {
  const { data, error } = await supabaseAdmin
    .from('hermes_conversations')
    .select('*')
    .eq('id', id)
    .eq('member_id', memberId)
    .maybeSingle();
  if (error) throw error;
  return (data as HermesConversation | null) ?? null;
}

export async function updateConversationTitle(id: string, memberId: string, title: string): Promise<void> {
  const trimmed = title.trim();
  if (!trimmed) return;
  const { error } = await supabaseAdmin
    .from('hermes_conversations')
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('member_id', memberId);
  if (error) throw error;
}

export async function deleteConversation(id: string, memberId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('hermes_conversations')
    .delete()
    .eq('id', id)
    .eq('member_id', memberId);
  if (error) throw error;
}

export async function getMessages(conversationId: string): Promise<HermesMessage[]> {
  const { data, error } = await supabaseAdmin
    .from('hermes_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as HermesMessage[];
}

export async function addMessage(
  conversationId: string,
  role: HermesMessage['role'],
  content: string,
): Promise<HermesMessage> {
  const { data, error } = await supabaseAdmin
    .from('hermes_messages')
    .insert({ conversation_id: conversationId, role, content })
    .select('*')
    .single();
  if (error) throw error;
  await supabaseAdmin
    .from('hermes_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  return data as HermesMessage;
}

export async function ensureFirstTitle(conversationId: string, memberId: string, firstUserMessage: string): Promise<void> {
  const conv = await getConversation(conversationId, memberId);
  if (!conv || conv.title !== 'Neue Konversation') return;
  const auto = firstUserMessage.split('\n')[0].trim().slice(0, 60) || 'Neue Konversation';
  await updateConversationTitle(conversationId, memberId, auto);
}

export interface SendToHermesArgs {
  message: string;
  userLabel?: string | null;
  userTelegramId?: string | null;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export async function sendToHermes(args: SendToHermesArgs): Promise<string> {
  const url = process.env.HERMES_BRIDGE_URL;
  const token = process.env.HERMES_BRIDGE_TOKEN;
  if (!url || !token) {
    throw new Error('HERMES_BRIDGE_URL / HERMES_BRIDGE_TOKEN not configured');
  }
  const res = await fetch(`${url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: args.message,
      userLabel: args.userLabel ?? undefined,
      userTelegramId: args.userTelegramId ?? undefined,
      history: args.history ?? undefined,
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Hermes-Bridge ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json() as { reply?: string };
  return (data.reply ?? '').trim();
}

export function buildHistoryFromMessages(messages: HermesMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-HISTORY_FOR_CONTEXT)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
}
