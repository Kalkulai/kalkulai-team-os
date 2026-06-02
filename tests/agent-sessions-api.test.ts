import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const SECRET = 'unit-test-secret';

const cleanupStaleAgentSessionsMock = vi.fn();
const listLiveAgentSessionsMock = vi.fn();
const upsertAgentSessionMock = vi.fn();
const clearAgentSessionMock = vi.fn();

vi.mock('@/lib/agent-sessions', () => ({
  cleanupStaleAgentSessions: (...args: unknown[]) => cleanupStaleAgentSessionsMock(...args),
  listLiveAgentSessions: (...args: unknown[]) => listLiveAgentSessionsMock(...args),
  upsertAgentSession: (...args: unknown[]) => upsertAgentSessionMock(...args),
  clearAgentSession: (...args: unknown[]) => clearAgentSessionMock(...args),
}));

vi.mock('@/lib/revalidate', () => ({
  revalidateDashboard: vi.fn(),
}));

import { GET, POST } from '@/app/api/agents/sessions/route';

function request(url: string, init: ConstructorParameters<typeof NextRequest>[1] = {}): NextRequest {
  return new NextRequest(url, init);
}

function authHeaders(): Headers {
  return new Headers({
    authorization: `Bearer ${SECRET}`,
    'content-type': 'application/json',
  });
}

describe('/api/agents/sessions', () => {
  beforeEach(() => {
    process.env.DASHBOARD_API_SECRET = SECRET;
    cleanupStaleAgentSessionsMock.mockReset();
    listLiveAgentSessionsMock.mockReset();
    upsertAgentSessionMock.mockReset();
    clearAgentSessionMock.mockReset();
    cleanupStaleAgentSessionsMock.mockResolvedValue(undefined);
    listLiveAgentSessionsMock.mockResolvedValue([]);
    upsertAgentSessionMock.mockResolvedValue(undefined);
    clearAgentSessionMock.mockResolvedValue(undefined);
  });

  it('requires Bearer auth for reads', async () => {
    const res = await GET(request('http://localhost/api/agents/sessions'));

    expect(res.status).toBe(401);
    expect(listLiveAgentSessionsMock).not.toHaveBeenCalled();
  });

  it('returns live agent sessions after stale cleanup', async () => {
    listLiveAgentSessionsMock.mockResolvedValueOnce([
      { session_id: 'sid-1', runtime: 'codex', status: 'running' },
    ]);

    const res = await GET(request('http://localhost/api/agents/sessions', { headers: authHeaders() }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(cleanupStaleAgentSessionsMock).toHaveBeenCalledWith(24);
    expect(listLiveAgentSessionsMock).toHaveBeenCalledWith(60);
    expect(json.sessions).toEqual([{ session_id: 'sid-1', runtime: 'codex', status: 'running' }]);
  });

  it('upserts Codex session metadata', async () => {
    const res = await POST(
      request('http://localhost/api/agents/sessions', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          session_id: 'sid-codex',
          user_id: 'user-1',
          runtime: 'codex',
          status: 'running',
          linear_identifier: 'KAL-153',
          terminal_session_id: 'term-1',
          current_state: 'Running Codex',
          next_decision: 'Review output',
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertAgentSessionMock).toHaveBeenCalledWith(expect.objectContaining({
      session_id: 'sid-codex',
      user_id: 'user-1',
      runtime: 'codex',
      status: 'running',
      terminal_session_id: 'term-1',
      current_state: 'Running Codex',
      next_decision: 'Review output',
    }));
  });
});
