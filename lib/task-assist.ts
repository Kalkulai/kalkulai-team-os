import type { TaskContext, TaskEnergy } from '@/lib/task-meta';

/** A follow-up task Kai proposes after looking at a task. */
export interface TaskFollowup {
  title: string;
  note?: string;
  effortMinutes?: number | null;
  context?: TaskContext | null;
  energy?: TaskEnergy | null;
}

/** Kai's per-task assistance: how to approach it + proposed follow-up tasks. */
export interface TaskAssist {
  suggestedNextStep: string | null;
  suggestedFollowups: TaskFollowup[];
  updatedAt: string | null;
}

export function hasAssist(a: TaskAssist | null | undefined): boolean {
  return Boolean(a && (a.suggestedNextStep || a.suggestedFollowups.length > 0));
}

/** Validate/normalize an untrusted assist payload from a request body. */
export function parseAssistInput(
  body: unknown,
): { nextStep: string | null; followups: TaskFollowup[] } {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nextStepRaw = o.nextStep ?? o.suggestedNextStep;
  const nextStep =
    typeof nextStepRaw === 'string' && nextStepRaw.trim() ? nextStepRaw.trim() : null;

  const rawList = Array.isArray(o.followups)
    ? o.followups
    : Array.isArray(o.suggestedFollowups)
      ? o.suggestedFollowups
      : [];
  const followups: TaskFollowup[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const title = typeof f.title === 'string' ? f.title.trim() : '';
    if (!title) continue;
    followups.push({
      title,
      note: typeof f.note === 'string' && f.note.trim() ? f.note.trim() : undefined,
      effortMinutes:
        typeof f.effortMinutes === 'number' && f.effortMinutes > 0
          ? Math.round(f.effortMinutes)
          : null,
      context: f.context === 'business' || f.context === 'private' ? f.context : null,
      energy: f.energy === 'deep' || f.energy === 'admin' ? f.energy : null,
    });
  }
  return { nextStep, followups: followups.slice(0, 10) };
}
