'use client';

import type { TaskMeta } from '@/lib/task-meta';
import { EFFORT_OPTIONS, quadrantBadge } from '@/lib/task-meta';

/** Shared planning-metadata controls, used in the board add-form and the edit modal.
 * Felix-only feature; renders nothing special beyond the existing button styling. */
export function TaskMetaFields({
  value,
  onChange,
  projects,
}: {
  value: TaskMeta;
  onChange: (next: TaskMeta) => void;
  projects: Array<{ id: string; name: string }>;
}) {
  const set = (patch: Partial<TaskMeta>) => onChange({ ...value, ...patch });
  const q = quadrantBadge(value.important, value.urgent);

  return (
    <div className="kanban-meta-fields">
      <div className="kanban-meta-group">
        <span className="kanban-meta-label">Kontext</span>
        <div className="kanban-add-prio">
          <button
            type="button"
            className={value.context === 'business' ? 'is-on' : ''}
            onClick={() => set({ context: value.context === 'business' ? null : 'business' })}
          >
            Geschäftlich
          </button>
          <button
            type="button"
            className={value.context === 'private' ? 'is-on' : ''}
            onClick={() => set({ context: value.context === 'private' ? null : 'private' })}
          >
            Privat
          </button>
        </div>
      </div>

      <div className="kanban-meta-group">
        <span className="kanban-meta-label">Aufwand</span>
        <div className="kanban-add-prio">
          {EFFORT_OPTIONS.map((o) => (
            <button
              key={o.minutes}
              type="button"
              className={value.effortMinutes === o.minutes ? 'is-on' : ''}
              onClick={() =>
                set({ effortMinutes: value.effortMinutes === o.minutes ? null : o.minutes })
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="kanban-meta-group">
        <span className="kanban-meta-label">Eisenhower</span>
        <div className="kanban-add-prio kanban-meta-eisenhower">
          <button
            type="button"
            className={value.important ? 'is-on' : ''}
            onClick={() => set({ important: !value.important })}
          >
            Wichtig
          </button>
          <button
            type="button"
            className={value.urgent ? 'is-on' : ''}
            onClick={() => set({ urgent: !value.urgent })}
          >
            Dringend
          </button>
          <span className={`pill ${q.cls} text-[10px]`}>{q.label}</span>
        </div>
      </div>

      <div className="kanban-meta-group">
        <span className="kanban-meta-label">Energie</span>
        <div className="kanban-add-prio">
          <button
            type="button"
            className={value.energy === 'deep' ? 'is-on' : ''}
            onClick={() => set({ energy: value.energy === 'deep' ? null : 'deep' })}
          >
            🧠 Deep
          </button>
          <button
            type="button"
            className={value.energy === 'admin' ? 'is-on' : ''}
            onClick={() => set({ energy: value.energy === 'admin' ? null : 'admin' })}
          >
            ⚙️ Admin
          </button>
        </div>
      </div>

      {projects.length > 0 && (
        <div className="kanban-meta-group">
          <span className="kanban-meta-label">Projekt</span>
          <select
            className="kanban-meta-select"
            value={value.projectId ?? ''}
            onChange={(e) => set({ projectId: e.target.value || null })}
          >
            <option value="">— kein Projekt —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="kanban-meta-group">
        <span className="kanban-meta-label">Termin</span>
        <div className="kanban-add-prio">
          <button
            type="button"
            className={value.fixed ? 'is-on' : ''}
            onClick={() => set({ fixed: !value.fixed })}
          >
            📌 Fixer Termin
          </button>
        </div>
      </div>
    </div>
  );
}
