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

/**
 * Rich session context produced by task-synthesis.js (client-side). Forwarded
 * from /api/linear/outcome-append callers when the trigger is `/task-done`
 * without a PR — gives the outcome block real substance (files, branch,
 * commands, Haiku-summary) instead of the previous "kein PR" placeholder.
 */
export interface OutcomeClientContext {
  session_id?: string;
  cwd?: string;
  branch?: string;
  firstPrompt?: string | null;
  /** Edit/Write/MultiEdit touches (meta-config paths already filtered out). */
  files?: Array<{ path: string; tool: string; at?: string }>;
  /** Filtered bash commands (pnpm/git/gh/supabase/vercel/etc.). */
  commands?: Array<{ cmd: string; at?: string }>;
  /** Commits since session start across touched repos. */
  commits?: Array<{ repo?: string; hash: string; subj?: string; author?: string; at?: string }>;
  /** Haiku-generated 2-3 sentence German summary (optional). */
  summary?: string;
}

export interface OutcomeInput {
  identifier: string;
  /** Trigger source — appears in the block footer for audit. */
  source: 'pr-merge' | 'commit-close' | 'task-done';
  closedAt: string; // ISO-8601
  pr?: OutcomePrSummary | null;
  clientContext?: OutcomeClientContext | null;
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

/** Render the session-context block produced by task-synthesis.js. Used when
 *  the close didn't come from a PR (i.e. /task-done) and we instead have the
 *  client-side context (files, branch, commands, optional Haiku summary). */
function renderClientContext(ctx: OutcomeClientContext): string[] {
  const out: string[] = [];
  if (ctx.summary && ctx.summary.trim()) {
    out.push(`- **Was passiert:** ${ctx.summary.trim()}`);
  }
  if (ctx.branch) out.push(`- **Branch:** \`${ctx.branch}\``);
  if (ctx.cwd) out.push(`- **Workspace:** \`${ctx.cwd}\``);
  if (ctx.firstPrompt) {
    const fp = ctx.firstPrompt.replace(/\s+/g, ' ').trim().slice(0, 180);
    out.push(`- **Erste Anweisung:** ${fp}${fp.length >= 180 ? '…' : ''}`);
  }
  if (ctx.files && ctx.files.length > 0) {
    const total = ctx.files.length;
    out.push(`- **Touched files (${total}):**`);
    const shown = ctx.files.slice(0, 12);
    for (const f of shown) {
      out.push(`  - \`${f.path}\` _(${f.tool})_`);
    }
    if (total > shown.length) out.push(`  - … +${total - shown.length} weitere`);
  }
  if (ctx.commands && ctx.commands.length > 0) {
    out.push(`- **Bash-Commands (${ctx.commands.length}):**`);
    for (const c of ctx.commands.slice(0, 8)) {
      out.push(`  - \`${c.cmd}\``);
    }
    if (ctx.commands.length > 8) out.push(`  - … +${ctx.commands.length - 8} weitere`);
  }
  if (ctx.commits && ctx.commits.length > 0) {
    out.push(`- **Commits seit Session-Start (${ctx.commits.length}):**`);
    for (const c of ctx.commits.slice(0, 10)) {
      const sha = (c.hash || '').slice(0, 7);
      const repo = c.repo ? `[${c.repo}] ` : '';
      out.push(`  - \`${sha}\` ${repo}${c.subj || ''}`);
    }
    if (ctx.commits.length > 10) out.push(`  - … +${ctx.commits.length - 10} weitere`);
  }
  return out;
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
  } else if (input.clientContext) {
    lines.push(...renderClientContext(input.clientContext));
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
