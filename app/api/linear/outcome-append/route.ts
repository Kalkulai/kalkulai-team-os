import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { getIssueByIdentifier, updateIssue } from '@/lib/linear';
import { getPullRequestDetail } from '@/lib/github';
import { buildOutcomeBlock, appendOutcomeToDescription, OUTCOME_MARKER, type OutcomeInput } from '@/lib/outcome-builder';

export const runtime = 'nodejs';
export const maxDuration = 20;

/**
 * KAL-116 — append an "Endzustand (auto)" Markdown block to a Linear issue's
 * description when it transitions to Done. Idempotent via the `<!-- outcome-auto -->`
 * marker (a second POST is a no-op).
 *
 * Called fire-and-forget by the task-tracker post-bash hook on:
 *   - `git commit -m "... closes KAL-XX"` (source='commit-close')
 *   - `gh pr merge ...`                   (source='pr-merge', with prNumber+repo)
 *   - `/task-done`                        (source='task-done')
 *
 *   POST { identifier: "KAL-XX", source: "commit-close"|"pr-merge"|"task-done",
 *          prNumber?: number, repo?: "owner/name" }
 *     → { ok: true, applied: bool, reason?: string }
 */

interface Body {
  identifier?: string;
  source?: OutcomeInput['source'];
  prNumber?: number;
  repo?: string;
}

export async function POST(req: NextRequest) {
  if (!requireApiAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.identifier || !/^[A-Z]{2,5}-\d{1,6}$/.test(body.identifier)) {
    return NextResponse.json({ error: 'identifier required (KAL-XX)' }, { status: 400 });
  }
  const source: OutcomeInput['source'] = body.source ?? 'task-done';

  const issue = await getIssueByIdentifier(body.identifier).catch(() => null);
  if (!issue) {
    return NextResponse.json({ error: 'issue not found' }, { status: 404 });
  }
  if ((issue.description ?? '').includes(OUTCOME_MARKER)) {
    return NextResponse.json({ ok: true, applied: false, reason: 'already-tagged' });
  }

  let pr: Awaited<ReturnType<typeof getPullRequestDetail>> = null;
  if (body.prNumber && body.repo) {
    pr = await getPullRequestDetail(body.repo, body.prNumber).catch(() => null);
  }

  const block = buildOutcomeBlock({
    identifier: issue.identifier,
    source,
    closedAt: new Date().toISOString(),
    pr: pr
      ? {
          number: pr.number,
          title: pr.title,
          url: pr.url,
          body: pr.body,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          mergedAt: pr.merged_at,
          commits: pr.commits,
        }
      : null,
  });

  const next = appendOutcomeToDescription(issue.description, block);
  if (next === null) {
    return NextResponse.json({ ok: true, applied: false, reason: 'race-already-tagged' });
  }

  await updateIssue(issue.id, { description: next });
  console.log('[outcome-append] tagged', {
    identifier: issue.identifier,
    source,
    prNumber: body.prNumber ?? null,
  });
  return NextResponse.json({ ok: true, applied: true, identifier: issue.identifier });
}
