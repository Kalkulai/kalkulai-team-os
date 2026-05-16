import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { UnifiedTask } from '@/lib/unified-tasks';

function duePill(iso: string | null): { label: string; cls: string } | null {
  if (!iso) return null;
  try {
    const days = differenceInCalendarDays(parseISO(iso), new Date());
    if (days < 0) return { label: `${format(parseISO(iso), 'EE d. MMM', { locale: de })} · überfällig`, cls: 'pill-rose' };
    if (days === 0) return { label: 'Heute', cls: 'pill-rose' };
    if (days === 1) return { label: 'Morgen', cls: 'pill-amber' };
    if (days <= 3) return { label: format(parseISO(iso), 'EE d. MMM', { locale: de }), cls: 'pill-amber' };
    return { label: format(parseISO(iso), 'EE d. MMM', { locale: de }), cls: 'pill-mute' };
  } catch {
    return null;
  }
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'urgent', 2: 'high', 3: 'medium', 4: 'low' };
const PRIORITY_PILL: Record<number, string> = {
  1: 'pill-rose',
  2: 'pill-amber',
  3: 'pill-mute',
  4: 'pill-mute',
};

export function KanbanCard({ task, done = false }: { task: UnifiedTask; done?: boolean }) {
  const due = duePill(task.dueDate);
  const prio = task.priority ?? 0;

  const inner = (
    <div className={`kanban-card${done ? ' kanban-card-done' : ''}`}>
      {task.project && (
        <span className="kanban-card-project" title={`Schritt von ${task.project.name}`}>
          ▸ {task.project.name}
        </span>
      )}
      <p className={`kanban-card-title${done ? ' kanban-card-title-done' : ''}`}>{task.title}</p>
      <div className="kanban-card-meta">
        {task.identifier && (
          <span className="pill pill-mute mono text-[10px]">{task.identifier}</span>
        )}
        {prio > 0 && (
          <span className={`pill ${PRIORITY_PILL[prio]} text-[10px]`}>{PRIORITY_LABEL[prio]}</span>
        )}
        {due && (
          <span className={`pill ${due.cls} mono text-[10px]`}>{due.label}</span>
        )}
      </div>
    </div>
  );

  if (task.url) {
    return (
      <a href={task.url} target="_blank" rel="noopener noreferrer" className="block">
        {inner}
      </a>
    );
  }

  return inner;
}
