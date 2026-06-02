import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import {
  cleanupStaleClaudeSessions,
  listLiveClaudeSessions,
  upsertClaudeSession,
  touchClaudeSession,
  clearClaudeSession,
} from '@/lib/claude-sessions';
import { revalidateDashboard } from '@/lib/revalidate';

/**
 * Claude Code session telemetry — called fire-and-forget by the task-tracker
 * hooks (~/dotfiles/plugins/leon-core/scripts/task-state.js) on set, touch,
 * and clear. Powers the Kanban "active task" badge. See KAL-89.
 *
 *   POST { session_id, user_id, linear_identifier?, title?, host? }
 *     → upsert (full update on set, partial touch on PreToolUse).
 *   DELETE ?session_id=<uuid>
 *     → remove row (clear on /task-done, /task-hold, session exit).
 */

export async function GET(req: NextRequest) {
  if (!requireApiAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.nextUrl.searchParams.get('live') !== 'true') {
    return NextResponse.json({ error: 'live=true required' }, { status: 400 });
  }
  try {
    await cleanupStaleClaudeSessions(24);
    const sessions = await listLiveClaudeSessions(60);
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

  // "touch-only" payload (just session_id + user_id) = PreToolUse heartbeat.
  // Anything richer = real /task-set or /task-new push (incl. task_history
  // mirror from task-state.js per KAL-133).
  const hasContent =
    'linear_identifier' in body ||
    'title' in body ||
    'host' in body ||
    'cwd' in body ||
    'runtime' in body ||
    'status' in body ||
    'workstream' in body ||
    'branch' in body ||
    'worktree_path' in body ||
    'terminal_session_id' in body ||
    'last_decision' in body ||
    'current_state' in body ||
    'next_decision' in body ||
    'task_history' in body;
  try {
    if (hasContent) {
      await upsertClaudeSession({
        session_id: body.session_id,
        user_id: body.user_id,
        linear_identifier: body.linear_identifier ?? null,
        title: body.title ?? null,
        host: body.host ?? null,
        cwd: body.cwd ?? null,
        runtime: body.runtime ?? 'claude',
        status: body.status ?? 'running',
        workstream: body.workstream ?? null,
        branch: body.branch ?? null,
        worktree_path: body.worktree_path ?? null,
        terminal_session_id: body.terminal_session_id ?? null,
        last_decision: body.last_decision ?? null,
        current_state: body.current_state ?? null,
        next_decision: body.next_decision ?? null,
        task_history: Array.isArray(body.task_history) ? body.task_history : undefined,
      });
    } else {
      await touchClaudeSession(body.session_id);
    }
    // Live-broadcast so the iPad/laptop Kanban sees the new badge instantly.
    revalidateDashboard('claude-session');
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
    await clearClaudeSession(sessionId);
    revalidateDashboard('claude-session');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
