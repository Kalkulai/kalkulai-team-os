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

const TOOL_LABEL: Record<string, string> = {
  terminal: 'führt Shell-Befehl aus',
  read_file: 'liest Datei',
  search_files: 'durchsucht Dateien',
  write_file: 'schreibt Datei',
  edit_file: 'editiert Datei',
  skill_view: 'lädt Skill',
  obsidian: 'liest Vault',
  vault_write: 'schreibt in Vault',
  notion: 'fragt Notion ab',
  google_workspace: 'fragt Google Workspace ab',
  browser_navigate: 'öffnet Browser',
  browser_click: 'klickt im Browser',
  delegate_task: 'delegiert an Sub-Agent',
  clarify: 'fragt nach',
  execute_code: 'führt Code aus',
};

function labelFor(tool: string | null): string {
  if (!tool) return 'denkt nach …';
  const norm = tool.replace(/[^A-Za-z0-9_]/g, '');
  if (TOOL_LABEL[norm]) return `${TOOL_LABEL[norm]} …`;
  return `nutzt ${norm} …`;
}

function HermesThinking() {
  const { progress } = useHermes();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  const label = labelFor(progress.currentTool);
  return (
    <div className="hermes-msg hermes-msg-assistant">
      <span className="hermes-msg-avatar" aria-hidden>H</span>
      <div className="hermes-msg-bubble is-typing">
        <Loader2 size={14} className="hermes-spin" aria-hidden />
        <span>Hermes {label}</span>
        {progress.toolCount > 0 && (
          <span className="hermes-typing-step">#{progress.toolCount}</span>
        )}
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
