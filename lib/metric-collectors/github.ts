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
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.DEPLOYS_PER_DAY,
      value: merges.length,
      meta: {
        merges: merges.map((p) => ({ repo: p.repo, number: p.number, title: p.title })),
        commits_count: commits.length,
        repos_touched: Array.from(new Set(commits.map((c) => c.repo))),
        since: sinceIso,
      },
    });
    results.push({ memberId: m.id, commits_24h: commits.length, merges_24h: merges.length });
  }
  return results;
}
