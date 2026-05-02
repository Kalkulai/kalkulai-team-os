import type { GitHubBranch } from '@/types';

const REPO = process.env.GITHUB_REPO!;
const TOKEN = process.env.GITHUB_TOKEN!;
const PROTECTED = ['main', 'main_dev', 'staging', 'master'];

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

export async function getActiveBranches(): Promise<GitHubBranch[]> {
  const branches = await ghFetch<Array<{ name: string; commit: { sha: string; url: string } }>>(
    `/repos/${REPO}/branches`
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
          }>(`/repos/${REPO}/commits/${b.commit.sha}`);
          return {
            ...b,
            lastCommitDate: commit.commit.author.date,
            authorLogin: commit.author?.login,
          };
        } catch {
          return {
            ...b,
            lastCommitDate: undefined,
            authorLogin: undefined,
          };
        }
      })
  );

  return withDetails.filter(
    (b) => !b.lastCommitDate || new Date(b.lastCommitDate).getTime() > cutoff
  );
}

export async function getCommitsThisWeek(githubUsername: string): Promise<number> {
  const since = new Date();
  since.setDate(since.getDate() - since.getDay() + 1);
  since.setHours(0, 0, 0, 0);

  const commits = await ghFetch<unknown[]>(
    `/repos/${REPO}/commits?author=${githubUsername}&since=${since.toISOString()}&per_page=100`
  );
  return Array.isArray(commits) ? commits.length : 0;
}

export async function getBranchesForLinearId(linearId: string): Promise<GitHubBranch[]> {
  const all = await getActiveBranches();
  return all.filter((b) => b.name.toLowerCase().includes(linearId.toLowerCase()));
}
