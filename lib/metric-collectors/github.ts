import { recordMetric, METRIC_KEYS } from '@/lib/business-metrics';
import { getCommitsByAuthorSince, getMergedPRsByAuthorSince } from '@/lib/github';
import { supabaseAdmin } from '@/lib/supabase';

interface MemberLite {
  id: string;
  github_username: string | null;
}

/**
 * Repo-agnostic: for each member's github_username, count
 *  - commits in last 24h → deploys_per_day proxy
 *  - merged PRs in last 24h → meta
 * Captures activity across ANY repo (own or external) the member contributes to.
 */
export async function collectGithubMetrics(): Promise<Array<{ memberId: string; commits_24h: number; merges_24h: number }>> {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('id, github_username')
    .not('github_username', 'is', null);
  if (error) throw error;

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const results: Array<{ memberId: string; commits_24h: number; merges_24h: number }> = [];

  for (const m of (members ?? []) as MemberLite[]) {
    if (!m.github_username) continue;
    const [commits, merges] = await Promise.all([
      getCommitsByAuthorSince(m.github_username, sinceIso, 50),
      getMergedPRsByAuthorSince(m.github_username, sinceIso, 30),
    ]);
    const reposTouched = Array.from(new Set(commits.map((c) => c.repo)));
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.DEPLOYS_PER_DAY,
      value: merges.length,
      meta: {
        merges: merges.map((p) => ({ repo: p.repo, number: p.number, title: p.title })),
        repos_touched: reposTouched,
        since: sinceIso,
      },
    });
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.COMMITS_COUNT,
      value: commits.length,
      meta: {
        repos_touched: reposTouched,
        sample: commits.slice(0, 10).map((c) => ({ repo: c.repo, sha: c.sha, message: c.message })),
        since: sinceIso,
      },
    });
    results.push({ memberId: m.id, commits_24h: commits.length, merges_24h: merges.length });
  }
  return results;
}
