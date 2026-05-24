/**
 * KAL-116 — deterministic "Endzustand (auto)" Markdown block builder.
 *
 * Pure function so the route handler stays thin and the logic is unit-testable
 * without spinning up Linear/GitHub mocks. Produces the same shape whether
 * fired from `closes KAL-XX` commit-close or `gh pr merge`.
 *
 * Idempotency contract: the block always opens with `<!-- outcome-auto -->`
 * so the route can refuse to re-append if the marker is already present in
 * the issue description.
 */

export const OUTCOME_MARKER = '<!-- outcome-auto -->';

export interface OutcomePrSummary {
  number: number;
  title: string;
  url: string;
  /** PR body (markdown) — first paragraph is excerpted into the "Was passiert" line. */
  body?: string | null;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  mergedAt?: string | null;
  /** Up to ~5 commits, oldest→newest. */
  commits?: Array<{ oid: string; messageHeadline: string }>;
}

export interface OutcomeInput {
  identifier: string;
  /** Trigger source — appears in the block footer for audit. */
  source: 'pr-merge' | 'commit-close' | 'task-done';
  closedAt: string; // ISO-8601
  pr?: OutcomePrSummary | null;
}

const SUMMARY_MAX_LEN = 240;

function excerptBody(body: string | null | undefined): string | null {
  if (!body) return null;
  const stripped = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('<!--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return null;
  if (stripped.length <= SUMMARY_MAX_LEN) return stripped;
  return stripped.slice(0, SUMMARY_MAX_LEN - 1).trimEnd() + '…';
}

/** Build the outcome block. Always starts with the marker for idempotency. */
export function buildOutcomeBlock(input: OutcomeInput): string {
  const lines: string[] = [];
  lines.push(OUTCOME_MARKER);
  lines.push('## Endzustand (auto)');

  if (input.pr) {
    const p = input.pr;
    const stats =
      typeof p.additions === 'number' && typeof p.deletions === 'number'
        ? ` (+${p.additions}/-${p.deletions}${
            typeof p.changedFiles === 'number' ? `, ${p.changedFiles} files` : ''
          })`
        : '';
    lines.push(`- **Geliefert:** [#${p.number} — ${p.title}](${p.url})${stats}`);
    const summary = excerptBody(p.body);
    if (summary) lines.push(`- **Was passiert:** ${summary}`);
    if (p.commits && p.commits.length > 0) {
      lines.push('- **Commits:**');
      for (const c of p.commits.slice(0, 5)) {
        const sha = c.oid.slice(0, 7);
        lines.push(`  - \`${sha}\` ${c.messageHeadline}`);
      }
    }
  } else {
    lines.push(`- **Geliefert:** kein PR — direkter Commit-Close`);
  }

  lines.push(`- **Closed at:** ${input.closedAt} (via ${input.source})`);
  return lines.join('\n');
}

/** Compose the new full description = old + outcome block, with a single
 *  blank line separator. Returns null when the marker is already present
 *  (idempotent skip). */
export function appendOutcomeToDescription(
  currentDescription: string | null,
  block: string,
): string | null {
  const current = currentDescription ?? '';
  if (current.includes(OUTCOME_MARKER)) return null;
  if (!current.trim()) return block;
  return `${current.trimEnd()}\n\n${block}`;
}
