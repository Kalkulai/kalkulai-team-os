'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useHermes, type HermesMessage as Msg } from './HermesContext';

function HermesMessageRow({ m }: { m: Msg }) {
  const isUser = m.role === 'user';
  const isSystem = m.role === 'system';
  return (
    <div className={`hermes-msg hermes-msg-${m.role}`}>
      {!isUser && !isSystem && <span className="hermes-msg-avatar" aria-hidden>H</span>}
      <div className={`hermes-msg-bubble ${isSystem ? 'is-system' : ''}`}>{m.content}</div>
    </div>
  );
}

const THINK_STAGES = [
  'liest deine User-Datei …',
  'durchsucht Vault + Notion …',
  'denkt nach …',
  'formuliert Antwort …',
  'fast fertig …',
];

function HermesThinking() {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    const advance = setInterval(() => setStage((s) => Math.min(s + 1, THINK_STAGES.length - 1)), 3500);
    return () => { clearInterval(tick); clearInterval(advance); };
  }, []);
  return (
    <div className="hermes-msg hermes-msg-assistant">
      <span className="hermes-msg-avatar" aria-hidden>H</span>
      <div className="hermes-msg-bubble is-typing">
        <Loader2 size={14} className="hermes-spin" aria-hidden />
        <span>Hermes {THINK_STAGES[stage]}</span>
        <span className="hermes-typing-elapsed">{elapsed}s</span>
      </div>
    </div>
  );
}

export function HermesMessageList() {
  const { messages, sending, memberName } = useHermes();
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, sending]);

  if (messages.length === 0 && !sending) {
    return (
      <div className="hermes-msg-empty">
        <h3>Hey {memberName ?? ''}</h3>
        <p>Frag Hermes nach Tasks, Status, was du gerade übersiehst, oder einfach was du wissen willst.</p>
      </div>
    );
  }

  return (
    <div className="hermes-msg-list">
      {messages.map((m) => <HermesMessageRow key={m.id} m={m} />)}
      {sending && <HermesThinking />}
      <div ref={endRef} />
    </div>
  );
}
