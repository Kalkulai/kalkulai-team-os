export type TaskContext = 'business' | 'private';
export type TaskEnergy = 'deep' | 'admin';

/** Felix-only task metadata (stored in Supabase `task_meta`, keyed by Linear issue id).
 * Pure/client-safe module — DB access lives in `lib/task-meta-db.ts`. */
export interface TaskMeta {
  context: TaskContext | null;
  effortMinutes: number | null;
  important: boolean;
  urgent: boolean;
  energy: TaskEnergy | null;
  projectId: string | null;
  fixed: boolean;
}

export const EMPTY_TASK_META: TaskMeta = {
  context: null,
  effortMinutes: null,
  important: false,
  urgent: false,
  energy: null,
  projectId: null,
  fixed: false,
};

export const EFFORT_OPTIONS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 15, label: '15m' },
  { minutes: 30, label: '30m' },
  { minutes: 60, label: '1h' },
  { minutes: 120, label: '2h' },
  { minutes: 240, label: '½ Tag' },
  { minutes: 480, label: '1 Tag' },
];

export function effortLabel(minutes: number | null): string | null {
  if (!minutes) return null;
  return EFFORT_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes}m`;
}

/** Eisenhower quadrant → Linear priority so the existing briefing/sort keeps working. */
export function quadrantToPriority(important: boolean, urgent: boolean): number {
  if (important && urgent) return 1; // Q1 — sofort
  if (important && !urgent) return 2; // Q2 — planen
  if (!important && urgent) return 3; // Q3 — delegieren
  return 4; // Q4 — streichen
}

export function quadrantBadge(
  important: boolean,
  urgent: boolean,
): { label: string; cls: string } {
  if (important && urgent) return { label: 'Q1', cls: 'kanban-meta-q1' };
  if (important && !urgent) return { label: 'Q2', cls: 'kanban-meta-q2' };
  if (!important && urgent) return { label: 'Q3', cls: 'kanban-meta-q3' };
  return { label: 'Q4', cls: 'kanban-meta-q4' };
}

/** True when any planning field is set (drives whether badges render). */
export function hasMeta(m: TaskMeta | null | undefined): boolean {
  if (!m) return false;
  return Boolean(
    m.context || m.effortMinutes || m.important || m.urgent || m.energy || m.projectId || m.fixed,
  );
}

/** Validates + normalizes an untrusted meta object from a request body. */
export function parseTaskMeta(input: unknown): TaskMeta | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const context =
    o.context === 'business' || o.context === 'private' ? o.context : null;
  const energy = o.energy === 'deep' || o.energy === 'admin' ? o.energy : null;
  const effortMinutes =
    typeof o.effortMinutes === 'number' && o.effortMinutes > 0
      ? Math.round(o.effortMinutes)
      : null;
  const projectId = typeof o.projectId === 'string' && o.projectId ? o.projectId : null;
  return {
    context,
    effortMinutes,
    important: o.important === true,
    urgent: o.urgent === true,
    energy,
    projectId,
    fixed: o.fixed === true,
  };
}
