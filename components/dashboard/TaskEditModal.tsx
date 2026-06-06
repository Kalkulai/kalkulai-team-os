'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { TaskMetaFields } from './TaskMetaFields';
import type { UnifiedTask } from '@/lib/unified-tasks';
import { EMPTY_TASK_META, quadrantToPriority, type TaskMeta } from '@/lib/task-meta';

/** Click-to-edit modal for a Kanban card (Felix-only). Edits title, deadline and
 * the planning metadata; persists via PATCH /api/tasks/[id]. */
export function TaskEditModal({
  task,
  projects,
  userId,
  onClose,
  onSaved,
}: {
  task: UnifiedTask;
  projects: Array<{ id: string; name: string }>;
  userId: string | null;
  onClose: () => void;
  onSaved: (patch: {
    title: string;
    dueDate: string | null;
    meta: TaskMeta;
    priority: number;
  }) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState<string | null>(task.dueDate ?? null);
  const [meta, setMeta] = useState<TaskMeta>(task.meta ?? EMPTY_TASK_META);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, dueDate: due, meta, userId }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      onSaved({
        title: t,
        dueDate: due,
        meta,
        priority: quadrantToPriority(meta.important, meta.urgent),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="hermes-modal-bg" onClick={onClose}>
      <div className="task-edit-modal glass" onClick={(e) => e.stopPropagation()}>
        <button className="hermes-modal-close" onClick={onClose} aria-label="Schließen">
          <X size={16} aria-hidden />
        </button>
        <div className="task-edit-body">
          <div className="task-edit-head">
            {task.identifier && (
              <span className="pill pill-mute mono text-[10px]">{task.identifier}</span>
            )}
            <span className="kanban-meta-label">Task bearbeiten</span>
          </div>
          <textarea
            className="kanban-add-input task-edit-title"
            rows={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel"
            autoFocus
          />
          <div className="kanban-meta-group">
            <span className="kanban-meta-label">Deadline</span>
            <DatePicker value={due} onChange={setDue} placeholder="Datum optional" />
          </div>
          <TaskMetaFields value={meta} onChange={setMeta} projects={projects} />
          {error && <p className="task-edit-error">{error}</p>}
          <div className="task-edit-actions">
            <button type="button" className="task-edit-cancel" onClick={onClose} disabled={busy}>
              Abbrechen
            </button>
            <button
              type="button"
              className="task-edit-save"
              onClick={save}
              disabled={!title.trim() || busy}
            >
              {busy ? 'Speichern …' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
