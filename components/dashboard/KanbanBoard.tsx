import type { UnifiedTask, UnifiedStatus } from '@/lib/unified-tasks';
import { KanbanCard } from './KanbanCard';

interface Column {
  id: UnifiedStatus;
  label: string;
}

const COLUMNS: Column[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'on-hold', label: 'On Hold' },
];

export function KanbanBoard({ tasks, doneTasks = [] }: { tasks: UnifiedTask[]; doneTasks?: UnifiedTask[] }) {
  return (
    <div className="kanban-grid">
      {COLUMNS.map((col) => {
        const cards = tasks.filter((t) => t.status === col.id);
        return (
          <div key={col.id} className="kanban-col">
            <div className="kanban-col-header">
              <span className="kanban-col-title">{col.label}</span>
              {cards.length > 0 && (
                <span className="kanban-col-count mono">{cards.length}</span>
              )}
            </div>
            {cards.length === 0 ? (
              <p className="kanban-empty">Keine Tasks</p>
            ) : (
              <div className="kanban-cards">
                {cards.map((task) => (
                  <KanbanCard key={task.id} task={task} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="kanban-col kanban-col-done">
        <div className="kanban-col-header">
          <span className="kanban-col-title">Erledigt</span>
          {doneTasks.length > 0 && (
            <span className="kanban-col-count mono">{doneTasks.length}</span>
          )}
        </div>
        {doneTasks.length === 0 ? (
          <p className="kanban-empty">Nichts diese Woche</p>
        ) : (
          <div className="kanban-cards">
            {doneTasks.map((task) => (
              <KanbanCard key={task.id} task={task} done />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
