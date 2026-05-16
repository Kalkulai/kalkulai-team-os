'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, X, ChevronRight, Pencil, Undo2 } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { LinearIssue, KpiWithWeek, TaskSource } from '@/types';
import { mergeTasks, type UnifiedTask, type UnifiedStatus } from '@/lib/unified-tasks';
import { AvatarStack } from '@/components/dashboard/AvatarStack';

type StoredLocalTask = {
  id: string;
  title: string;
  createdAt: string;
  dueDate?: string | null;
  priority?: number;
};

const LS_KEY = (userId: string) => `kalkulai-local-tasks:${userId}`;

const UNDO_WINDOW_MS = 5000;

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

const STATUS_LABEL: Record<UnifiedStatus, string | null> = {
  'todo': null,
  'in-progress': 'in progress',
  'on-hold': 'on hold',
  'done': null,
};
const STATUS_PILL: Record<UnifiedStatus, string> = {
  'todo': '',
  'in-progress': 'pill-amber',
  'on-hold': 'pill-mute',
  'done': '',
};

function TaskRow({
  task,
  isPending,
  onCheck,
  onUndo,
  onStartEdit,
  members,
}: {
  task: UnifiedTask;
  isPending: boolean;
  onCheck: (id: string, kind: 'linear' | 'step') => void;
  onUndo: (id: string) => void;
  onStartEdit: (task: UnifiedTask) => void;
  members: Array<{ id: string; name: string }>;
}) {
  const prio = task.priority ?? 0;
  const isStep = task.kind === 'step';
  const source: TaskSource = isStep ? 'local' : (task.source ?? 'linear');
  const srcClass = isStep ? 'src-local' : SOURCE_CLASS[source];
  const srcLetter = isStep ? 'P' : SOURCE_LETTER[source];
  const srcTitle = isStep
    ? (task.project ? `Schritt von ${task.project.name}` : 'Projekt-Schritt')
    : SOURCE_TITLE[source];
  const due = dueMeta(task.dueDate);
  const statusLabel = STATUS_LABEL[task.status];
  const hasMeta = prio > 0 || due !== null || statusLabel !== null;
  const hasRow1 = (isStep && !!task.project) || !!task.teamTask;

  function handleRowClick() {
    if (!isPending) onCheck(task.id, task.kind);
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isPending) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onCheck(task.id, task.kind);
    }
  }

  return (
    <li>
      <div
        className={`task ${isPending ? 'is-done' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={isPending}
        onClick={handleRowClick}
        onKeyDown={handleKeyDown}
      >
        <span className="kb" aria-hidden>
          <Check />
        </span>
        <span className={`src-ic ${srcClass}`} title={srcTitle}>
          {srcLetter}
        </span>
        <span className="body">
          {hasRow1 && (
            <span className="row1-meta">
              {isStep && task.project ? (
                <span className="pill pill-mute text-[10px] opacity-70" title={`Schritt von ${task.project.name}`}>
                  ▸ {task.project.name}
                </span>
              ) : (
                <span />
              )}
              {task.teamTask && (
                <AvatarStack
                  assigneeUserIds={task.teamTask.assigneeUserIds}
                  members={members}
                />
              )}
            </span>
          )}
          <span className="title">
            {task.identifier && <span className="ref">{task.identifier}</span>}
            {task.title}
          </span>
          {hasMeta && (
            <span className="row2-meta">
              {due && <span className={`pill ${due.pillClass} mono due-pill`}>{due.label}</span>}
              {(prio > 0 || statusLabel) && (
                <span className="meta-end">
                  {prio > 0 && (
                    <span className={`pill ${PRIORITY_PILL[prio]}`}>{PRIORITY_LABEL[prio]}</span>
                  )}
                  {statusLabel && (
                    <span className={`pill ${STATUS_PILL[task.status]}`}>{statusLabel}</span>
                  )}
                </span>
              )}
            </span>
          )}
        </span>
        <span className="task-actions">
          {isPending ? (
            <button
              type="button"
              className="task-undo"
              onClick={(e) => {
                e.stopPropagation();
                onUndo(task.id);
              }}
              aria-label="Rückgängig"
              title="Rückgängig (5s)"
            >
              <Undo2 size={12} aria-hidden />
              <span>Rückgängig</span>
            </button>
          ) : (
            <button
              type="button"
              className="task-edit"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit(task);
              }}
              aria-label="Task bearbeiten"
              title="Bearbeiten"
            >
              <Pencil size={12} aria-hidden />
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

function TaskEditForm({
  task,
  onCancel,
  onSave,
  submitting,
  error,
  isStep = false,
}: {
  task: UnifiedTask;
  onCancel: () => void;
  onSave: (patch: { title: string; dueDate: string | null; priority: number }) => void;
  submitting: boolean;
  error: string | null;
  isStep?: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(task.dueDate ?? '');
  const [prio, setPrio] = useState<number>(task.priority ?? 0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || submitting) return;
    onSave({ title: trimmed, dueDate: due || null, priority: prio });
  }

  return (
    <li>
      <form onSubmit={handleSubmit} className="task-edit-form">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel"
            className="h-[30px] min-w-0 flex-1 rounded-lg border border-[var(--line-1)] bg-white/[0.04] px-3 text-[13px] text-[var(--ink-1)] outline-none transition-colors placeholder:text-[var(--ink-3)] focus:border-[var(--brand)] focus:bg-white/[0.06]"
          />
          <button
            type="submit"
            disabled={!title.trim() || submitting}
            className="btn-step pri h-[30px] w-[30px] flex-none p-0"
            aria-label="Änderungen speichern"
            title="Speichern"
          >
            <Check size={14} strokeWidth={2.6} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="btn-step h-[30px] w-[30px] flex-none p-0"
            aria-label="Bearbeiten abbrechen"
            title="Abbrechen"
          >
            <X size={14} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Fälligkeitsdatum"
            className="task-date-input"
          />
          {!isStep && (
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
                  aria-checked={prio === p}
                  onClick={() => setPrio(prio === p ? 0 : p)}
                  className={`pill ${cls} prio-chip ${prio === p ? 'is-on' : ''}`}
                  title={`Priorität: ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-[11.5px] text-[var(--danger)]">{error}</p>}
      </form>
    </li>
  );
}

