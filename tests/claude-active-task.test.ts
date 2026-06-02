import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'unit-test-secret';

const listLiveClaudeSessionsMock = vi.fn();
const cleanupStaleClaudeSessionsMock = vi.fn();
const upsertClaudeSessionMock = vi.fn();
const touchClaudeSessionMock = vi.fn();
const clearClaudeSessionMock = vi.fn();

vi.mock('@/lib/claude-sessions', () => ({
  listLiveClaudeSessions: (...args: unknown[]) => listLiveClaudeSessionsMock(...args),
  cleanupStaleClaudeSessions: (...args: unknown[]) => cleanupStaleClaudeSessionsMock(...args),
  upsertClaudeSession: (...args: unknown[]) => upsertClaudeSessionMock(...args),
  touchClaudeSession: (...args: unknown[]) => touchClaudeSessionMock(...args),
  clearClaudeSession: (...args: unknown[]) => clearClaudeSessionMock(...args),
}));

vi.mock('@/lib/revalidate', () => ({
  revalidateDashboard: vi.fn(),
}));

import { GET, POST } from '@/app/api/claude/active-task/route';

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}): NextRequest {
  return new NextRequest(url, init);
}

function authHeaders(): Headers {
  return new Headers({
    authorization: `Bearer ${SECRET}`,
    'content-type': 'application/json',
  });
}

describe('/api/claude/active-task', () => {
  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = SECRET;
    listLiveClaudeSessionsMock.mockReset();
    cleanupStaleClaudeSessionsMock.mockReset();
    upsertClaudeSessionMock.mockReset();
    touchClaudeSessionMock.mockReset();
    clearClaudeSessionMock.mockReset();
    cleanupStaleClaudeSessionsMock.mockResolvedValue(undefined);
    listLiveClaudeSessionsMock.mockResolvedValue([]);
    upsertClaudeSessionMock.mockResolvedValue(undefined);
    touchClaudeSessionMock.mockResolvedValue(undefined);
    clearClaudeSessionMock.mockResolvedValue(undefined);
  });

  it('requires Bearer auth for live snapshot reads', async () => {
    const res = await GET(request('http://localhost/api/claude/active-task?live=true'));

    expect(res.status).toBe(401);
    expect(listLiveClaudeSessionsMock).not.toHaveBeenCalled();
    expect(cleanupStaleClaudeSessionsMock).not.toHaveBeenCalled();
  });

  it('returns live sessions from the last 60 minutes and runs stale cleanup', async () => {
    listLiveClaudeSessionsMock.mockResolvedValueOnce([
      {
        session_id: 'sid-1',
        user_id: 'user-1',
        linear_identifier: 'KAL-153',
        title: 'Cross-session snapshot',
        host: 'Laptop-Leon',
        cwd: 'C:\\Kalkulai\\kalkulai-team-os',
        started_at: '2026-05-28T14:00:00.000Z',
        last_seen_at: '2026-05-28T14:45:00.000Z',
        idle_minutes: 15,
        linear_url: 'https://linear.app/kalkulai-team/issue/KAL-153',
      },
    ]);

    const res = await GET(
      request('http://localhost/api/claude/active-task?live=true', { headers: authHeaders() }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(cleanupStaleClaudeSessionsMock).toHaveBeenCalledWith(24);
    expect(listLiveClaudeSessionsMock).toHaveBeenCalledWith(60);
    expect(json.sessions).toEqual([
      expect.objectContaining({
        session_id: 'sid-1',
        linear_identifier: 'KAL-153',
        idle_minutes: 15,
        linear_url: 'https://linear.app/kalkulai-team/issue/KAL-153',
      }),
    ]);
  });

  it('forwards optional cwd on POST upserts', async () => {
    const res = await POST(
      request('http://localhost/api/claude/active-task', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          session_id: 'sid-2',
          user_id: 'user-1',
          linear_identifier: 'KAL-153',
          title: 'Cross-session snapshot',
          host: 'Laptop-Leon',
          cwd: 'C:\\Kalkulai\\kalkulai-team-os',
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertClaudeSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'sid-2',
        user_id: 'user-1',
        linear_identifier: 'KAL-153',
        cwd: 'C:\\Kalkulai\\kalkulai-team-os',
      }),
    );
  });
});
