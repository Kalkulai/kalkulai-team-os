import type { GitHubBranch } from '@/types';
import { startOfWeek } from 'date-fns';

const REPOS: string[] = (process.env.GITHUB_REPOS || process.env.GITHUB_REPO || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const TOKEN = process.env.GITHUB_TOKEN!;
const PROTECTED = ['main', 'main_dev', 'staging', 'master', 'development', 'dev'];

async function ghFetch<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
    next: { revalidate: 30 },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export type GithubHealthStatus = 'ok' | 'unauthorized' | 'rate-limited' | 'unreachable';

/** Cheap probe: /rate_limit needs only a valid token, no scope. */
export async function getGithubHealth(): Promise<GithubHealthStatus> {
  if (!TOKEN) return 'unauthorized';
  try {
    const res = await fetch('https://api.github.com/rate_limit', {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      if (body.includes('Bad credentials') || res.status === 401) return 'unauthorized';
      return 'rate-limited';
    }
    if (!res.ok) return 'unreachable';
    return 'ok';
  } catch {
    return 'unreachable';
  }
}

export function isBotBranch(b: { name: string; authorLogin?: string }): boolean {
  if (b.name.startsWith('dependabot/') || b.name.startsWith('renovate/')) return true;
  const a = b.authorLogin?.toLowerCase();
  return !!a && (a === 'dependabot[bot]' || a === 'renovate[bot]' || a.endsWith('[bot]'));
}

interface PRMeta {
  prNumber?: number;
  prAuthor?: string;
  prAssignee?: string;
  prRequestedReviewer?: string;
}

async function getPullForBranch(repo: string, branchName: string): Promise<PRMeta> {
  const owner = repo.split('/')[0];
  try {
    const prs = await ghFetch<
      Array<{
        number: number;
        user: { login: string } | null;
        assignees: Array<{ login: string }> | null;
        requested_reviewers: Array<{ login: string }> | null;
      }>
    >(`/repos/${repo}/pulls?head=${owner}:${encodeURIComponent(branchName)}&state=open&per_page=1`);
    const pr = prs[0];
    if (!pr) return {};
    return {
      prNumber: pr.number,
      prAuthor: pr.user?.login,
      prAssignee: pr.assignees?.[0]?.login,
      prRequestedReviewer: pr.requested_reviewers?.[0]?.login,
    };
  } catch {
    return {};
  }
}

async function getDependabotOwner(repo: string, prNumber: number): Promise<string | undefined> {
  try {
    const files = await ghFetch<Array<{ filename: string; status: string }>>(
      `/repos/${repo}/pulls/${prNumber}/files`,
    );
    const target = files.find((f) => f.status === 'modified') ?? files[0];
    if (!target) return undefined;
    const commits = await ghFetch<Array<{ author: { login: string } | null }>>(
      `/repos/${repo}/commits?path=${encodeURIComponent(target.filename)}&per_page=10`,
    );
    for (const c of commits) {
      const login = c.author?.login;
      if (!login) continue;
      if (login.toLowerCase().endsWith('[bot]')) continue;
      return login;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function getActiveBranchesForRepo(
  repo: string,
  opts: { withPRMeta?: boolean },
): Promise<GitHubBranch[]> {
  const branches = await ghFetch<Array<{ name: string; commit: { sha: string; url: string } }>>(
    `/repos/${repo}/branches?per_page=100`,
  );
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const withDetails = await Promise.all(
    branches
      .filter((b) => !PROTECTED.includes(b.name))
      .map(async (b) => {
        try {
          const commit = await ghFetch<{
            commit: { author: { date: string } };
            author: { login: string } | null;
          }>(`/repos/${repo}/commits/${b.commit.sha}`);
          return {
            ...b,
            lastCommitDate: commit.commit.author.date,
            authorLogin: commit.author?.login ?? undefined,
            repo,
          };
        } catch {
          return {
            ...b,
            lastCommitDate: undefined,
            authorLogin: undefined,
            repo,
          };
        }
      }),
  );

  const recent = withDetails.filter(
    (b) => !b.lastCommitDate || new Date(b.lastCommitDate).getTime() > cutoff,
  );

  if (!opts.withPRMeta) {
    return recent;
  }

  const withPR = await Promise.all(
    recent.map(async (b) => {
      const meta = await getPullForBranch(repo, b.name);
      const merged = { ...b, ...meta, isBot: isBotBranch(b) };
      if (merged.isBot && merged.prNumber && !merged.prAssignee && !merged.prRequestedReviewer) {
        const blameOwner = await getDependabotOwner(repo, merged.prNumber);
        if (blameOwner) merged.prAssignee = blameOwner;
      }
      return merged;
    }),
  );
  return withPR;
}

export async function getActiveBranches(opts: { withPRMeta?: boolean } = {}): Promise<GitHubBranch[]> {
  if (REPOS.length === 0) return [];
  const all = await Promise.all(
    REPOS.map((r) => getActiveBranchesForRepo(r, opts).catch(() => [] as GitHubBranch[])),
  );
  return all.flat();
}

export interface MergedPR {
  number: number;
  title: string;
  mergedAt: string;
  merger?: string;
  headRef: string;
  isBot: boolean;
  repo: string;
}

async function getRecentlyMergedPRsForRepo(repo: string, sinceDays: number): Promise<MergedPR[]> {
  const [owner, name] = repo.split('/');
  const query = `{
    repository(owner: "${owner}", name: "${name}") {
      pullRequests(states: MERGED, first: 30, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes { number title mergedAt headRefName mergedBy { login } }
      }
    }
  }`;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        repository?: {
          pullRequests?: {
            nodes?: Array<{
              number: number;
              title: string;
              mergedAt: string | null;
              headRefName: string;
              mergedBy: { login: string } | null;
            }>;
          };
        };
      };
    };
    const nodes = json.data?.repository?.pullRequests?.nodes ?? [];
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return nodes
      .filter((n) => n.mergedAt && new Date(n.mergedAt).getTime() > cutoff)
      .map((n) => ({
        number: n.number,
        title: n.title,
        mergedAt: n.mergedAt as string,
        merger: n.mergedBy?.login,
        headRef: n.headRefName,
        isBot: n.headRefName.startsWith('dependabot/') || n.headRefName.startsWith('renovate/'),
        repo,
      }));
  } catch {
    return [];
  }
}

export async function getRecentlyMergedPRs(sinceDays = 2): Promise<MergedPR[]> {
  if (REPOS.length === 0) return [];
  const all = await Promise.all(REPOS.map((r) => getRecentlyMergedPRsForRepo(r, sinceDays)));
  return all.flat().sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
}

export interface OpenedPR {
  number: number;
  title: string;
  createdAt: string;
  author?: string;
  headRef: string;
  isBot: boolean;
  repo: string;
}

async function getRecentlyOpenedPRsForRepo(repo: string, sinceDays: number): Promise<OpenedPR[]> {
  const [owner, name] = repo.split('/');
  const query = `{
    repository(owner: "${owner}", name: "${name}") {
      pullRequests(states: OPEN, first: 30, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes { number title createdAt headRefName author { login } }
      }
    }
  }`;
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        repository?: {
          pullRequests?: {
            nodes?: Array<{
              number: number;
              title: string;
              createdAt: string;
              headRefName: string;
              author: { login: string } | null;
            }>;
          };
        };
      };
    };
    const nodes = json.data?.repository?.pullRequests?.nodes ?? [];
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return nodes
      .filter((n) => n.createdAt && new Date(n.createdAt).getTime() > cutoff)
      .map((n) => ({
        number: n.number,
        title: n.title,
        createdAt: n.createdAt,
        author: n.author?.login,
        headRef: n.headRefName,
        isBot: n.headRefName.startsWith('dependabot/') || n.headRefName.startsWith('renovate/'),
        repo,
      }));
  } catch {
    return [];
  }
}

