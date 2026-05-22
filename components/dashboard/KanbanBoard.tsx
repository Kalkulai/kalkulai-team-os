'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowUp, X } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { useActiveMember } from '@/lib/active-member';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
} from '@dnd-kit/core';
import type { UnifiedTask, UnifiedStatus } from '@/lib/unified-tasks';
import type { ClaudeSession } from '@/types';
import { KanbanCard } from './KanbanCard';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

const ACTIVE_COLUMNS: Array<{ id: UnifiedStatus; label: string }> = [
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'on-hold', label: 'On Hold' },
];

function DraggableCard({
  task,
  done,
  members,
  activeClaude,
}: {
  task: UnifiedTask;
  done?: boolean;
  members: Array<{ id: string; name: string }>;
  activeClaude?: ClaudeSession[];
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: done,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`kanban-draggable${isDragging ? ' is-dragging' : ''}`}
    >
      <KanbanCard task={task} done={done} members={members} activeClaude={activeClaude} />
    </div>
  );
}

function DroppableColumn({
  colId,
  label,
  cards,
  members,
  activeClaudeByIdentifier,
  done,
  addOpen,
  onToggleAdd,
  onSubmitAdd,
}: {
  colId: string;
  label: string;
  cards: UnifiedTask[];
  members: Array<{ id: string; name: string }>;
  activeClaudeByIdentifier?: Record<string, ClaudeSession[]>;
  done?: boolean;
  addOpen?: boolean;
  onToggleAdd?: () => void;
  onSubmitAdd?: (args: { title: string; dueDate: string | null; priority: number }) => Promise<void>;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: colId });
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const [priority, setPriority] = useState<number>(0);
  const [busy, setBusy] = useState(false);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const v = title.trim();
    if (!v || !onSubmitAdd || busy) return;
    setBusy(true);
    try {
      await onSubmitAdd({ title: v, dueDate: due, priority });
      setTitle('');
      setDue(null);
      setPriority(0);
    } finally {
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onToggleAdd?.();
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`kanban-col${done ? ' kanban-col-done' : ''}${isOver && !done ? ' kanban-col-over' : ''}`}
      data-col={colId}
    >
      <div className="kanban-col-header">
        <span className="kanban-col-title">{label}</span>
        <span className="kanban-col-header-actions">
          {cards.length > 0 && (
            <span className="kanban-col-count mono">{cards.length}</span>
          )}
          {onToggleAdd && (
            <button
              type="button"
              className="kanban-add-btn"
              onClick={onToggleAdd}
              aria-label={addOpen ? 'Add-Form schließen' : 'Task hinzufügen'}
              title={addOpen ? 'Schließen' : 'Neuer Task'}
            >
              {addOpen ? <X size={12} aria-hidden /> : <Plus size={13} aria-hidden />}
            </button>
          )}
        </span>
      </div>
      {cards.length === 0 && !addOpen ? (
        <p className="kanban-empty">
          {done ? 'Nichts diese Woche' : 'Keine Tasks'}
        </p>
      ) : (
        <div className="kanban-cards">
          {cards.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              done={done}
              members={members}
              activeClaude={task.identifier ? activeClaudeByIdentifier?.[task.identifier] : undefined}
            />
          ))}
          {addOpen && onSubmitAdd && (
            <form className="kanban-add-form" onSubmit={submit}>
              <textarea
                autoFocus
                rows={2}
                className="kanban-add-input"
                placeholder="Neuer Task — Enter zum Speichern, Esc zum Abbrechen"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={onKey}
                disabled={busy}
              />
              <div className="kanban-add-row">
                <DatePicker value={due} onChange={setDue} placeholder="Datum optional" />
                <div className="kanban-add-prio">
                  {[
                    { p: 1, label: 'urgent' },
                    { p: 2, label: 'high' },
                    { p: 3, label: 'medium' },
                    { p: 4, label: 'low' },
                  ].map((x) => (
                    <button
                      key={x.p}
                      type="button"
                      className={priority === x.p ? 'is-on' : ''}
                      onClick={() => setPriority(priority === x.p ? 0 : x.p)}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
                <div className="kanban-add-spacer" />
                <button
                  type="submit"
                  className="kanban-add-submit"
                  disabled={!title.trim() || busy}
                  aria-label="Speichern"
                >
                  <ArrowUp size={13} aria-hidden />
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function KanbanBoard({
  tasks: initialTasks,
  doneTasks: initialDone = [],
  members = [],
  activeClaudeByIdentifier,
}: {
  tasks: UnifiedTask[];
  doneTasks?: UnifiedTask[];
  members?: Array<{ id: string; name: string }>;
  /** Map of Linear-identifier → live Claude-Code sessions touching that card.
   * Powers the 🤖 live badge. Server-fetched in page.tsx. */
  activeClaudeByIdentifier?: Record<string, ClaudeSession[]>;
}) {
  const router = useRouter();
  const { activeId: memberId } = useActiveMember();
  const [tasks, setTasks] = useState(initialTasks);
  const [doneTasks, setDoneTasks] = useState(initialDone);
  const [activeTask, setActiveTask] = useState<UnifiedTask | null>(null);
  const [addOpen, setAddOpen] = useState<UnifiedStatus | null>(null);

  async function handleCreate(col: UnifiedStatus, args: { title: string; dueDate: string | null; priority: number }) {
    if (!memberId) return;
    const body: Record<string, unknown> = {
      title: args.title,
      userId: memberId,
      source: 'linear',
    };
    if (args.dueDate) body.dueDate = args.dueDate;
    if (args.priority > 0) body.priority = args.priority;
    const res = await fetch('/api/tasks/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[Kanban] create failed', res.status);
      return;
    }
    if (col !== 'todo') {
      try {
        const created = (await res.json()) as { id?: string };
        if (created.id) {
          await fetch('/api/tasks/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
            body: JSON.stringify({ issueId: created.id, status: col }),
          });
        }
      } catch (err) {
        console.error('[Kanban] post-create status flip failed', err);
      }
    }
    setAddOpen(null);
    router.refresh();
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id as string);
    setActiveTask(task ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const taskId = active.id as string;
    const targetCol = over.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === targetCol) return;

    const prevTasks = tasks;
    const prevDone = doneTasks;

    if (targetCol === 'done') {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setDoneTasks((prev) =>
        [{ ...task, status: 'done' as UnifiedStatus }, ...prev].slice(0, 3),
      );
    } else {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, status: targetCol as UnifiedStatus } : t,
        ),
      );
    }

    try {
      const res = task.kind === 'step'
        ? await fetch(`/api/kpis/${encodeURIComponent(taskId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
            body: JSON.stringify(
              targetCol === 'done'
                ? { completed: true }
                : { completed: false, status: targetCol as 'todo' | 'in-progress' | 'on-hold' },
            ),
          })
        : await fetch('/api/tasks/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
            body: JSON.stringify({ issueId: taskId, status: targetCol }),
          });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      router.refresh();
    } catch (err) {
      console.error('[Kanban] Persist failed, rolling back optimistic state', err);
      setTasks(prevTasks);
      setDoneTasks(prevDone);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="kanban-grid">
        {ACTIVE_COLUMNS.map((col) => (
          <DroppableColumn
            key={col.id}
            colId={col.id}
            label={col.label}
            cards={tasks.filter((t) => t.status === col.id)}
            members={members}
            activeClaudeByIdentifier={activeClaudeByIdentifier}
            addOpen={addOpen === col.id}
            onToggleAdd={() => setAddOpen(addOpen === col.id ? null : col.id)}
            onSubmitAdd={(args) => handleCreate(col.id, args)}
          />
        ))}
        <DroppableColumn
          colId="done"
          label="Erledigt"
          cards={doneTasks}
          members={members}
          done
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="kanban-drag-overlay">
            <KanbanCard task={activeTask} members={members} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
