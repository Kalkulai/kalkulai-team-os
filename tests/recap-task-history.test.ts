import { describe, it, expect } from 'vitest';

// Pure mirror of the task-history aggregation in /api/recap/build:
// collect identifiers that were either currently-pinned or appeared in any
// session's task_history within today's window. Kept inline because the
// route file imports next/server which isn't wired in the Vitest env.
function collectActiveIdentifiers(
  sessions: Array<{
    linear_identifier: string | null;
    task_history: { linear_id: string; action: string; at: string }[] | null;
  }>,
  sinceISO: string,
  untilISO: string,
): string[] {
  const set = new Set<string>();
  for (const s of sessions) {
    if (s.linear_identifier) set.add(s.linear_identifier);
    for (const entry of s.task_history ?? []) {
      if (!entry?.linear_id || !entry.at) continue;
      if (entry.at >= sinceISO && entry.at <= untilISO) set.add(entry.linear_id);
    }
  }
  return Array.from(set).sort();
}

const SINCE = '2026-05-24T00:00:00.000Z';
const UNTIL = '2026-05-24T23:59:59.999Z';

describe('recap session_active_identifiers', () => {
  it('returns the currently-pinned identifier', () => {
    const out = collectActiveIdentifiers(
      [{ linear_identifier: 'KAL-132', task_history: [] }],
      SINCE,
      UNTIL,
    );
    expect(out).toEqual(['KAL-132']);
  });

  it('includes tickets seen only in task_history within window', () => {
    const out = collectActiveIdentifiers(
      [
        {
          linear_identifier: 'KAL-133',
          task_history: [
            { linear_id: 'KAL-109', action: 'hold', at: '2026-05-24T10:00:00.000Z' },
            { linear_id: 'KAL-132', action: 'done', at: '2026-05-24T11:00:00.000Z' },
          ],
        },
      ],
      SINCE,
      UNTIL,
    );
    expect(out).toEqual(['KAL-109', 'KAL-132', 'KAL-133']);
  });

  it('excludes history entries outside the window', () => {
    const out = collectActiveIdentifiers(
      [
        {
          linear_identifier: null,
          task_history: [
            { linear_id: 'KAL-OLD', action: 'done', at: '2026-05-22T10:00:00.000Z' },
            { linear_id: 'KAL-NEW', action: 'done', at: '2026-05-24T10:00:00.000Z' },
          ],
        },
      ],
      SINCE,
      UNTIL,
    );
    expect(out).toEqual(['KAL-NEW']);
  });

  it('deduplicates across sessions', () => {
    const out = collectActiveIdentifiers(
      [
        { linear_identifier: 'KAL-132', task_history: [] },
        {
          linear_identifier: null,
          task_history: [{ linear_id: 'KAL-132', action: 'hold', at: '2026-05-24T09:00:00.000Z' }],
        },
      ],
      SINCE,
      UNTIL,
    );
    expect(out).toEqual(['KAL-132']);
  });

  it('handles null task_history gracefully', () => {
    const out = collectActiveIdentifiers(
      [{ linear_identifier: 'KAL-132', task_history: null }],
      SINCE,
      UNTIL,
    );
    expect(out).toEqual(['KAL-132']);
  });
});