export async function getRecentlyOpenedPRs(sinceDays = 2): Promise<OpenedPR[]> {
  if (REPOS.length === 0) return [];
  const all = await Promise.all(REPOS.map((r) => getRecentlyOpenedPRsForRepo(r, sinceDays)));
  return all.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCommitsThisWeek(githubUsername: string): Promise<number> {
  const since = startOfWeek(new Date(), { weekStartsOn: 1 });
  const counts = await Promise.all(
    REPOS.map(async (r) => {
      try {
        const commits = await ghFetch<unknown[]>(
          `/repos/${r}/commits?author=${githubUsername}&since=${since.toISOString()}&per_page=100`,
        );
        return Array.isArray(commits) ? commits.length : 0;
      } catch {
        return 0;
      }
    }),
  );
  return counts.reduce((a, b) => a + b, 0);
}

export async function getBranchesForLinearId(linearId: string): Promise<GitHubBranch[]> {
  const all = await getActiveBranches();
  return all.filter((b) => b.name.toLowerCase().includes(linearId.toLowerCase()));
}

// ─── Repo-agnostic search-by-author ─────────────────────────────────────
// Uses GitHub's search-API so we capture activity from ANY repo (incl.
// other people's repos the member contributes to), not just the configured
// REPOS list. Rate-limit: 30 req/min for search endpoints.

interface SearchCommitItem {
  sha: string;
  html_url: string;
  commit: { author: { date: string }; message: string };
  repository: { full_name: string };
}

export interface AuthoredCommit {
  sha: string;
  url: string;
  date: string;
  message: string;
  repo: string;
}

export async function getCommitsByAuthorSince(
  githubUsername: string,
  sinceIso: string,
  perPage = 50,
): Promise<AuthoredCommit[]> {
  if (!githubUsername) return [];
  const since = sinceIso.slice(0, 10);
  const q = encodeURIComponent(`author:${githubUsername} author-date:>=${since}`);
  const url = `/search/commits?q=${q}&per_page=${perPage}&sort=author-date&order=desc`;
  try {
    const data = await ghFetch<{ items?: SearchCommitItem[] }>(url);
    const items = data.items ?? [];
    const cutoff = new Date(sinceIso).getTime();
    return items
      .filter((c) => new Date(c.commit.author.date).getTime() >= cutoff)
      .map((c) => ({
        sha: c.sha,
        url: c.html_url,
        date: c.commit.author.date,
        message: (c.commit.message ?? '').split('\n')[0],
        repo: c.repository.full_name,
      }));
  } catch {
    return [];
  }
}

interface SearchIssueItem {
  number: number;
  title: string;
  html_url: string;
  closed_at: string | null;
  repository_url: string;
  pull_request?: { merged_at?: string | null };
}

export interface AuthoredPR {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  repo: string;
}

export async function getMergedPRsByAuthorSince(
  githubUsername: string,
  sinceIso: string,
  perPage = 30,
): Promise<AuthoredPR[]> {
  if (!githubUsername) return [];
  const since = sinceIso.slice(0, 10);
  const q = encodeURIComponent(`is:pr is:merged author:${githubUsername} merged:>=${since}`);
  const url = `/search/issues?q=${q}&per_page=${perPage}&sort=updated&order=desc`;
  try {
    const data = await ghFetch<{ items?: SearchIssueItem[] }>(url);
    const items = data.items ?? [];
    const cutoff = new Date(sinceIso).getTime();
    return items
      .map((it) => {
        const mergedAt = it.pull_request?.merged_at ?? it.closed_at ?? '';
        const repo = it.repository_url.replace('https://api.github.com/repos/', '');
        return { number: it.number, title: it.title, url: it.html_url, mergedAt, repo };
      })
      .filter((p) => p.mergedAt && new Date(p.mergedAt).getTime() >= cutoff)
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo-agnostic branches via the GitHub user-events feed.
// /users/{u}/events returns PushEvents across every repo the user touched,
// so we can list "branches with recent activity by Leon" without hard-coding
// repo names.
// ─────────────────────────────────────────────────────────────────────────────

interface UserEvent {
  type: string;
  created_at: string;
  repo: { name: string };
  payload?: {
    ref?: string;
    head?: string;
    commits?: Array<{ sha: string; url: string; message: string }>;
  };
}

export interface AuthoredBranch {
  name: string;
  repo: string;
  authorLogin: string;
  lastPushAt: string;
  url: string;
  sha?: string;
}

export async function getActiveBranchesByAuthor(
  githubUsername: string,
  sinceDays = 7,
): Promise<AuthoredBranch[]> {
  if (!githubUsername) return [];
  const cutoff = Date.now() - sinceDays * 86400000;
  try {
    const events = await ghFetch<UserEvent[]>(
      `/users/${encodeURIComponent(githubUsername)}/events?per_page=100`,
    );
    const byKey = new Map<string, AuthoredBranch>();
    for (const ev of events) {
      if (ev.type !== 'PushEvent') continue;
      const created = new Date(ev.created_at).getTime();
      if (!Number.isFinite(created) || created < cutoff) continue;
      const ref = ev.payload?.ref ?? '';
      if (!ref.startsWith('refs/heads/')) continue;
      const branch = ref.slice('refs/heads/'.length);
      if (PROTECTED.includes(branch)) continue;
      const repo = ev.repo.name;
      const key = `${repo}#${branch}`;
      const existing = byKey.get(key);
      const headSha = ev.payload?.head ?? ev.payload?.commits?.at(-1)?.sha;
      const entry: AuthoredBranch = {
        name: branch,
        repo,
        authorLogin: githubUsername,
        lastPushAt: ev.created_at,
        url: `https://github.com/${repo}/tree/${encodeURIComponent(branch)}`,
        sha: headSha,
      };
      if (!existing || existing.lastPushAt < entry.lastPushAt) {
        byKey.set(key, entry);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.lastPushAt.localeCompare(a.lastPushAt));
  } catch {
    return [];
  }
}
