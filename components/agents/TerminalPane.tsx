'use client';

import { useEffect, useRef, useState } from 'react';
import { GripVertical, PlugZap, Unplug } from 'lucide-react';

const RUNNER_TOKEN = process.env.NEXT_PUBLIC_AGENT_RUNNER_TOKEN ?? '';

export interface RunnerSession {
  id: string;
  runtime: 'claude' | 'codex' | 'shell' | 'hermes';
  status: string;
  title: string;
  cwd: string;
  linear_identifier?: string | null;
  workstream?: string | null;
  branch?: string | null;
  worktree_path?: string | null;
  last_decision?: string | null;
  current_state?: string | null;
  next_decision?: string | null;
  started_at?: string;
  updated_at?: string;
  exit_code?: number | null;
}

export function TerminalPane({
  session,
  selected,
  runnerBase,
  onSelect,
  onDragStart,
  onDropOn,
}: {
  session: RunnerSession;
  selected: boolean;
  runnerBase: string;
  onSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropOn: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<{
    dispose: () => void;
    write: (data: string) => void;
    focus: () => void;
    resize: (cols: number, rows: number) => void;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    async function boot() {
      if (!containerRef.current) return;
      const { Terminal } = await import('@xterm/xterm');
      if (disposed || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'var(--mono)',
        fontSize: 12,
        lineHeight: 1.25,
        rows: 26,
        cols: 96,
        scrollback: 4000,
        theme: {
          background: '#070912',
          foreground: '#F5F7FB',
          cursor: '#5B8CFF',
          selectionBackground: '#5B8CFF55',
        },
      });
      terminalRef.current = term;
      term.open(containerRef.current);
      term.focus();

      const resize = () => {
        const el = containerRef.current;
        if (!el) return;
        const cols = Math.max(40, Math.floor((el.clientWidth - 18) / 7.25));
        const rows = Math.max(10, Math.floor((el.clientHeight - 12) / 15));
        term.resize(cols, rows);
        void fetch(`${runnerBase}/sessions/${encodeURIComponent(session.id)}/resize`, {
          method: 'POST',
          headers: runnerHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ cols, rows }),
        }).catch(() => {});
      };
      observer = new ResizeObserver(resize);
      observer.observe(containerRef.current);
      window.setTimeout(resize, 0);

      const wsUrl = runnerWsUrl(runnerBase, session.id);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.addEventListener('open', () => {
        setConnected(true);
        setError(null);
      });
      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') term.write(event.data);
      });
      ws.addEventListener('close', () => setConnected(false));
      ws.addEventListener('error', () => {
        setError('Terminal-Verbindung getrennt');
        setConnected(false);
      });
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data);
      });
      containerRef.current.addEventListener('mousedown', () => term.focus());
    }
    void boot();
    return () => {
      disposed = true;
      observer?.disconnect();
      wsRef.current?.close();
      terminalRef.current?.dispose();
      wsRef.current = null;
      terminalRef.current = null;
    };
  }, [runnerBase, session.id]);

  return (
    <section
      className={`agent-terminal-card ${selected ? 'is-selected' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(session.id);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOn(session.id);
      }}
    >
      <button type="button" className="agent-terminal-head" onClick={() => onSelect(session.id)}>
        <span className="agent-terminal-grip" title="Terminal verschieben">
          <GripVertical size={14} aria-hidden />
        </span>
        <span className={`agent-runtime ${session.runtime}`}>{session.runtime}</span>
        <span className="min-w-0 flex-1 truncate text-left">
          {session.linear_identifier ? `${session.linear_identifier} · ` : ''}{session.title}
        </span>
        <span className={`agent-dot ${connected ? 'ok' : 'off'}`} />
        <span className="agent-terminal-icon" title={connected ? 'WebSocket verbunden' : 'Terminal nicht verbunden'}>
          {connected ? <PlugZap size={13} aria-hidden /> : <Unplug size={13} aria-hidden />}
        </span>
      </button>
      {error && <div className="agent-terminal-error">{error}</div>}
      <div className="agent-terminal-meta">
        <span>{session.workstream ?? 'Kein Projekt'}</span>
        <span>{session.linear_identifier ?? compactPath(session.worktree_path ?? session.cwd)}</span>
        <span>{session.branch ?? session.status}</span>
      </div>
      <div
        ref={containerRef}
        className="agent-terminal-surface"
        onMouseDown={() => terminalRef.current?.focus()}
      />
    </section>
  );
}

function compactPath(path: string) {
  return path.replace(/^C:\\Kalkulai\\/i, '');
}

function runnerHeaders(base?: HeadersInit): HeadersInit {
  if (!RUNNER_TOKEN) return base ?? {};
  return { ...(base as Record<string, string> | undefined), 'x-agent-runner-token': RUNNER_TOKEN };
}

function runnerWsUrl(runnerBase: string, sessionId: string): string {
  const url = new URL(`${runnerBase.replace(/^http/, 'ws')}/sessions/${encodeURIComponent(sessionId)}/terminal`);
  if (RUNNER_TOKEN) url.searchParams.set('token', RUNNER_TOKEN);
  return url.toString();
}
