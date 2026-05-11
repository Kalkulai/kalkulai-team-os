import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

interface OpenedPRNode {
  number: number;
  title: string;
  createdAt: string;
  headRefName: string;
  author: { login: string } | null;
}

function gqlOk(nodes: OpenedPRNode[]) {
  return {
    ok: true,
    json: async () => ({ data: { repository: { pullRequests: { nodes } } } }),
  } as Response;
}

function gqlNotOk() {
  return { ok: false, json: async () => ({}) } as Response;
}

async function loadModuleWithRepos(repos: string): Promise<typeof import('@/lib/github')> {
  process.env.GITHUB_REPOS = repos;
  process.env.GITHUB_TOKEN = 'gh_test_token';
  vi.resetModules();
  return import('@/lib/github');
}

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const now = Date.now();
const recentIso = new Date(now - 6 * 60 * 60 * 1000).toISOString(); // 6h ago
const olderIso = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(); // 5d ago
const newerIso = new Date(now - 1 * 60 * 60 * 1000).toISOString(); // 1h ago

describe('getRecentlyOpenedPRs', () => {
  it('maps GraphQL response into OpenedPR objects', async () => {
    const { getRecentlyOpenedPRs } = await loadModuleWithRepos('Kalkulai/kalkulai');
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          number: 101,
          title: 'Add login',
          createdAt: recentIso,
          headRefName: 'feature/login',
          author: { login: 'felix' },
        },
      ]),
    );
    const result = await getRecentlyOpenedPRs(2);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      number: 101,
      title: 'Add login',
      createdAt: recentIso,
      author: 'felix',
      headRef: 'feature/login',
      isBot: false,
      repo: 'Kalkulai/kalkulai',
    });
  });

  it('excludes PRs older than sinceDays cutoff', async () => {
    const { getRecentlyOpenedPRs } = await loadModuleWithRepos('Kalkulai/kalkulai');
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          number: 101,
          title: 'Recent',
          createdAt: recentIso,
          headRefName: 'feature/recent',
          author: { login: 'felix' },
        },
        {
          number: 99,
          title: 'Stale',
          createdAt: olderIso,
          headRefName: 'feature/stale',
          author: { login: 'felix' },
        },
      ]),
    );
    const result = await getRecentlyOpenedPRs(2);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(101);
  });

  it('iterates over multiple repos and sorts newest first', async () => {
    const { getRecentlyOpenedPRs } = await loadModuleWithRepos('Kalkulai/kalkulai,Kalkulai/team-os');
    fetchMock
      .mockResolvedValueOnce(
        gqlOk([
          {
            number: 101,
            title: 'A',
            createdAt: recentIso,
            headRefName: 'feature/a',
            author: { login: 'felix' },
          },
        ]),
      )
      .mockResolvedValueOnce(
        gqlOk([
          {
            number: 202,
            title: 'B',
            createdAt: newerIso,
            headRefName: 'feature/b',
            author: { login: 'leo' },
          },
        ]),
      );
    const result = await getRecentlyOpenedPRs(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    // newer (1h ago) should come before older (6h ago)
    expect(result[0].number).toBe(202);
    expect(result[1].number).toBe(101);
    expect(result[0].repo).toBe('Kalkulai/team-os');
    expect(result[1].repo).toBe('Kalkulai/kalkulai');
  });

  it('flags dependabot/* head refs as isBot', async () => {
    const { getRecentlyOpenedPRs } = await loadModuleWithRepos('Kalkulai/kalkulai');
    fetchMock.mockResolvedValueOnce(
      gqlOk([
        {
          number: 555,
          title: 'Bump lodash',
          createdAt: recentIso,
          headRefName: 'dependabot/npm_and_yarn/foo',
          author: { login: 'dependabot[bot]' },
        },
      ]),
    );
    const result = await getRecentlyOpenedPRs(2);
    expect(result[0].isBot).toBe(true);
  });

  it('returns [] when fetch response is not ok', async () => {
    const { getRecentlyOpenedPRs } = await loadModuleWithRepos('Kalkulai/kalkulai');
    fetchMock.mockResolvedValueOnce(gqlNotOk());
    const result = await getRecentlyOpenedPRs(2);
    expect(result).toEqual([]);
  });

  it('returns [] without calling fetch when REPOS is empty', async () => {
    const { getRecentlyOpenedPRs } = await loadModuleWithRepos('');
    const result = await getRecentlyOpenedPRs(2);
    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