export function TaskList({
  tasks,
  userId,
  steps = [],
  projects = [],
  members = [],
}: {
  tasks: LinearIssue[];
  userId: string;
  steps?: KpiWithWeek[];
  projects?: KpiWithWeek[];
  members?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [draftDue, setDraftDue] = useState('');
  const [draftPrio, setDraftPrio] = useState<number>(0);
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [localStore, setLocalStore] = useState<StoredLocalTask[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pending-Complete: Task ist abgehakt, aber Commit (Linear-State-Set bzw. localStore-Delete)
  // läuft erst nach UNDO_WINDOW_MS. Solange pending: Row bleibt sichtbar mit "Rückgängig"-Button.
  const [pending, setPending] = useState<Map<string, { localOnly: boolean; kind: 'linear' | 'step' }>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Nach committetem Complete: Task aus Liste raus, bis router.refresh die Server-Daten aktualisiert.
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadLocal(userId);
    setLocalStore(stored);
    if (stored.length === 0) return;

    let cancelled = false;
    void (async () => {
      let anyMigrated = false;
      for (const t of stored) {
        if (cancelled) break;
        try {
          const res = await fetch('/api/tasks/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
            },
            body: JSON.stringify({
              title: t.title,
              userId,
              priority: t.priority || undefined,
              dueDate: t.dueDate || undefined,
            }),
          });
          if (!res.ok) continue;
          if (cancelled) break;
          setLocalStore((prev) => {
            const next = prev.filter((x) => x.id !== t.id);
            persistLocal(userId, next);
            return next;
          });
          anyMigrated = true;
        } catch {
          // network / serializer fehler → nächster mount versucht's nochmal
        }
      }
      if (anyMigrated && !cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  function commitCompletion(id: string, localOnly: boolean, kind: 'linear' | 'step') {
    timersRef.current.delete(id);
    setPending((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    setHidden((prev) => new Set(prev).add(id));

    if (localOnly) {
      setLocalStore((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistLocal(userId, next);
        return next;
      });
      return;
    }

    if (kind === 'step') {
      void (async () => {
        try {
          const res = await fetch(`/api/kpis/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
            },
            body: JSON.stringify({ completed: true }),
          });
          if (!res.ok) throw new Error('Fehler beim Abschließen');
          router.refresh();
        } catch {
          setHidden((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      })();
      return;
    }

    void (async () => {
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
        router.refresh();
      } catch {
        // Rollback: Task taucht wieder auf.
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    })();
  }

  function handleCheck(id: string, kind: 'linear' | 'step') {
    if (pending.has(id) || hidden.has(id)) return;
    const localOnly = id.startsWith('local-');
    setPending((prev) => new Map(prev).set(id, { localOnly, kind }));
    const existing = timersRef.current.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => commitCompletion(id, localOnly, kind), UNDO_WINDOW_MS);
    timersRef.current.set(id, timer);
  }

  function handleUndo(id: string) {
    const t = timersRef.current.get(id);
    if (t) clearTimeout(t);
    timersRef.current.delete(id);
    setPending((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  function handleStartEdit(task: UnifiedTask) {
    setEditError(null);
    setEditingId(task.id);
  }
  function handleCancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(
    task: UnifiedTask,
    patch: { title: string; dueDate: string | null; priority: number },
  ) {
    setEditError(null);
    setEditSubmitting(true);

    if (task.id.startsWith('local-')) {
      setLocalStore((prev) => {
        const next = prev.map((t) =>
          t.id === task.id
            ? { ...t, title: patch.title, dueDate: patch.dueDate, priority: patch.priority }
            : t,
        );
        persistLocal(userId, next);
        return next;
      });
      setEditSubmitting(false);
      setEditingId(null);
      return;
    }

    if (task.kind === 'step') {
      try {
        const res = await fetch(`/api/kpis/${encodeURIComponent(task.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
          },
          body: JSON.stringify({ name: patch.title, due_date: patch.dueDate || null }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `Update fehlgeschlagen (HTTP ${res.status})`);
        }
        setEditingId(null);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setEditError(msg);
      } finally {
        setEditSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({
          title: patch.title,
          dueDate: patch.dueDate,
          priority: patch.priority,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Update fehlgeschlagen (HTTP ${res.status})`);
      }
      setEditingId(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setEditError(msg);
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = draft.trim();
    if (!title || submitting) return;
    setCreateError(null);
    setSubmitting(true);

    const isTeamTask = selectedAssignees.size > 0;

    // Team Tasks skip the optimistic local-store path (N issues, too complex to mirror locally)
    if (!isTeamTask) {
      const optimisticId = `local-${crypto.randomUUID()}`;
      const optimistic: StoredLocalTask = {
        id: optimisticId,
        title,
        createdAt: new Date().toISOString(),
        dueDate: draftDue || null,
        priority: draftPrio,
      };
      setLocalStore((prev) => [optimistic, ...prev]);

      try {
        const res = await fetch('/api/tasks/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
          },
          body: JSON.stringify({
            title,
            userId,
            priority: draftPrio || undefined,
            dueDate: draftDue || undefined,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? `Linear-Sync fehlgeschlagen (HTTP ${res.status})`);
        }
        setLocalStore((prev) => prev.filter((t) => t.id !== optimisticId));
        setDraft('');
        setDraftDue('');
        setDraftPrio(0);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
        setCreateError(`Linear-Sync fehlgeschlagen — Task nur lokal gespeichert. (${msg})`);
        setLocalStore((prev) => {
          persistLocal(userId, prev);
          return prev;
        });
        setDraft('');
        setDraftDue('');
        setDraftPrio(0);
      } finally {
        setSubmitting(false);
        inputRef.current?.focus();
      }
      return;
    }

    // Multi-assignee Team Task
    try {
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({
          title,
          assigneeUserIds: [userId, ...Array.from(selectedAssignees)],
          priority: draftPrio || undefined,
          dueDate: draftDue || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Team Task fehlgeschlagen (HTTP ${res.status})`);
      }
      setDraft('');
      setDraftDue('');
      setDraftPrio(0);
      setSelectedAssignees(new Set());
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      setCreateError(`Team Task fehlgeschlagen. (${msg})`);
    } finally {
      setSubmitting(false);
      inputRef.current?.focus();
    }
  }

  function toggleAdd() {
    if (addOpen) {
      setAddOpen(false);
      setDraft('');
      setDraftDue('');
      setDraftPrio(0);
      setSelectedAssignees(new Set());
      setCreateError(null);
    } else {
      setAddOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  function toggleAssignee(id: string) {
    setSelectedAssignees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllAssignees() {
    setSelectedAssignees((prev) =>
      prev.size === members.length ? new Set() : new Set(members.map((m) => m.id)),
    );
  }

  const pickerMembers = members.filter((m) => m.id !== userId);

  const localIssues = localStore.map(toIssue);
  const allUnified = mergeTasks([...localIssues, ...tasks], steps, projects);
  const visible = allUnified.filter((t) => !hidden.has(t.id));
  const top3 = visible.slice(0, 3);
  const rest = visible.slice(3);
  const restLabel =
    rest.length === 1 ? 'Weitere 1 Task anzeigen' : `Weitere ${rest.length} Tasks anzeigen`;

  function renderItem(t: UnifiedTask) {
    if (editingId === t.id) {
      return (
        <TaskEditForm
          key={t.id}
          task={t}
          onCancel={handleCancelEdit}
          onSave={(patch) => handleSaveEdit(t, patch)}
          submitting={editSubmitting}
          error={editError}
          isStep={t.kind === 'step'}
        />
      );
    }
    return (
      <TaskRow
        key={t.id}
        task={t}
        isPending={pending.has(t.id)}
        onCheck={handleCheck}
        onUndo={handleUndo}
        onStartEdit={handleStartEdit}
        members={members}
      />
    );
  }

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
          {pickerMembers.length > 0 && (
            <div className="member-picker" role="group" aria-label="Auch zuweisen an">
              {pickerMembers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selectedAssignees.has(m.id)}
                  onClick={() => toggleAssignee(m.id)}
                  className={`member-avatar-chip${selectedAssignees.has(m.id) ? ' is-on' : ''}`}
                  title={m.name}
                >
                  {m.name.charAt(0).toUpperCase()}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={selectedAssignees.size === pickerMembers.length && pickerMembers.length > 0}
                onClick={toggleAllAssignees}
                className={`member-team-chip${selectedAssignees.size === pickerMembers.length && pickerMembers.length > 0 ? ' is-on' : ''}`}
              >
                Alle
              </button>
            </div>
          )}
        </form>
      )}
      {createError && (
        <p className="-mt-1.5 mb-2 text-[11.5px] text-[var(--danger)]">{createError}</p>
      )}

      {top3.length > 0 ? (
        <ul>{top3.map(renderItem)}</ul>
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
          {showAll && <ul className="mt-2">{rest.map(renderItem)}</ul>}
        </>
      )}
    </div>
  );
}
