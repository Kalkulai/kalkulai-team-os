const GROUP_RE = /<!-- team-task-group:([0-9a-f-]+) -->/i;
const ASSIGNEES_RE = /<!-- team-task-assignees:([0-9a-f,-]+) -->/i;

export function parseTeamTaskGroupId(description: string | null | undefined): string | null {
  if (!description) return null;
  return description.match(GROUP_RE)?.[1] ?? null;
}

export function parseTeamTaskAssignees(description: string | null | undefined): string[] {
  if (!description) return [];
  const raw = description.match(ASSIGNEES_RE)?.[1];
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function buildTeamTaskDescription(groupId: string, assigneeUserIds: string[]): string {
  return `<!-- team-task-group:${groupId} -->\n<!-- team-task-assignees:${assigneeUserIds.join(',')} -->`;
}
