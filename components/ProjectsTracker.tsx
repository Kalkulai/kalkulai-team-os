'use client';
import { useEffect, useState, useCallback } from 'react';
import type { KpiWithWeek } from '@/types';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'EEE d. MMM', { locale: de });
  } catch {
    return iso;
  }
}

interface ProjectGroup {
  project: KpiWithWeek;
  steps: KpiWithWeek[];
}

export function ProjectsTracker({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<ProjectGroup[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/kpis?userId=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = (await res.json()) as KpiWithWeek[];
    const projects = data.filter((k) => k.type === 'project');
    const stepsByParent = new Map<string, KpiWithWeek[]>();
    for (const s of data.filter((k) => k.type === 'step')) {
      if (!s.parent_id) continue;
      const arr = stepsByParent.get(s.parent_id) ?? [];
      arr.push(s);
      stepsByParent.set(s.parent_id, arr);
    }
    setGroups(
      projects.map((project) => ({
        project,
        steps: (stepsByParent.get(project.id) ?? []).sort(sortSteps),
      }))
    );
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function toggleStep(stepId: string, next: boolean) {
    setBusy((prev) => new Set(prev).add(stepId));
    setGroups((prev) =>
      prev
        ? prev.map((g) => ({
            ...g,
            steps: g.steps.map((s) => (s.id === stepId ? { ...s, completed: next } : s)),
          }))
        : prev
    );
    try {
      await fetch(`/api/kpis/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ completed: next }),
      });
    } finally {
      setBusy((prev) => { const n = new Set(prev); n.delete(stepId); return n; });
    }
  }

  if (groups === null) return <p className="text-sm text-muted-foreground">Lade Projekte…</p>;

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine Projekte angelegt. Geh zu{' '}
        <a href="/settings" className="text-foreground underline underline-offset-2">
          Einstellungen
        </a>{' '}
        und leg dein erstes an.
      </p>
    );
  }

  return (
    <ul className="space-y-5">
      {groups.map(({ project, steps }) => {
        const total = steps.length;
        const done = steps.filter((s) => s.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const due = formatDue(project.due_date);
        return (
          <li key={project.id} className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold tracking-tight">{project.name}</p>
                {due && (
                  <p className="text-[11px] text-muted-foreground">fällig {due}</p>
                )}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-sky-600 dark:text-sky-400">
                {done}/{total || '?'}
              </span>
            </div>
            <div className="relative h-1.5 overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-foreground/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-[width] duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            {steps.length > 0 && (
              <ul className="ml-1 space-y-1 border-l border-foreground/[0.08] pl-3">
                {steps.map((s) => {
                  const isBusy = busy.has(s.id);
                  const sDue = formatDue(s.due_date);
                  return (
                    <li key={s.id}>
                      <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-foreground/[0.04]">
                        <input
                          type="checkbox"
                          checked={s.completed}
                          onChange={(e) => toggleStep(s.id, e.target.checked)}
                          disabled={isBusy}
                          className="size-4 shrink-0 cursor-pointer accent-sky-500"
                        />
                        <span
                          className={`flex-1 text-sm leading-snug ${
                            s.completed ? 'text-muted-foreground line-through' : ''
                          }`}
                        >
                          {s.name}
                        </span>
                        {sDue && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {sDue}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function sortSteps(a: KpiWithWeek, b: KpiWithWeek): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return a.position - b.position;
}
