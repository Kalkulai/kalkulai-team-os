import { recordMetric, METRIC_KEYS } from '@/lib/business-metrics';
import { getRecentlyMergedPRs } from '@/lib/github';
import { supabaseAdmin } from '@/lib/supabase';

interface MemberLite {
  id: string;
  github_username: string | null;
}

/**
 * For each member with a github_username: count merges to main in the last
 * 24h as a proxy for "deploys" (Vercel auto-deploys on every main-merge).
 * Persist as deploys_per_day. Idempotent.
 */
export async function collectGithubMetrics(): Promise<{ memberId: string; deploys_per_day: number }[]> {
  const { data: members, error } = await supabaseAdmin
    .from('team_members')
    .select('id, github_username')
    .not('github_username', 'is', null);
  if (error) throw error;

  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const recent = await getRecentlyMergedPRs(2).catch(() => []);
  const results: { memberId: string; deploys_per_day: number }[] = [];

  for (const m of (members ?? []) as MemberLite[]) {
    if (!m.github_username) continue;
    const handle = m.github_username.toLowerCase();
    const mine = recent.filter((pr) => {
      const author = ((pr as { authorLogin?: string }).authorLogin ?? '').toLowerCase();
      const mergedAt = (pr as { mergedAt?: string }).mergedAt;
      if (!mergedAt) return false;
      return author === handle && new Date(mergedAt).getTime() >= cutoff;
    });
    await recordMetric({
      memberId: m.id,
      metricKey: METRIC_KEYS.DEPLOYS_PER_DAY,
      value: mine.length,
      meta: { prs: mine.map((pr) => ({ number: (pr as { number?: number }).number, repo: (pr as { repo?: string }).repo })) },
    });
    results.push({ memberId: m.id, deploys_per_day: mine.length });
  }
  return results;
}
