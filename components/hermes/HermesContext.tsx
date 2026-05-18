'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useActiveMember } from '@/lib/active-member';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

export type HermesUiState = 'closed' | 'bubble' | 'modal';

export interface HermesConversationSummary {
  id: string;
  member_id: string;
  title: string;
  updated_at: string;
}

export interface HermesMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface HermesContextValue {
  ui: HermesUiState;
  open: () => void;       // opens bubble (or modal if a conversation is already active)
  openModal: () => void;
  close: () => void;
  goBubble: () => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  conversations: HermesConversationSummary[];
  messages: HermesMessage[];
  sending: boolean;
  reloadConversations: () => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  startNewConversation: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  memberId: string | null;
  memberName: string | null;
}

const HermesContext = createContext<HermesContextValue | null>(null);

export function HermesProvider({ children }: { children: ReactNode }) {
  const { activeId: memberId, activeMember } = useActiveMember();
  const [ui, setUi] = useState<HermesUiState>('closed');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<HermesConversationSummary[]>([]);
  const [messages, setMessages] = useState<HermesMessage[]>([]);
  const [sending, setSending] = useState(false);
  const lastLoadedMemberRef = useRef<string | null>(null);

  // Auth header helper (DASHBOARD_API_SECRET is public-non-sensitive).
  const authHeaders = useMemo(() => ({ 'Authorization': `Bearer ${SECRET}`, 'Content-Type': 'application/json' }), []);

  const reloadConversations = useCallback(async () => {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/hermes/conversations?memberId=${encodeURIComponent(memberId)}`, {
        headers: authHeaders, cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as HermesConversationSummary[];
      setConversations(data);
    } catch {/* ignore */}
  }, [memberId, authHeaders]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/hermes/conversations/${conversationId}/messages?memberId=${encodeURIComponent(memberId)}`, {
        headers: authHeaders, cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as HermesMessage[];
      setMessages(data);
    } catch {/* ignore */}
  }, [memberId, authHeaders]);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (!memberId) return null;
    if (activeId) return activeId;
    try {
      const res = await fetch('/api/hermes/conversations', {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) return null;
      const conv = await res.json() as HermesConversationSummary;
      setActiveId(conv.id);
      setMessages([]);
      setConversations((prev) => [conv, ...prev]);
      return conv.id;
    } catch { return null; }
  }, [memberId, activeId, authHeaders]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending || !memberId) return;
    const convId = await ensureConversation();
    if (!convId) return;

    const tempUser: HermesMessage = {
      id: `tmp-${Date.now()}`,
      conversation_id: convId,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUser]);
    setSending(true);
    setUi('modal');

    try {
      const res = await fetch(`/api/hermes/conversations/${convId}/messages`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({ memberId, content: trimmed }),
      });
      const data = await res.json().catch(() => ({})) as {
        userMessage?: HermesMessage;
        assistantMessage?: HermesMessage;
        systemMessage?: HermesMessage;
        error?: string;
      };
      // Replace temp user message with the real one (incl. real id) and append assistant/system.
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUser.id);
        const next = [...withoutTemp];
        if (data.userMessage) next.push(data.userMessage);
        else next.push(tempUser); // fallback: keep temp
        if (data.assistantMessage) next.push(data.assistantMessage);
        if (data.systemMessage) next.push(data.systemMessage);
        return next;
      });
      // refresh conv list so title/updated_at updates appear in sidebar
      reloadConversations();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          conversation_id: convId,
          role: 'system',
          content: `Netzwerk-Fehler: ${err instanceof Error ? err.message : String(err)}`,
          created_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [sending, memberId, ensureConversation, authHeaders, reloadConversations]);

  const startNewConversation = useCallback(async () => {
    setActiveId(null);
    setMessages([]);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    if (!memberId) return;
    try {
      await fetch(`/api/hermes/conversations/${id}?memberId=${encodeURIComponent(memberId)}`, {
        method: 'DELETE', headers: authHeaders,
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {/* ignore */}
  }, [memberId, activeId, authHeaders]);

  // When member changes, reload conversations + reset.
  useEffect(() => {
    if (!memberId) return;
    if (lastLoadedMemberRef.current === memberId) return;
    lastLoadedMemberRef.current = memberId;
    setActiveId(null);
    setMessages([]);
    reloadConversations();
  }, [memberId, reloadConversations]);

  // When activeId changes, load that conversation's messages.
  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId, loadMessages]);

  // ESC closes modal/bubble. Body-scroll lock for modal only.
  useEffect(() => {
    if (ui === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ui === 'modal') setUi('closed');
        else if (ui === 'bubble') setUi('closed');
      }
    };
    if (ui === 'modal') document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [ui]);

  const value: HermesContextValue = {
    ui,
    open: () => setUi(activeId ? 'modal' : 'bubble'),
    openModal: () => setUi('modal'),
    close: () => setUi('closed'),
    goBubble: () => setUi('bubble'),
    activeId,
    setActiveId,
    conversations,
    messages,
    sending,
    reloadConversations,
    loadMessages,
    sendMessage,
    startNewConversation,
    deleteConversation,
    memberId: memberId || null,
    memberName: activeMember?.name ?? null,
  };

  return <HermesContext.Provider value={value}>{children}</HermesContext.Provider>;
}

export function useHermes() {
  const ctx = useContext(HermesContext);
  if (!ctx) throw new Error('useHermes must be used inside <HermesProvider>');
  return ctx;
}
