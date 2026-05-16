import { describe, it, expect } from 'vitest';
import { parseTeamTaskGroupId, parseTeamTaskAssignees, buildTeamTaskDescription } from '../lib/team-tasks';

const GROUP_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const UID1 = 'bd695d11-0632-4a0a-b1d0-db43acf46a68';
const UID2 = 'c9677ade-e42c-4593-81c6-7a2108b145fd';

describe('parseTeamTaskGroupId', () => {
  it('returns null for null description', () => {
    expect(parseTeamTaskGroupId(null)).toBeNull();
  });

  it('returns null for undefined description', () => {
    expect(parseTeamTaskGroupId(undefined)).toBeNull();
  });

  it('returns null when footer missing', () => {
    expect(parseTeamTaskGroupId('Normal description text')).toBeNull();
  });

  it('returns group id from footer', () => {
    const desc = `<!-- team-task-group:${GROUP_ID} -->\n<!-- team-task-assignees:${UID1} -->`;
    expect(parseTeamTaskGroupId(desc)).toBe(GROUP_ID);
  });

  it('is case-insensitive', () => {
    const desc = `<!-- TEAM-TASK-GROUP:${GROUP_ID} -->`;
    expect(parseTeamTaskGroupId(desc)).toBe(GROUP_ID);
  });

  it('returns null for malformed footer (no uuid)', () => {
    expect(parseTeamTaskGroupId('<!-- team-task-group: -->')).toBeNull();
  });
});

describe('parseTeamTaskAssignees', () => {
  it('returns empty array for null description', () => {
    expect(parseTeamTaskAssignees(null)).toEqual([]);
  });

  it('returns empty array when footer missing', () => {
    expect(parseTeamTaskAssignees('Normal description')).toEqual([]);
  });

  it('returns single assignee', () => {
    const desc = `<!-- team-task-assignees:${UID1} -->`;
    expect(parseTeamTaskAssignees(desc)).toEqual([UID1]);
  });

  it('returns multiple assignees', () => {
    const desc = `<!-- team-task-assignees:${UID1},${UID2} -->`;
    expect(parseTeamTaskAssignees(desc)).toEqual([UID1, UID2]);
  });

  it('filters empty strings from split', () => {
    const desc = `<!-- team-task-assignees:${UID1},,${UID2} -->`;
    expect(parseTeamTaskAssignees(desc)).toEqual([UID1, UID2]);
  });
});

describe('buildTeamTaskDescription', () => {
  it('generates parseable footer', () => {
    const desc = buildTeamTaskDescription(GROUP_ID, [UID1, UID2]);
    expect(parseTeamTaskGroupId(desc)).toBe(GROUP_ID);
    expect(parseTeamTaskAssignees(desc)).toEqual([UID1, UID2]);
  });

  it('round-trips single assignee', () => {
    const desc = buildTeamTaskDescription(GROUP_ID, [UID1]);
    expect(parseTeamTaskAssignees(desc)).toEqual([UID1]);
  });
});
