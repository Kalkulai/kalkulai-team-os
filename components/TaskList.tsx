'use client';
import { useState, useRef, useEffect } from 'react';
import { Check, Plus, X, ChevronRight } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { LinearIssue, TaskSource } from '@/types';

type StoredLocalTask = {
  id: string;
  title: string;
  createdAt: string;
  dueDate?: string | null;
  priority?: number;
};

const LS_KEY = (userId: string) => `kalkulai-local-tasks:${userId}`;

function loadLocal(userId: string): StoredLocalTask[] {
  try {
    const raw = localStorage.getItem(LS_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is StoredLocalTask =>
        t &&
        typeof t.id === 'string' &&
        typeof t.title === 'string' &&
        typeof t.createdAt === 'string',
    ).map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
      priority: typeof t.priority === 'number' ? t.priority : 0,
    }));
  } catch {
    return [];
  }
}

function persistLocal(userId: string, tasks: StoredLocalTask[]): void {
  try {
    localStorage.setItem(LS_KEY(userId), JSON.stringify(tasks));
  } catch {
    // Silent: localStorage kann disabled sein (private mode, quota etc.).
  }
}

function toIssue(t: StoredLocalTask): LinearIssue {
  return {
    id: t.id,
    identifier: 'LOK',
    title: t.title,
    priority: typeof t.priority === 'number' ? t.priority : 0,
    state: { name: 'Offen', type: 'unstarted' },
    assignee: null,
    dueDate: t.dueDate ?? null,
    source: 'local',
  };
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' };
const PRIORITY_PILL: Record<number, string> = {
  1: 'pill-rose',
  2: 'pill-amber',
  3: 'pill-mute',
  4: 'pill-mute',
};

const SOURCE_CLASS: Record<TaskSource, string> = {
  linear: 'src-linear',
  notion: 'src-notion',
  hermes: 'src-hermes',
  local: 'src-local',
};
const SOURCE_LETTER: Record<TaskSource, string> = {
  linear: 'L',
  notion: 'N',
  hermes: 'H',
  local: 'M',
};
const SOURCE_TITLE: Record<TaskSource, string> = {
  linear: 'Linear',
  notion: 'Notion',
  hermes: 'Hermes',
  local: 'Manuell',
};

function dueMeta(iso: string | null | undefined): { label: string; pillClass: string } | null {
  if (!iso) return null;
  try {
    const date = parseISO(iso);
    const days = differenceInCalendarDays(date, new Date());
    if (days < 0) {
      return {
        label: `${format(date, 'EE d. MMM', { locale: de })} · überfällig`,
        pillClass: 'pill-rose',
      };
    }
    if (days === 0) return { label: 'Heute', pillClass: 'pill-rose' };
    if (days === 1) return { label: 'Morgen', pillClass: 'pill-amber' };
    if (days <= 3) return { label: format(date, 'EE d. MMM', { locale: de }), pillClass: 'pill-amber' };
    return { label: format(date, 'EE d. MMM', { locale: de }), pillClass: 'pill-mute' };
  } catch {
    return null;
  }
}

function TaskRow({
  task,
  isDone,
  onCheck,
}: {
  task: LinearIssue;
  isDone: boolean;
  onCheck: (id: string) => void;
}) {
  const prio = task.priority;
  const source: TaskSource = task.source ?? 'linear';
  const due = dueMeta(task.dueDate);
  const hasMeta = prio > 0 || due !== null;
  return (
    <li>
      <button
        type="button"
        onClick={() => !isDone && onCheck(task.id)}
        className={`task ${isDone ? 'is-done' : ''}`}
      >
        <span className="kb" aria-hidden>
          <Check />
        </span>
        <span className={`src-ic ${SOURCE_CLASS[source]}`} title={SOURCE_TITLE[source]}>
          {SOURCE_LETTER[source]}
        </span>
        <span className="body">
          <span className="title">
            <span className="ref">{task.identifier}</span>
            {task.title}
          </span>
          {hasMeta && (
            <span className="row2">
              {prio > 0 && (
                <span className={`pill ${PRIORITY_PILL[prio]}`}>{PRIORITY_LABEL[prio]}</span>
              )}
              {due && <span className={`pill ${due.pillClass} mono`}>{due.label}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Tasks-Sektion: rendert Sub-Section selbst (kein HorizonSection-Wrapper),
 * damit Plus-Toggle, Inline-Add-Form, Top-3 und Rest-Liste gemeinsamen Client-State teilen.
 * Layout-Klassen 1:1 von HorizonSection übernommen.
 */
export function TaskList({ tasks, userId }: { tasks: LinearIssue[]; userId: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftPrio, setDraftPrio] = useState<number>(0);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [localStore, setLocalStore] = useState<StoredLocalTask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hydration-safe: localStorage existiert nicht beim SSR.
  useEffect(() => {
    setLocalStore(loadLocal(userId));
  }, [userId]);

  async function handleCheck(id: string) {
    setDone((prev) => new Set(prev).add(id));
    if (id.startsWith('local-')) {
      setLocalStore((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistLocal(userId, next);
        return next;
      });
      return;
    }
    try {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({ issueId: id, userId }),
      });
      if (!res.ok) throw new Error('Fehler beim Abschließen');
    } catch {
      setDone((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setCreateError(null);
    const fresh: StoredLocalTask = {
      id: `local-${crypto.randomUUID()}`,
      title,
      createdAt: new Date().toISOString(),
      dueDate: draftDue ? draftDue : null,
      priority: draftPrio,
    };
    setLocalStore((prev) => {
      const next = [fresh, ...prev];
      persistLocal(userId, next);
      return next;
    });
    setDraft('');
    setDraftDue('');
    setDraftPrio(0);
    inputRef.current?.focus();
  }

  function toggleAdd() {
    if (addOpen) {
      setAddOpen(false);
      setDraft('');
      setDraftDue('');
      setDraftPrio(0);
      setCreateError(null);
    } else {
      setAddOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  // Lokale Tasks zuerst (neueste oben), danach Server-Tasks. Bereits abgehakte Items werden ausgeblendet.
  const localIssues = localStore.map(toIssue);
  const merged = [...localIssues, ...tasks];
  const visible = merged.filter((t) => !done.has(t.id));
  const top3 = visible.slice(0, 3);
  const rest = visible.slice(3);
  const restLabel =
    rest.length === 1 ? 'Weitere 1 Task anzeigen' : `Weitere ${rest.length} Tasks anzeigen`;

  return (
    <div className="relative z-[1] mt-0.5 border-t border-[var(--line-1)] px-5 pt-4 pb-4">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="ovr flex-1">Tasks heute</span>
        <button
          type="button"
          onClick={toggleAdd}
          className="add-trigger"
          aria-label={addOpen ? 'Hinzufügen abbrechen' : 'Task hinzufügen'}
          aria-expanded={addOpen}
        >
          {addOpen ? <X size={12} aria-hidden /> : <Plus size={13} aria-hidden />}
        </button>
      </div>

      {addOpen && (
        <form onSubmit={handleCreate} className="mb-3 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Neuer Task — Enter…"
              className="h-[30px] min-w-0 flex-1 rounded-lg border border-[var(--line-1)] bg-white/[0.04] px-3 text-[13px] text-[var(--ink-1)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--brand)] focus:bg-white/[0.06]"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="btn-step pri h-[30px] w-[30px] flex-none p-0"
              aria-label="Task anlegen"
              title="Task anlegen"
            >
              <Check size={14} strokeWidth={2.6} aria-hidden />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
              aria-label="Fälligkeitsdatum"
              className="task-date-input"
            />
            <div className="prio-group" role="radiogroup" aria-label="Priorität">
              {([
                [1, 'pill-rose', 'urgent'],
                [2, 'pill-amber', 'high'],
                [3, 'pill-mute', 'medium'],
                [4, 'pill-mute', 'low'],
              ] as const).map(([p, cls, label]) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={draftPrio === p}
                  onClick={() => setDraftPrio(draftPrio === p ? 0 : p)}
                  className={`pill ${cls} prio-chip ${draftPrio === p ? 'is-on' : ''}`}
                  title={`Priorität: ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </form>
      )}
      {createError && (
        <p className="-mt-1.5 mb-2 text-[11.5px] text-[var(--danger)]">{createError}</p>
      )}

      {top3.length > 0 ? (
        <ul>
          {top3.map((t) => (
            <TaskRow key={t.id} task={t} isDone={done.has(t.id)} onCheck={handleCheck} />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-[var(--ink-3)]">
          Keine offenen Tasks — Plus-Button rechts oben, um den ersten anzulegen.
        </p>
      )}

      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="see-all"
            aria-expanded={showAll}
          >
            {showAll ? 'Weniger anzeigen' : restLabel}
            <ChevronRight
              size={11}
              aria-hidden
              className={`transition-transform ${showAll ? 'rotate-90' : ''}`}
            />
          </button>
          {showAll && (
            <ul className="mt-2">
              {rest.map((t) => (
                <TaskRow key={t.id} task={t} isDone={done.has(t.id)} onCheck={handleCheck} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
