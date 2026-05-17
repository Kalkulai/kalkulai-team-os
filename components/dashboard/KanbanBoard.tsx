'use client';

import { useState } from 'react';
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
}: {
  task: UnifiedTask;
  done?: boolean;
  members: Array<{ id: string; name: string }>;
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
      <KanbanCard task={task} done={done} members={members} />
    </div>
  );
}

function DroppableColumn({
  colId,
  label,
  cards,
  members,
  done,
}: {
  colId: string;
  label: string;
  cards: UnifiedTask[];
  members: Array<{ id: string; name: string }>;
  done?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: colId });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-col${done ? ' kanban-col-done' : ''}${isOver && !done ? ' kanban-col-over' : ''}`}
    >
      <div className="kanban-col-header">
        <span className="kanban-col-title">{label}</span>
        {cards.length > 0 && (
          <span className="kanban-col-count mono">{cards.length}</span>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="kanban-empty">
          {done ? 'Nichts diese Woche' : 'Keine Tasks'}
        </p>
      ) : (
        <div className="kanban-cards">
          {cards.map((task) => (
            <DraggableCard key={task.id} task={task} done={done} members={members} />
          ))}
        </div>
      )}
    </div>
  );
}

export function KanbanBoard({
  tasks: initialTasks,
  doneTasks: initialDone = [],
  members = [],
}: {
  tasks: UnifiedTask[];
  doneTasks?: UnifiedTask[];
  members?: Array<{ id: string; name: string }>;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [doneTasks, setDoneTasks] = useState(initialDone);
  const [activeTask, setActiveTask] = useState<UnifiedTask | null>(null);

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
      if (task.kind === 'step') {
        await fetch(`/api/kpis/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
          body: JSON.stringify({ completed: targetCol === 'done' }),
        });
      } else {
        await fetch('/api/tasks/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
          body: JSON.stringify({ issueId: taskId, status: targetCol }),
        });
      }
    } catch {
      window.location.reload();
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
