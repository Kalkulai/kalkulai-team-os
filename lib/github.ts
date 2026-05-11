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
