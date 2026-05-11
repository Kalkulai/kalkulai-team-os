'use client';
import { useEffect, useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import type { KpiWithWeek } from '@/types';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

interface ProjectGroup {
  project: KpiWithWeek;
  steps: KpiWithWeek[];
}

export function ProjectsTracker({ userId }: { userId: string }) {
  const [groups, setGroups] = useState<ProjectGroup[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());

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
    const built: ProjectGroup[] = projects.map((project) => ({
      project,
      steps: (stepsByParent.get(project.id) ?? []).sort(sortSteps),
    }));
    setGroups(built);
    // Default-Open: alle "late" Projekte (Verspätung sichtbar machen)
    const lateOpen = new Set<string>();
    for (const g of built) {
      if (isLate(g.project.due_date)) lateOpen.add(g.project.id);
    }
    setOpen(lateOpen);
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount; no external subscription model available
    void load();
  }, [load]);

  function toggleOpen(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleStep(stepId: string, next: boolean) {
    setBusy((prev) => new Set(prev).add(stepId));
    setGroups((prev) =>
      prev
        ? prev.map((g) => ({
            ...g,
            steps: g.steps.map((s) => (s.id === stepId ? { ...s, completed: next } : s)),
          }))
        : prev,
    );
    try {
      await fetch(`/api/kpis/${stepId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ completed: next }),
      });
    } finally {
      setBusy((prev) => {
        const n = new Set(prev);
        n.delete(stepId);
        return n;
      });
    }
  }

  if (groups === null) return <p className="text-[13px] text-[var(--ink-3)]">Lade Projekte…</p>;

  if (groups.length === 0) {
    return (
      <p className="text-[13px] text-[var(--ink-3)]">
        Noch keine Projekte angelegt. Geh zu{' '}
        <a href="/settings" className="text-[var(--ink-1)] underline underline-offset-2">
          Einstellungen
        </a>{' '}
        und leg dein erstes an.
      </p>
    );
  }

  return (
    <div>
      {groups.map(({ project, steps }) => {
        const total = steps.length;
        const done = steps.filter((s) => s.completed).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isOpen = open.has(project.id);
        const late = isLate(project.due_date);
        const dueLabel = projectDueLabel(project.due_date);

        return (
          <div key={project.id} className={`proj ${late ? 'late' : ''} ${isOpen ? 'open' : ''}`}>
            <button type="button" onClick={() => toggleOpen(project.id)} className="proj-head">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="proj-chev"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <div className="proj-body">
                <div className="proj-row1">
                  <span className="proj-name">{project.name}</span>
                  {dueLabel && <span className="proj-due">{dueLabel}</span>}
                </div>
                <div className="proj-row2">
                  <div className="bar">
                    <i
                      ref={(el) => {
                        if (el) el.style.width = `${pct}%`;
                      }}
                    />
                  </div>
                  <span className="frac">
                    {done} / {total || '?'}
                  </span>
                </div>
              </div>
            </button>
            {isOpen && steps.length > 0 && (
              <ul className="proj-tasks">
                {steps.map((s) => {
                  const isBusy = busy.has(s.id);
                  const meta = stepDueMeta(s.due_date);
                  return (
                    <li key={s.id} className={`proj-task ${s.completed ? 'done' : ''}`}>
                      <button
                        type="button"
                        onClick={() => !isBusy && toggleStep(s.id, !s.completed)}
                        className="kb"
                        disabled={isBusy}
                        aria-label={s.completed ? 'Schritt offen markieren' : 'Schritt erledigen'}
                      >
                        <Check />
                      </button>
                      <span className="lbl">{s.name}</span>
                      {meta && <span className={`pill ${meta.pillClass} mono due`}>{meta.label}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function sortSteps(a: KpiWithWeek, b: KpiWithWeek): number {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return a.position - b.position;
}

function isLate(due: string | null): boolean {
  if (!due) return false;
  try {
    return differenceInCalendarDays(parseISO(due), new Date()) < 0;
  } catch {
    return false;
  }
}

function projectDueLabel(due: string | null): string | null {
  if (!due) return null;
  try {
    const date = parseISO(due);
    const days = differenceInCalendarDays(date, new Date());
    const base = format(date, 'd. MMM', { locale: de });
    if (days < 0) return `${base} · ${Math.abs(days)} T.`;
    if (days === 0) return 'Heute';
    return base;
  } catch {
    return due;
  }
}

function stepDueMeta(due: string | null): { label: string; pillClass: string } | null {
  if (!due) return null;
  try {
    const date = parseISO(due);
    const days = differenceInCalendarDays(date, new Date());
    if (days < 0) return { label: 'überfällig', pillClass: 'pill-rose' };
    if (days === 0) return { label: 'Heute', pillClass: 'pill-rose' };
    if (days <= 2) return { label: format(date, 'd. MMM', { locale: de }), pillClass: 'pill-amber' };
    return { label: format(date, 'd. MMM', { locale: de }), pillClass: 'pill-mute' };
  } catch {
    return { label: due, pillClass: 'pill-mute' };
  }
}
