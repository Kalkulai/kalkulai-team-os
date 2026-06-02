'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm';
import {
  Background,
  Controls,
  Handle,
  NodeResizer,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { Plus } from 'lucide-react';
import type { AgentRuntime, AgentRunnerSession, AgentSessionLayout } from '@/types';
import type { AgentWorkspaceGraph } from '@/lib/agent-workspace-graph';

const RUNNER_TOKEN = process.env.NEXT_PUBLIC_AGENT_RUNNER_TOKEN ?? '';

type FlowNode = Node<RepoNodeData | TerminalNodeData, 'repo' | 'terminal'>;

interface RepoNodeData extends Record<string, unknown> {
  label: string;
  repoLabel: string;
  repoPath: string;
  color: string;
  sessionCount: number;
  pinned: boolean;
}

interface TerminalNodeData extends Record<string, unknown> {
  session: AgentRunnerSession;
  repoLabel: string;
  repoPath: string;
  layout: AgentSessionLayout;
  workGoal: string;
  runLabel: string;
  displayTitle: string;
  repoColor: string;
  activeQueueTitle: string | null;
  queuedTaskTitles: string[];
  selected: boolean;
  runnerBase: string;
  onSelect: (id: string) => void;
  onLayoutChange: (id: string, layout: AgentSessionLayout) => void;
  onQueueWorkstream: (sessionId: string, workstreamId: string) => void;
  onContinueSession: (sessionId: string) => void;
  onReviewSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
}

export function AgentTerminalMap({
  graph,
  selectedSessionId,
  runnerBase,
  runnerOnline,
  runnerStatus,
  onSelectSession,
  onLayoutChange,
  onClearSelection,
  onStartRun,
  onRefreshRunner,
  onQueueWorkstream,
  onContinueSession,
  onReviewSession,
  onArchiveSession,
}: {
  graph: AgentWorkspaceGraph;
  selectedSessionId: string;
  runnerBase: string;
  runnerOnline: boolean;
  runnerStatus: string;
  onSelectSession: (id: string) => void;
  onLayoutChange: (id: string, layout: AgentSessionLayout) => void;
  onClearSelection: () => void;
  onStartRun: () => void;
  onRefreshRunner: () => void;
  onQueueWorkstream: (sessionId: string, workstreamId: string) => void;
  onContinueSession: (sessionId: string) => void;
  onReviewSession: (sessionId: string) => void;
  onArchiveSession: (sessionId: string) => void;
}) {
  const computedNodes = useMemo<FlowNode[]>(() => graph.nodes.map((node) => {
    if (node.type === 'repo') {
      return {
        id: node.id,
        type: 'repo',
        position: node.position,
        data: node.data,
        draggable: true,
        selectable: false,
      };
    }
    const sessionId = node.data.session.id;
    return {
      id: node.id,
      type: 'terminal',
      position: node.position,
      data: {
        session: node.data.session,
        repoLabel: node.data.repoLabel,
        repoPath: node.data.repoPath,
        layout: node.data.layout,
        workGoal: node.data.workGoal,
        runLabel: node.data.runLabel,
        displayTitle: node.data.displayTitle,
        repoColor: node.data.repoColor,
        activeQueueTitle: node.data.activeQueueTitle,
        queuedTaskTitles: node.data.queuedTaskTitles,
        selected: sessionId === selectedSessionId,
        runnerBase,
        onSelect: onSelectSession,
        onLayoutChange,
        onQueueWorkstream,
        onContinueSession,
        onReviewSession,
        onArchiveSession,
      },
      dragHandle: '.agent-terminal-node-drag-handle',
      selectable: false,
      selected: false,
      style: {
        width: node.data.layout.width,
        height: node.data.layout.height,
      },
    };
  }), [graph.nodes, onArchiveSession, onContinueSession, onLayoutChange, onQueueWorkstream, onReviewSession, onSelectSession, runnerBase, selectedSessionId]);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(computedNodes);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setNodes(computedNodes);
  }, [computedNodes, setNodes]);

  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: true,
    className: 'agent-map-edge',
  })), [graph.edges]);

  const nodeTypes = useMemo(() => ({
    repo: RepoNode,
    terminal: TerminalNode,
  }), []);

  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    draggingRef.current = false;
    if (node.type !== 'terminal') return;
    const data = node.data as TerminalNodeData;
    onLayoutChange(data.session.id, {
      ...data.layout,
      x: node.position.x,
      y: node.position.y,
      width: Number(node.measured?.width ?? node.width ?? data.layout.width),
      height: Number(node.measured?.height ?? node.height ?? data.layout.height),
    });
  }, [onLayoutChange]);

  if (!graph.activeSessions.length) {
    return (
      <div className="agent-map-empty">
        <span className={`agent-dot ${runnerOnline ? 'ok' : 'off'}`} />
        <h2>{runnerOnline ? 'Keine aktiven Terminals' : 'Runner offline'}</h2>
        <p>
          {runnerOnline
            ? 'Starte einen Run aus einem Task oder als Quick Terminal, dann erscheint er hier mit Repo-Rune und Live-Terminal.'
            : `${runnerStatus}. Die Task-/Projektansicht bleibt nutzbar; echte Terminals starten erst mit lokalem Runner.`}
        </p>
        <div>
          <button type="button" className="agent-primary" onClick={onStartRun}><Plus size={15} aria-hidden />Start Run</button>
          <button type="button" className="agent-secondary-button" onClick={onRefreshRunner}>Runner prüfen</button>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-flow-shell">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => {
          if (node.type !== 'terminal') return;
          onSelectSession((node.data as TerminalNodeData).session.id);
        }}
        onPaneClick={onClearSelection}
        onNodesChange={onNodesChange}
        onNodeDragStart={() => {
          draggingRef.current = true;
        }}
        onNodeDragStop={handleNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        minZoom={0.35}
        maxZoom={1.35}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        elevateNodesOnSelect={false}
        panOnScroll
        selectionOnDrag={false}
      >
        <Background color="rgba(255,255,255,.08)" gap={28} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

const RepoNode = memo(function RepoNode({ data }: NodeProps<Node<RepoNodeData, 'repo'>>) {
  return (
    <div
      className={`agent-repo-node ${data.pinned ? 'is-pinned' : ''}`}
      style={{ '--agent-repo-color': data.color } as CSSProperties}
      title={data.repoPath}
    >
      <Handle type="source" position={Position.Bottom} />
      <span className="agent-repo-node-dot" />
      <strong>{data.label}</strong>
    </div>
  );
});

const TerminalNode = memo(function TerminalNode({ data, selected }: NodeProps<Node<TerminalNodeData, 'terminal'>>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTermTerminal | null>(null);
  const fitRef = useRef<{ fit: () => void; dispose?: () => void } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [terminalIssue, setTerminalIssue] = useState<string | null>(null);

  const fitAndReport = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    void fetch(`${data.runnerBase}/sessions/${encodeURIComponent(data.session.id)}/resize`, {
      method: 'POST',
      headers: runnerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ cols: term.cols, rows: term.rows }),
    }).catch(() => {});
  }, [data.runnerBase, data.session.id]);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let dataDisposable: IDisposable | null = null;

    async function boot() {
      if (!containerRef.current) return;
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ]);
      if (disposed || !containerRef.current) return;
      containerRef.current.innerHTML = '';
      const term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'var(--mono)',
        fontSize: 12,
        lineHeight: 1.2,
        scrollback: 6000,
        theme: {
          background: '#070912',
          foreground: '#F5F7FB',
          cursor: '#5B8CFF',
          selectionBackground: '#5B8CFF55',
        },
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      termRef.current = term;
      fitRef.current = fit;

      observer = new ResizeObserver(() => window.requestAnimationFrame(fitAndReport));
      observer.observe(containerRef.current);
      window.setTimeout(fitAndReport, 0);

      const ws = new WebSocket(runnerWsUrl(data.runnerBase, data.session.id));
      wsRef.current = ws;
      ws.addEventListener('open', () => {
        setConnected(true);
        setTerminalIssue(null);
        term.focus();
      });
      ws.addEventListener('message', (event) => {
        if (typeof event.data === 'string') term.write(event.data);
      });
      ws.addEventListener('error', () => {
        setTerminalIssue('Runner-WebSocket konnte nicht verbunden werden.');
      });
      ws.addEventListener('close', () => {
        setConnected(false);
        if (disposed) return;
        setTerminalIssue('Runner-Verbindung geschlossen.');
        term.writeln('\r\n[Runner-Verbindung geschlossen. Prüfe Runner-Origin, Token und Port.]');
      });
      dataDisposable = term.onData((input) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(input);
      });
    }

    void boot();
    return () => {
      disposed = true;
      observer?.disconnect();
      dataDisposable?.dispose();
      wsRef.current?.close();
      fitRef.current?.dispose?.();
      termRef.current?.dispose();
      fitRef.current = null;
      termRef.current = null;
      wsRef.current = null;
    };
  }, [data.runnerBase, data.session.id, fitAndReport]);

  const queuePreview = data.queuedTaskTitles.slice(0, 3);
  const queueOverflow = Math.max(0, data.queuedTaskTitles.length - queuePreview.length);

  return (
    <section
      className={`agent-terminal-node ${selected || data.selected ? 'is-selected' : ''}`}
      style={{
        width: data.layout.width,
        height: data.layout.height,
        '--agent-repo-color': data.repoColor,
      } as CSSProperties}
      onMouseDown={() => data.onSelect(data.session.id)}
      onDragOver={(event) => {
        if (!Array.from(event.dataTransfer.types).includes('application/x-agent-workstream-id')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={(event) => {
        const workstreamId = event.dataTransfer.getData('application/x-agent-workstream-id');
        if (!workstreamId) return;
        event.preventDefault();
        event.stopPropagation();
        data.onQueueWorkstream(data.session.id, workstreamId);
      }}
    >
      <NodeResizer
        isVisible={data.selected}
        lineClassName="agent-terminal-resize-line"
        handleClassName="agent-terminal-resize-handle"
        minWidth={420}
        minHeight={300}
        onResizeEnd={(_, params) => {
          data.onLayoutChange(data.session.id, {
            x: Number(params.x ?? data.layout.x),
            y: Number(params.y ?? data.layout.y),
            width: Number(params.width ?? data.layout.width),
            height: Number(params.height ?? data.layout.height),
          });
          window.requestAnimationFrame(fitAndReport);
        }}
      />
      <Handle type="target" position={Position.Top} />
      <div
        className="agent-terminal-rune agent-terminal-node-drag-handle"
        style={{ '--agent-repo-color': data.repoColor } as CSSProperties}
        title={data.displayTitle}
      >
        <span>{data.workGoal}</span>
        <em aria-hidden>·</em>
        <small>{data.runLabel}</small>
      </div>
      <div className="agent-terminal-body">
        <div className="agent-terminal-mac-head agent-terminal-node-drag-handle">
          <span className="agent-window-dots" aria-hidden>
            <i /><i /><i />
          </span>
          <span className="agent-terminal-spacer" />
          {terminalIssue && <span className="agent-terminal-connection-issue" title={terminalIssue}>WS</span>}
          <span className={`agent-status-dot ${data.session.done_pending ? 'done-pending' : data.session.status}`} />
          <span
            className={`agent-runtime-icon ${data.session.runtime} ${connected ? 'is-connected' : 'is-disconnected'}`}
            title={`${runtimeLabel(data.session.runtime)} · ${connected ? 'Terminal verbunden' : 'Terminal nicht verbunden'}`}
          >
            {runtimeGlyph(data.session.runtime)}
          </span>
        </div>
        <div
          ref={containerRef}
          className="agent-terminal-node-surface nodrag nowheel"
          onMouseDown={(event) => {
            event.stopPropagation();
            termRef.current?.focus();
            data.onSelect(data.session.id);
          }}
        />
      </div>
      {data.session.done_pending && (
        <div className="agent-terminal-decision-rail nodrag">
          <strong>Fertig?</strong>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              data.onContinueSession(data.session.id);
            }}
          >
            Weiter
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              data.onReviewSession(data.session.id);
            }}
          >
            Review
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              data.onArchiveSession(data.session.id);
            }}
          >
            Schließen
          </button>
        </div>
      )}
      {!data.session.done_pending && (data.activeQueueTitle || queuePreview.length > 0) && (
        <div className="agent-terminal-queue-rail nodrag" style={{ '--agent-repo-color': data.repoColor } as CSSProperties}>
          {data.activeQueueTitle && (
            <span className="is-active" title={`Jetzt: ${data.activeQueueTitle}`}>
              Jetzt {data.activeQueueTitle}
            </span>
          )}
          {queuePreview.map((title) => (
            <span key={title} title={`Danach: ${title}`}>
              Danach {title}
            </span>
          ))}
          {queueOverflow > 0 && <span>+{queueOverflow}</span>}
        </div>
      )}
      {Boolean(data.session.subagents?.length) && (
        <div className="agent-terminal-subagents" style={{ '--agent-repo-color': data.repoColor } as CSSProperties}>
          {data.session.subagents?.map((subagent) => (
            <span
              key={subagent.id}
              className={`agent-subagent-figure ${subagent.status}`}
              title={`${subagent.name} · ${subagent.status}`}
            />
          ))}
        </div>
      )}
    </section>
  );
});

function runtimeLabel(runtime: AgentRuntime) {
  return runtime === 'claude' ? 'Claude' : runtime === 'codex' ? 'Codex' : runtime === 'hermes' ? 'Hermes' : 'Shell';
}

function runtimeGlyph(runtime: AgentRuntime) {
  if (runtime === 'claude') return 'Cl';
  if (runtime === 'codex') return 'Cx';
  if (runtime === 'hermes') return 'H';
  return '$';
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
