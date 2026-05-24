import { describe, it, expect } from 'vitest';
import {
  buildOutcomeBlock,
  appendOutcomeToDescription,
  OUTCOME_MARKER,
} from '@/lib/outcome-builder';

const CLOSED = '2026-05-24T12:34:56.789Z';

describe('buildOutcomeBlock', () => {
  it('emits the idempotency marker as the first line', () => {
    const block = buildOutcomeBlock({
      identifier: 'KAL-132',
      source: 'task-done',
      closedAt: CLOSED,
    });
    expect(block.split('\n')[0]).toBe(OUTCOME_MARKER);
  });

  it('handles the no-PR commit-close case', () => {
    const block = buildOutcomeBlock({
      identifier: 'KAL-132',
      source: 'commit-close',
      closedAt: CLOSED,
    });
    expect(block).toContain('kein PR — direkter Commit-Close');
    expect(block).toContain('via commit-close');
  });

  it('renders PR title + stats + commits + summary line', () => {
    const block = buildOutcomeBlock({
      identifier: 'KAL-132',
      source: 'pr-merge',
      closedAt: CLOSED,
      pr: {
        number: 42,
        title: 'feat: thing',
        url: 'https://github.com/x/y/pull/42',
        body: 'This PR fixes the auto-assign gap.\n\nMore detail here.',
        additions: 239,
        deletions: 11,
        changedFiles: 4,
        commits: [
          { oid: 'd54d9bf9999999', messageHeadline: 'feat: thing' },
          { oid: 'ac7fdbe111111', messageHeadline: 'test: cover thing' },
        ],
      },
    });
    expect(block).toContain('[#42 — feat: thing](https://github.com/x/y/pull/42)');
    expect(block).toContain('+239/-11, 4 files');
    expect(block).toContain('This PR fixes the auto-assign gap.');
    expect(block).toContain('`d54d9bf`');
    expect(block).toContain('`ac7fdbe`');
  });

  it('truncates long PR bodies with ellipsis', () => {
    const body = 'x'.repeat(500);
    const block = buildOutcomeBlock({
      identifier: 'KAL-132',
      source: 'pr-merge',
      closedAt: CLOSED,
      pr: {
        number: 1,
        title: 't',
        url: 'u',
        body,
        commits: [],
      },
    });
    const line = block.split('\n').find((l) => l.startsWith('- **Was passiert:**'))!;
    expect(line.length).toBeLessThan(280);
    expect(line.endsWith('…')).toBe(true);
  });

  it('caps the commits list at 5 entries', () => {
    const block = buildOutcomeBlock({
      identifier: 'KAL-132',
      source: 'pr-merge',
      closedAt: CLOSED,
      pr: {
        number: 1,
        title: 't',
        url: 'u',
        body: null,
        commits: Array.from({ length: 10 }, (_, i) => ({
          oid: `abcdef${i}`.padEnd(40, '0'),
          messageHeadline: `commit ${i}`,
        })),
      },
    });
    const commitLines = block.split('\n').filter((l) => l.startsWith('  - `'));
    expect(commitLines).toHaveLength(5);
  });
});

describe('appendOutcomeToDescription', () => {
  const block = buildOutcomeBlock({
    identifier: 'KAL-132',
    source: 'task-done',
    closedAt: CLOSED,
  });

  it('returns block alone when description is empty', () => {
    expect(appendOutcomeToDescription(null, block)).toBe(block);
    expect(appendOutcomeToDescription('   ', block)).toBe(block);
  });

  it('separates existing content with a blank line', () => {
    const result = appendOutcomeToDescription('Original description.', block);
    expect(result).toBe(`Original description.\n\n${block}`);
  });

  it('returns null when marker is already present (idempotent skip)', () => {
    const tagged = `Original.\n\n${block}`;
    expect(appendOutcomeToDescription(tagged, block)).toBeNull();
  });

  it('trims trailing whitespace before appending', () => {
    const result = appendOutcomeToDescription('Original.\n\n\n', block);
    expect(result).toBe(`Original.\n\n${block}`);
  });
});
