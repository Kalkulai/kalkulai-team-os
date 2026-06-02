import { beforeEach, describe, expect, it, vi } from 'vitest';

type Resp = { data?: unknown; error?: { message?: string } | null };

const responses: Resp[] = [];
const fromCalls: string[] = [];
const selectCalls: string[] = [];
const upsertRows: unknown[] = [];
const gtCalls: Array<[string, unknown]> = [];
const orderCalls: Array<[string, unknown]> = [];

function nextResponse(): Promise<Resp> {
  const r = responses.shift();
  return Promise.resolve(r ?? { data: null, error: null });
}

function makeBuilder(): unknown {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((cols: string) => {
    selectCalls.push(cols);
    return builder;
  });
  builder.upsert = vi.fn((row: unknown) => {
    upsertRows.push(row);
    return nextResponse();
  });
  builder.gt = vi.fn((col: string, val: unknown) => {
    gtCalls.push([col, val]);
    return builder;
  });
  builder.order = vi.fn((col: string, opts: unknown) => {
    orderCalls.push([col, opts]);
    return builder;
  });
  builder.then = (onFulfilled: (v: Resp) => unknown, onRejected?: (e: unknown) => unknown) =>
    nextResponse().then(onFulfilled, onRejected);
  return builder;
}

const fromMock = vi.fn((table: string) => {
  fromCalls.push(table);
  return makeBuilder();
});

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...(args as [string])) },
}));

import { listLiveAgentSessions, upsertAgentSession } from '@/lib/agent-sessions';

beforeEach(() => {
  responses.length = 0;
  fromCalls.length = 0;
  selectCalls.length = 0;
  upsertRows.length = 0;
  gtCalls.length = 0;
  orderCalls.length = 0;
  fromMock.mockClear();
});

describe('listLiveAgentSessions', () => {
  it('normalizes runtime and status defaults for legacy Claude rows', async () => {
    responses.push({
      data: [{
        session_id: 'sid-legacy',
        user_id: 'user-1',
        linear_identifier: 'KAL-153',
        title: 'Legacy row',
        host: 'Laptop-Leon',
        started_at: '2026-05-30T12:00:00.000Z',
        last_seen_at: '2026-05-30T12:29:00.000Z',
        task_history: [],
      }],
      error: null,
    });

    const out = await listLiveAgentSessions(60, new Date('2026-05-30T12:30:00.000Z'));

    expect(selectCalls[0]).toContain('runtime');
    expect(out[0]).toEqual(expect.objectContaining({
      session_id: 'sid-legacy',
      runtime: 'claude',
      status: 'running',
      idle_minutes: 1,
      linear_url: 'https://linear.app/kalkulai-team/issue/KAL-153',
    }));
  });

  it('falls back to legacy columns when agent metadata migration is absent', async () => {
    responses.push(
      { error: { message: 'column claude_sessions.runtime does not exist' } },
      {
        data: [{
          session_id: 'sid-fallback',
          user_id: 'user-1',
          linear_identifier: null,
          title: 'Fallback row',
          host: 'Laptop-Leon',
          started_at: '2026-05-30T12:00:00.000Z',
          last_seen_at: '2026-05-30T12:29:00.000Z',
          task_history: [],
        }],
        error: null,
      },
    );

    const out = await listLiveAgentSessions(60, new Date('2026-05-30T12:30:00.000Z'));

    expect(fromCalls).toEqual(['claude_sessions', 'claude_sessions']);
    expect(selectCalls[0]).toContain('runtime');
    expect(selectCalls[1]).not.toContain('runtime');
    expect(out[0]).toEqual(expect.objectContaining({ session_id: 'sid-fallback', runtime: 'claude' }));
  });
});

describe('upsertAgentSession', () => {
  it('writes generic agent metadata for Codex sessions', async () => {
    responses.push({ error: null });

    await upsertAgentSession({
      session_id: 'sid-codex',
      user_id: 'user-1',
      runtime: 'codex',
      status: 'running',
      terminal_session_id: 'term-1',
      linear_identifier: 'KAL-153',
      current_state: 'Implementing route',
      next_decision: 'Review UI wireframe',
    });

    expect(upsertRows[0]).toEqual(expect.objectContaining({
      session_id: 'sid-codex',
      runtime: 'codex',
      status: 'running',
      terminal_session_id: 'term-1',
      current_state: 'Implementing route',
      next_decision: 'Review UI wireframe',
    }));
  });

  it('falls back to legacy upsert rows when cwd is absent', async () => {
    responses.push(
      { error: { message: 'Could not find the runtime column of claude_sessions in the schema cache' } },
      { error: { message: "Could not find the 'cwd' column of 'claude_sessions' in the schema cache" } },
      { error: null },
    );

    await upsertAgentSession({
      session_id: 'sid-legacy-upsert',
      user_id: 'user-1',
      runtime: 'codex',
      status: 'running',
      cwd: 'C:\\Kalkulai\\kalkulai-team-os',
      terminal_session_id: 'term-legacy',
    });

    expect(upsertRows).toHaveLength(3);
    expect(upsertRows[0]).toEqual(expect.objectContaining({ runtime: 'codex', cwd: 'C:\\Kalkulai\\kalkulai-team-os' }));
    expect(upsertRows[1]).toEqual(expect.objectContaining({ cwd: 'C:\\Kalkulai\\kalkulai-team-os' }));
    expect(upsertRows[2]).not.toHaveProperty('cwd');
    expect(upsertRows[2]).not.toHaveProperty('runtime');
  });
});
