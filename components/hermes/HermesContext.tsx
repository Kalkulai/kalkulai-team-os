'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useActiveMember } from '@/lib/active-member';
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

export interface HermesProgress {
  currentTool: string | null;
  toolCount: number;
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
  progress: HermesProgress;
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
  const [progress, setProgress] = useState<HermesProgress>({ currentTool: null, toolCount: 0 });
  const lastLoadedMemberRef = useRef<string | null>(null);

  const jsonHeaders = useMemo(() => ({ 'Content-Type': 'application/json' }), []);

  const reloadConversations = useCallback(async () => {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/hermes/conversations?memberId=${encodeURIComponent(memberId)}`, {
        headers: jsonHeaders, cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as HermesConversationSummary[];
      setConversations(data);
    } catch {/* ignore */}
  }, [memberId, jsonHeaders]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/hermes/conversations/${conversationId}/messages?memberId=${encodeURIComponent(memberId)}`, {
        headers: jsonHeaders, cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as HermesMessage[];
      setMessages(data);
    } catch {/* ignore */}
  }, [memberId, jsonHeaders]);

  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (!memberId) return null;
    if (activeId) return activeId;
    try {
      const res = await fetch('/api/hermes/conversations', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) return null;
      const conv = await res.json() as HermesConversationSummary;
      setActiveId(conv.id);
      setMessages([]);
      setConversations((prev) => [conv, ...prev]);
      return conv.id;
    } catch { return null; }
  }, [memberId, activeId, jsonHeaders]);

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
    setProgress({ currentTool: null, toolCount: 0 });
    setUi('modal');

    try {
      const res = await fetch(`/api/hermes/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { ...jsonHeaders, Accept: 'text/event-stream' },
        body: JSON.stringify({ memberId, content: trimmed }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
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
          let parsed: Record<string, unknown> = {};
          try { parsed = evData ? JSON.parse(evData) : {}; } catch {/* keep empty */}

          if (evName === 'user' && parsed.message) {
            const real = parsed.message as HermesMessage;
            setMessages((prev) => prev.map((m) => (m.id === tempUser.id ? real : m)));
          } else if (evName === 'tool') {
            const name = (parsed.name as string | undefined) ?? null;
            const phase = parsed.phase as string | undefined;
            if (phase === 'start') {
              setProgress((p) => ({ currentTool: name, toolCount: p.toolCount + 1 }));
            }
          } else if (evName === 'persisted' && parsed.assistantMessage) {
            const assistant = parsed.assistantMessage as HermesMessage;
            setMessages((prev) => [...prev, assistant]);
          } else if (evName === 'error') {
            const sysMsg = parsed.systemMessage as HermesMessage | undefined;
            if (sysMsg) setMessages((prev) => [...prev, sysMsg]);
            else setMessages((prev) => [...prev, {
              id: `sys-${Date.now()}`,
              conversation_id: convId,
              role: 'system',
              content: `Fehler: ${parsed.message ?? 'unbekannt'}`,
              created_at: new Date().toISOString(),
            }]);
          }
        }
      }
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
      setProgress({ currentTool: null, toolCount: 0 });
    }
  }, [sending, memberId, ensureConversation, jsonHeaders, reloadConversations]);

  const startNewConversation = useCallback(async () => {
    setActiveId(null);
    setMessages([]);
  }, []);

  const deleteConversation = useCallback(async (id: string) => {
    if (!memberId) return;
    try {
      await fetch(`/api/hermes/conversations/${id}?memberId=${encodeURIComponent(memberId)}`, {
        method: 'DELETE', headers: jsonHeaders,
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {/* ignore */}
  }, [memberId, activeId, jsonHeaders]);

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
    progress,
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
