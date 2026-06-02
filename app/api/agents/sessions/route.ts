import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import {
  cleanupStaleAgentSessions,
  clearAgentSession,
  listLiveAgentSessions,
  upsertAgentSession,
} from '@/lib/agent-sessions';
import { revalidateDashboard } from '@/lib/revalidate';
import type { AgentRuntime, AgentSessionStatus } from '@/types';

const RUNTIMES = new Set<AgentRuntime>(['claude', 'codex', 'shell', 'hermes']);
const STATUSES = new Set<AgentSessionStatus>(['idle', 'running', 'blocked', 'review', 'done', 'failed']);

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const windowMinutes = Number(req.nextUrl.searchParams.get('windowMinutes') ?? 60);
  try {
    await cleanupStaleAgentSessions(24);
    const sessions = await listLiveAgentSessions(Number.isFinite(windowMinutes) ? windowMinutes : 60);
    return NextResponse.json({ sessions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.session_id || typeof body.session_id !== 'string') {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  }
  if (!body?.user_id || typeof body.user_id !== 'string') {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  }

  const runtime = normalizeRuntime(body.runtime);
  const status = normalizeStatus(body.status);
  try {
    await upsertAgentSession({
      session_id: body.session_id,
      user_id: body.user_id,
      linear_identifier: stringOrNull(body.linear_identifier),
      title: stringOrNull(body.title),
      host: stringOrNull(body.host),
      cwd: stringOrNull(body.cwd),
      runtime,
      status,
      workstream: stringOrNull(body.workstream),
      branch: stringOrNull(body.branch),
      worktree_path: stringOrNull(body.worktree_path),
      terminal_session_id: stringOrNull(body.terminal_session_id),
      last_decision: stringOrNull(body.last_decision),
      current_state: stringOrNull(body.current_state),
      next_decision: stringOrNull(body.next_decision),
      task_history: Array.isArray(body.task_history) ? body.task_history : undefined,
    });
    revalidateDashboard('agent-session');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sessionId = req.nextUrl.searchParams.get('session_id');
  if (!sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  try {
    await clearAgentSession(sessionId);
    revalidateDashboard('agent-session');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeRuntime(value: unknown): AgentRuntime {
  return typeof value === 'string' && RUNTIMES.has(value as AgentRuntime)
    ? (value as AgentRuntime)
    : 'shell';
}

function normalizeStatus(value: unknown): AgentSessionStatus {
  return typeof value === 'string' && STATUSES.has(value as AgentSessionStatus)
    ? (value as AgentSessionStatus)
    : 'running';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
