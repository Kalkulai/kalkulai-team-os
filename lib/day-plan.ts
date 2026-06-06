export type DayBlockKind = 'task' | 'meeting' | 'focus' | 'admin' | 'break';

/** One timeboxed entry in a day plan. Times are local "HH:MM" strings. */
export interface DayBlock {
  start: string;
  end: string;
  kind: DayBlockKind;
  title: string;
  taskId?: string | null;
  identifier?: string | null;
  note?: string | null;
}

export interface DayPlan {
  date: string;
  blocks: DayBlock[];
  generatedBy: string | null;
  updatedAt: string | null;
}

const KIND_CLS: Record<DayBlockKind, string> = {
  task: 'day-block-task',
  meeting: 'day-block-meeting',
  focus: 'day-block-focus',
  admin: 'day-block-admin',
  break: 'day-block-break',
};

export function blockKindClass(kind: DayBlockKind): string {
  return KIND_CLS[kind] ?? 'day-block-task';
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validate/normalize an untrusted day-plan payload. */
export function parseDayBlocks(input: unknown): DayBlock[] {
  if (!Array.isArray(input)) return [];
  const out: DayBlock[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const b = item as Record<string, unknown>;
    const start = typeof b.start === 'string' && HHMM.test(b.start) ? b.start : null;
    const end = typeof b.end === 'string' && HHMM.test(b.end) ? b.end : null;
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!start || !end || !title) continue;
    const kind: DayBlockKind =
      b.kind === 'meeting' || b.kind === 'focus' || b.kind === 'admin' || b.kind === 'break'
        ? b.kind
        : 'task';
    out.push({
      start,
      end,
      kind,
      title,
      taskId: typeof b.taskId === 'string' ? b.taskId : null,
      identifier: typeof b.identifier === 'string' ? b.identifier : null,
      note: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 50);
}
