import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import type { UnifiedTask } from '@/lib/unified-tasks';
import type { ClaudeSession } from '@/types';
import { AvatarStack } from '@/components/dashboard/AvatarStack';
import { hasMeta, quadrantBadge, effortLabel } from '@/lib/task-meta';
import { hasAssist } from '@/lib/task-assist';

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

export function KanbanCard({
  task,
  done = false,
  members = [],
  activeClaude = [],
  onOpen,
  projects = [],
}: {
  task: UnifiedTask;
  done?: boolean;
  members?: Array<{ id: string; name: string }>;
  /** Live Claude-Code sessions touching this card right now (see KAL-89). */
  activeClaude?: ClaudeSession[];
  /** When set, clicking the card body opens the edit modal (Felix-only). */
  onOpen?: () => void;
  /** For resolving a meta.projectId → project name on the badge. */
  projects?: Array<{ id: string; name: string }>;
}) {
  const due = duePill(task.dueDate);
  const prio = task.priority ?? 0;
  const meta = task.meta ?? null;
  const showMeta = hasMeta(meta);
  const q = meta ? quadrantBadge(meta.important, meta.urgent) : null;
  const projectName = meta?.projectId
    ? projects.find((p) => p.id === meta.projectId)?.name ?? null
    : null;
  const effort = effortLabel(meta?.effortMinutes ?? null);

  return (
    <div
      className={`kanban-card${done ? ' kanban-card-done' : ''}${
        showMeta && q ? ` kanban-card-${q.label.toLowerCase()}` : ''
      }${onOpen ? ' kanban-card-clickable' : ''}`}
      data-status={task.status}
      onClick={onOpen}
    >
      {task.project && (
        <span className="kanban-card-project" title={`Schritt von ${task.project.name}`}>
          ▸ {task.project.name}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className={`kanban-card-title${done ? ' kanban-card-title-done' : ''} flex-1`}>
          {task.url ? (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {task.title}
            </a>
          ) : (
            task.title
          )}
        </p>
        {task.teamTask && (
          <AvatarStack assigneeUserIds={task.teamTask.assigneeUserIds} members={members} />
        )}
      </div>
      <div className="kanban-card-meta">
        {task.identifier && (
          <span className="pill pill-mute mono text-[10px]">{task.identifier}</span>
        )}
        {hasAssist(task.assist) && (
          <span className="pill pill-blue text-[10px]" title="Kai hat Vorschläge">💡 Kai</span>
        )}
        {activeClaude.length > 0 && (
          <span
            className="pill pill-ok mono text-[10px]"
            title={`Live: ${activeClaude.map((s) => s.host ?? 'unknown').join(', ')}`}
          >
            🤖 live
          </span>
        )}
        {showMeta && q ? (
          <span className={`pill ${q.cls} text-[10px]`} title="Eisenhower-Quadrant">{q.label}</span>
        ) : (
          prio > 0 && (
            <span className={`pill ${PRIORITY_PILL[prio]} text-[10px]`}>{PRIORITY_LABEL[prio]}</span>
          )
        )}
        {meta?.context && (
          <span className={`pill ${meta.context === 'business' ? 'pill-blue' : 'pill-amber'} text-[10px]`}>
            {meta.context === 'business' ? 'Geschäftlich' : 'Privat'}
          </span>
        )}
        {effort && <span className="pill pill-mute mono text-[10px]">⏱ {effort}</span>}
        {meta?.energy && (
          <span className="pill pill-mute text-[10px]">
            {meta.energy === 'deep' ? '🧠 Deep' : '⚙️ Admin'}
          </span>
        )}
        {projectName && <span className="pill pill-mute text-[10px]">📁 {projectName}</span>}
        {meta?.fixed && <span className="pill pill-amber text-[10px]">📌 Fix</span>}
        {due && (
          <span className={`pill ${due.cls} mono text-[10px]`}>{due.label}</span>
        )}
      </div>
    </div>
  );
}
