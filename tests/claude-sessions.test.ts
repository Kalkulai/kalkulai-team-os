import { beforeEach, describe, expect, it, vi } from 'vitest';

type Resp = { data?: unknown; error?: unknown };

const responses: Resp[] = [];
const fromCalls: string[] = [];
const selectCalls: string[] = [];
const gtCalls: Array<[string, unknown]> = [];
const ltCalls: Array<[string, unknown]> = [];
const orderCalls: Array<[string, unknown]> = [];
const deleteCalls: string[] = [];

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
  builder.gt = vi.fn((col: string, val: unknown) => {
    gtCalls.push([col, val]);
    return builder;
  });
  builder.lt = vi.fn((col: string, val: unknown) => {
    ltCalls.push([col, val]);
    return builder;
  });
  builder.order = vi.fn((col: string, opts: unknown) => {
    orderCalls.push([col, opts]);
    return builder;
  });
  builder.delete = vi.fn(() => {
    deleteCalls.push('delete');
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

import {
  cleanupStaleClaudeSessions,
  listLiveClaudeSessions,
} from '@/lib/claude-sessions';

beforeEach(() => {
  responses.length = 0;
  fromCalls.length = 0;
  selectCalls.length = 0;
  gtCalls.length = 0;
  ltCalls.length = 0;
  orderCalls.length = 0;
  deleteCalls.length = 0;
  fromMock.mockClear();
});

describe('listLiveClaudeSessions', () => {
  it('returns sessions from the requested window with idle minutes and Linear URLs', async () => {
    responses.push({
      data: [
        {
          session_id: 'sid-1',
          user_id: 'user-1',
          linear_identifier: 'KAL-153',
          title: 'Cross-session snapshot',
          host: 'Laptop-Leon',
          cwd: 'C:\\Kalkulai\\kalkulai-team-os',
          started_at: '2026-05-28T14:00:00.000Z',
          last_seen_at: '2026-05-28T14:45:00.000Z',
          task_history: [],
        },
      ],
      error: null,
    });

    const out = await listLiveClaudeSessions(60, new Date('2026-05-28T15:00:30.000Z'));

    expect(fromCalls).toEqual(['claude_sessions']);
    expect(gtCalls[0][0]).toBe('last_seen_at');
    expect(orderCalls).toContainEqual(['last_seen_at', { ascending: false }]);
    expect(out).toEqual([
      expect.objectContaining({
        session_id: 'sid-1',
        linear_identifier: 'KAL-153',
        cwd: 'C:\\Kalkulai\\kalkulai-team-os',
        idle_minutes: 16,
        linear_url: 'https://linear.app/kalkulai-team/issue/KAL-153',
      }),
    ]);
  });

  it('falls back when the optional cwd column has not been migrated yet', async () => {
    responses.push(
      { error: { message: 'column claude_sessions.cwd does not exist' } },
      {
        data: [
          {
            session_id: 'sid-2',
            user_id: 'user-1',
            linear_identifier: null,
            title: 'Fallback session',
            host: 'Laptop-Leon',
            started_at: '2026-05-28T14:00:00.000Z',
            last_seen_at: '2026-05-28T14:59:00.000Z',
            task_history: [],
          },
        ],
        error: null,
      },
    );

    const out = await listLiveClaudeSessions(60, new Date('2026-05-28T15:00:00.000Z'));

    expect(fromCalls).toEqual(['claude_sessions', 'claude_sessions']);
    expect(selectCalls[0]).toContain('cwd');
    expect(selectCalls[1]).not.toContain('cwd');
    expect(out[0]).toEqual(expect.objectContaining({ session_id: 'sid-2' }));
    expect(out[0]).not.toHaveProperty('cwd');
  });
});

describe('cleanupStaleClaudeSessions', () => {
  it('deletes rows older than the requested number of hours', async () => {
    responses.push({ error: null });

    await cleanupStaleClaudeSessions(24, new Date('2026-05-28T15:00:00.000Z'));

    expect(fromCalls).toEqual(['claude_sessions']);
    expect(deleteCalls).toEqual(['delete']);
    expect(ltCalls).toEqual([['last_seen_at', '2026-05-27T15:00:00.000Z']]);
  });
});
