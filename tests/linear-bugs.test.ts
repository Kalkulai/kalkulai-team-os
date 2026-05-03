import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
  process.env.LINEAR_API_KEY = 'lin_test_key';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

import { getBugsFixedThisWeek } from '@/lib/linear';

function gqlOk(nodeCount: number) {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `bug-${i}` }));
  return {
    ok: true,
    json: async () => ({ data: { issues: { nodes } } }),
  } as Response;
}

describe('getBugsFixedThisWeek', () => {
  it('returns the count of bugs completed this week', async () => {
    fetchMock.mockResolvedValueOnce(gqlOk(3));
    const count = await getBugsFixedThisWeek('user-1');
    expect(count).toBe(3);
  });

  it('returns 0 when no bugs were completed', async () => {
    fetchMock.mockResolvedValueOnce(gqlOk(0));
    const count = await getBugsFixedThisWeek('user-1');
    expect(count).toBe(0);
  });

  it('passes the user id and an ISO date for monday into the gql call', async () => {
    fetchMock.mockResolvedValueOnce(gqlOk(1));
    await getBugsFixedThisWeek('user-42');

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.variables.userId).toBe('user-42');
    expect(body.variables.since).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.query).toContain('Bug');
    expect(body.query).toContain('completed');
  });

  it('throws when the GraphQL response contains errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: 'Linear down' }] }),
    } as Response);
    await expect(getBugsFixedThisWeek('user-1')).rejects.toThrow(/Linear down/);
  });
});
