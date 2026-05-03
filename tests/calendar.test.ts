import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TeamMember } from '@/types';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  process.env.GOOGLE_CLIENT_ID = 'cid';
  process.env.GOOGLE_CLIENT_SECRET = 'csec';
  process.env.GOOGLE_REFRESH_TOKEN = 'env-refresh-token';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

import { getTodayEvents, countSalesCallsToday } from '@/lib/calendar';

function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'mem-1',
    name: 'Felix',
    email: 'felix@example.com',
    telegram_chat_id: null,
    linear_user_id: null,
    github_username: null,
    hubspot_owner_id: null,
    google_calendar_id: null,
    google_refresh_token: null,
    google_calendar_email: null,
    role: 'dev',
    ...overrides,
  };
}

const tokenOk = () => ({
  ok: true,
  json: async () => ({ access_token: 'access-xyz' }),
}) as Response;

const eventsResponse = (items: object[]) =>
  ({
    ok: true,
    json: async () => ({ items }),
  }) as Response;

describe('getTodayEvents — token selection', () => {
  it('uses member-specific refresh token when set', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(eventsResponse([]));
    await getTodayEvents(makeMember({ google_refresh_token: 'mem-token' }));

    const tokenCall = fetchMock.mock.calls[0];
    const tokenBody = JSON.parse(tokenCall[1].body as string);
    expect(tokenBody.refresh_token).toBe('mem-token');
  });

  it('falls back to env GOOGLE_REFRESH_TOKEN when member has no token', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(eventsResponse([]));
    await getTodayEvents(makeMember({ google_refresh_token: null }));

    const tokenBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(tokenBody.refresh_token).toBe('env-refresh-token');
  });

  it('returns empty list when no token is available anywhere', async () => {
    delete process.env.GOOGLE_REFRESH_TOKEN;
    const events = await getTodayEvents(makeMember());
    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns empty list when access_token exchange fails', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response);
    const events = await getTodayEvents(makeMember({ google_refresh_token: 'broken' }));
    expect(events).toEqual([]);
  });
});

describe('getTodayEvents — calendar id selection', () => {
  it('prefers google_calendar_email over google_calendar_id and primary', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(eventsResponse([]));
    await getTodayEvents(
      makeMember({
        google_refresh_token: 'tok',
        google_calendar_id: 'fallback',
        google_calendar_email: 'felix@kalkulai.de',
      })
    );
    const eventsCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(eventsCallUrl).toContain(encodeURIComponent('felix@kalkulai.de'));
  });

  it('falls back to google_calendar_id when email not set', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(eventsResponse([]));
    await getTodayEvents(
      makeMember({ google_refresh_token: 'tok', google_calendar_id: 'team@kalkulai.de' })
    );
    const eventsCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(eventsCallUrl).toContain(encodeURIComponent('team@kalkulai.de'));
  });

  it('falls back to "primary" when both email and id are null', async () => {
    fetchMock.mockResolvedValueOnce(tokenOk()).mockResolvedValueOnce(eventsResponse([]));
    await getTodayEvents(makeMember({ google_refresh_token: 'tok' }));
    const eventsCallUrl = fetchMock.mock.calls[1][0] as string;
    expect(eventsCallUrl).toContain('/primary/');
  });
});

describe('countSalesCallsToday', () => {
  it('counts only events flagged as sales call', () => {
    const result = countSalesCallsToday([
      { id: '1', summary: 'Standup', start: '', end: '', isSalesCall: false },
      { id: '2', summary: 'Demo Acme', start: '', end: '', isSalesCall: true },
      { id: '3', summary: 'Pitch X', start: '', end: '', isSalesCall: true },
    ]);
    expect(result).toBe(2);
  });

  it('returns 0 for empty list', () => {
    expect(countSalesCallsToday([])).toBe(0);
  });
});
