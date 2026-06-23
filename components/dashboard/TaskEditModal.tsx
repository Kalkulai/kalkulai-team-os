'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus } from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { TaskMetaFields } from './TaskMetaFields';
import type { UnifiedTask } from '@/lib/unified-tasks';
import type { TaskSubtask } from '@/types';
import { EMPTY_TASK_META, quadrantToPriority, type TaskMeta } from '@/lib/task-meta';
import { hasAssist, type TaskFollowup } from '@/lib/task-assist';
import { uploadTaskImages } from '@/lib/task-images-client';
import { TaskImagePicker } from './TaskImagePicker';

function proxiedImageSrc(url: string): string {
  return `/api/tasks/image?url=${encodeURIComponent(url)}`;
}

/** Click-to-edit modal for a Kanban card (Felix-only). Edits title, deadline and
 * planning metadata; shows Kai's suggestions (next step + follow-up tasks) with
 * one-click accept. Delete archives the Linear issue. */
export function TaskEditModal({
  task,
  projects,
  userId,
  onClose,
  onSaved,
  onDeleted,
  onFollowupAccepted,
}: {
  task: UnifiedTask;
  projects: Array<{ id: string; name: string }>;
  userId: string | null;
  onClose: () => void;
  onSaved: (patch: { title: string; dueDate: string | null; meta: TaskMeta; priority: number; imageUrls: string[] }) => void;
  onDeleted: () => void;
  onFollowupAccepted: (created: UnifiedTask) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState<string | null>(task.dueDate ?? null);
  const [meta, setMeta] = useState<TaskMeta>(task.meta ?? EMPTY_TASK_META);
  const [imageUrls, setImageUrls] = useState(task.imageUrls ?? []);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [followups, setFollowups] = useState<TaskFollowup[]>(
    task.assist?.suggestedFollowups ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFollowup, setPendingFollowup] = useState<number | null>(null);
  const [subtasks, setSubtasks] = useState<TaskSubtask[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/tasks/${encodeURIComponent(task.id)}/subtasks`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: TaskSubtask[]) => setSubtasks(data))
      .catch(() => {});
  }, [task.id]);

  const nextStep = task.assist?.suggestedNextStep ?? null;
  const showKai = hasAssist(task.assist) || followups.length > 0;

  async function persistFollowups(remaining: TaskFollowup[]) {
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}/assist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, nextStep, followups: remaining }),
    }).catch(() => {});
  }

  async function acceptFollowup(idx: number) {
    if (pendingFollowup !== null) return;
    const f = followups[idx];
    setPendingFollowup(idx);
    setError(null);
    try {
      const fMeta: TaskMeta = {
        ...EMPTY_TASK_META,
        context: f.context ?? null,
        energy: f.energy ?? null,
        effortMinutes: f.effortMinutes ?? null,
      };
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: f.title, userId, source: 'linear', meta: fMeta }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const created = (await res.json().catch(() => null)) as
        | { id?: string; identifier?: string; url?: string }
        | null;
      if (created?.id) {
        onFollowupAccepted({
          id: created.id,
          kind: 'linear',
          title: f.title,
          status: 'todo',
          dueDate: null,
          identifier: created.identifier,
          url: created.url,
          source: 'linear',
          project: null,
          meta: fMeta,
        });
      }
      const remaining = followups.filter((_, i) => i !== idx);
      setFollowups(remaining);
      await persistFollowups(remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPendingFollowup(null);
    }
  }

  async function dismissFollowup(idx: number) {
    const remaining = followups.filter((_, i) => i !== idx);
    setFollowups(remaining);
    await persistFollowups(remaining);
  }

  async function addSubtask() {
    const t = newSubtask.trim();
    if (!t) return;
    setNewSubtask('');
    const optimisticId = `tmp-${Date.now()}`;
    const optimistic: TaskSubtask = {
      id: optimisticId,
      linearIssueId: task.id,
      title: t,
      completed: false,
      position: subtasks.length,
      createdAt: new Date().toISOString(),
    };
    setSubtasks((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/subtasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t }),
      });
      if (res.ok) {
        const created: TaskSubtask = await res.json();
        setSubtasks((prev) => prev.map((s) => (s.id === optimisticId ? created : s)));
      } else {
        setSubtasks((prev) => prev.filter((s) => s.id !== optimisticId));
      }
    } catch {
      setSubtasks((prev) => prev.filter((s) => s.id !== optimisticId));
    }
  }

  async function toggleSubtask(sub: TaskSubtask) {
    const next = !sub.completed;
    setSubtasks((prev) => prev.map((s) => (s.id === sub.id ? { ...s, completed: next } : s)));
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}/subtasks/${encodeURIComponent(sub.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: next }),
    }).catch(() => {});
  }

  async function removeSubtask(sub: TaskSubtask) {
    setSubtasks((prev) => prev.filter((s) => s.id !== sub.id));
    await fetch(`/api/tasks/${encodeURIComponent(task.id)}/subtasks/${encodeURIComponent(sub.id)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }

  async function save() {
    const t = title.trim();
    if (!t || busy || deleting) return;
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
      let nextImageUrls = imageUrls;
      if (imageFiles.length > 0) {
        const uploaded = await uploadTaskImages(task.id, imageFiles);
        nextImageUrls = [...imageUrls, ...uploaded];
        setImageUrls(nextImageUrls);
        setImageFiles([]);
      }
      onSaved({ title: t, dueDate: due, meta, priority: quadrantToPriority(meta.important, meta.urgent), imageUrls: nextImageUrls });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (busy || deleting) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
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
          <div className="kanban-meta-group">
            <span className="kanban-meta-label">Bilder</span>
            <div className="task-images">
              {imageUrls.length > 0 && (
                <div className="task-image-grid" aria-label="Task-Bilder">
                  {imageUrls.map((url) => (
                    <a key={url} href={proxiedImageSrc(url)} target="_blank" rel="noreferrer" className="task-image-thumb">
                      <img src={proxiedImageSrc(url)} alt="Task-Anhang" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              <TaskImagePicker files={imageFiles} onChange={setImageFiles} disabled={busy || deleting} />
            </div>
          </div>
          <TaskMetaFields value={meta} onChange={setMeta} projects={projects} />


          <div className="kanban-meta-group">
            <span className="kanban-meta-label">Subtasks</span>
            <div className="task-subtasks">
              {subtasks.map((sub) => (
                <div key={sub.id} className="task-subtask-row">
                  <button
                    type="button"
                    className={`task-subtask-check${sub.completed ? " is-done" : ""}`}
                    onClick={() => toggleSubtask(sub)}
                    aria-label={sub.completed ? "Als offen markieren" : "Als erledigt markieren"}
                  >
                    {sub.completed ? "☑" : "☐"}
                  </button>
                  <span className={`task-subtask-title${sub.completed ? " is-done" : ""}`}>
                    {sub.title}
                  </span>
                  <button
                    type="button"
                    className="task-subtask-delete"
                    onClick={() => removeSubtask(sub)}
                    aria-label="Löschen"
                  >
                    <X size={11} aria-hidden />
                  </button>
                </div>
              ))}
              <div className="task-subtask-add">
                <input
                  ref={subtaskInputRef}
                  className="task-subtask-input"
                  placeholder="Subtask hinzufügen …"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSubtask(); } }}
                />
                <button
                  type="button"
                  className="task-subtask-add-btn"
                  onClick={addSubtask}
                  disabled={!newSubtask.trim()}
                  aria-label="Subtask hinzufügen"
                >
                  <Plus size={12} aria-hidden />
                </button>
              </div>
            </div>
          </div>

          {showKai && (
            <div className="task-kai">
              <div className="task-kai-head">💡 Kai</div>
              {nextStep && <p className="task-kai-next">{nextStep}</p>}
              {followups.length > 0 && (
                <>
                  <span className="kanban-meta-label">Folgetasks</span>
                  <div className="task-kai-followups">
                    {followups.map((f, i) => (
                      <div key={i} className="task-kai-followup">
                        <div className="task-kai-followup-text">
                          <span className="task-kai-followup-title">{f.title}</span>
                          {f.note && <span className="task-kai-followup-note">{f.note}</span>}
                        </div>
                        <div className="task-kai-followup-actions">
                          <button
                            type="button"
                            className="task-kai-accept"
                            onClick={() => acceptFollowup(i)}
                            disabled={pendingFollowup !== null}
                            title="Als Task übernehmen"
                          >
                            <Plus size={12} aria-hidden /> Übernehmen
                          </button>
                          <button
                            type="button"
                            className="task-kai-dismiss"
                            onClick={() => dismissFollowup(i)}
                            disabled={pendingFollowup !== null}
                            title="Verwerfen"
                          >
                            <X size={12} aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="task-edit-error">{error}</p>}
          <div className="task-edit-actions">
            <button
              type="button"
              className={`task-edit-delete${confirmDelete ? ' is-confirm' : ''}`}
              onClick={del}
              disabled={busy || deleting}
              title="Task archivieren"
            >
              <Trash2 size={13} aria-hidden />
              {deleting ? 'Lösche …' : confirmDelete ? 'Wirklich löschen?' : 'Löschen'}
            </button>
            <span className="task-edit-spacer" />
            <button type="button" className="task-edit-cancel" onClick={onClose} disabled={busy || deleting}>
              Abbrechen
            </button>
            <button
              type="button"
              className="task-edit-save"
              onClick={save}
              disabled={!title.trim() || busy || deleting}
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
