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

import { getCreatedIssuesSince } from '@/lib/linear';

interface RawNode {
  id: string;
  identifier: string;
  title: string;
  createdAt: string | null;
  labels?: { nodes?: Array<{ name: string }> };
}

function gqlOk(nodes: RawNode[]) {
  return {
    ok: true,
    json: async () => ({ data: { issues: { nodes } } }),
  } as Response;
}

describe('getCreatedIssuesSince', () => {
  it('maps GraphQL response nodes correctly including labels', async () => {
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          id: 'issue-uuid-1',
          identifier: 'KAI-123',
          title: 'Hermes-generated task',
          createdAt: '2026-05-10T14:32:11Z',
          labels: { nodes: [{ name: 'Hermes' }] },
        },
      ]),
    );

    const result = await getCreatedIssuesSince(
      'user-uuid',
      '2026-05-09T00:00:00Z',
    );

    expect(result).toEqual([
      {
        id: 'issue-uuid-1',
        identifier: 'KAI-123',
        title: 'Hermes-generated task',
        createdAt: '2026-05-10T14:32:11Z',
        labels: ['Hermes'],
      },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.variables.userId).toBe('user-uuid');
    expect(body.variables.since).toBe('2026-05-09T00:00:00Z');
    expect(body.query).toContain('CreatedIssuesSince');
    expect(body.query).toContain('createdAt');
  });

  it('filters out nodes with null createdAt', async () => {
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          id: 'issue-1',
          identifier: 'KAI-1',
          title: 'Valid',
          createdAt: '2026-05-10T14:32:11Z',
          labels: { nodes: [] },
        },
        {
          id: 'issue-2',
          identifier: 'KAI-2',
          title: 'No createdAt',
          createdAt: null,
          labels: { nodes: [] },
        },
      ]),
    );

    const result = await getCreatedIssuesSince(
      'user-uuid',
      '2026-05-09T00:00:00Z',
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('issue-1');
  });

  it('returns empty labels array when labels.nodes is missing', async () => {
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          id: 'issue-1',
          identifier: 'KAI-1',
          title: 'Unlabeled',
          createdAt: '2026-05-10T14:32:11Z',
        },
      ]),
    );

    const result = await getCreatedIssuesSince(
      'user-uuid',
      '2026-05-09T00:00:00Z',
    );

    expect(result).toHaveLength(1);
    expect(result[0].labels).toEqual([]);
  });

  it('returns all label names when multiple labels are present', async () => {
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          id: 'issue-1',
          identifier: 'KAI-1',
          title: 'Multi-labeled',
          createdAt: '2026-05-10T14:32:11Z',
          labels: { nodes: [{ name: 'Hermes' }, { name: 'Bug' }] },
        },
      ]),
    );

    const result = await getCreatedIssuesSince(
      'user-uuid',
      '2026-05-09T00:00:00Z',
    );

    expect(result[0].labels).toEqual(['Hermes', 'Bug']);
  });

  it('throws when the GraphQL response contains errors', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: 'Linear is down' }] }),
    } as Response);

    await expect(
      getCreatedIssuesSince('user-uuid', '2026-05-09T00:00:00Z'),
    ).rejects.toThrow(/Linear is down/);
  });
});
