'use client';
import { useEffect, useState, useCallback } from 'react';
import type { KpiWithWeek, KpiType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

interface CreateDraft {
  type: KpiType;
  name: string;
  unit: string;
  target: string;
  due_date: string;
}

const EMPTY_DRAFT: CreateDraft = { type: 'counter', name: '', unit: '', target: '', due_date: '' };

export function KpiManager({ userId }: { userId: string }) {
  const [items, setItems] = useState<KpiWithWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<string, { name: string; unit: string; target: string; due_date: string }>>({});
  const [stepDraft, setStepDraft] = useState<Record<string, { name: string; due_date: string }>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/kpis?userId=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${SECRET}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      setItems((await res.json()) as KpiWithWeek[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!draft.name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const target = Number(draft.target);
      const body: Record<string, unknown> = {
        user_id: userId,
        type: draft.type,
        name: draft.name.trim(),
      };
      if (draft.type === 'counter') {
        body.unit = draft.unit.trim();
        body.target = Number.isFinite(target) && target > 0 ? target : 0;
      } else {
        body.due_date = draft.due_date || null;
      }
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Anlegen fehlgeschlagen');
      setDraft({ ...EMPTY_DRAFT, type: draft.type });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setCreating(false);
    }
  }

  async function handleAddStep(projectId: string) {
    const s = stepDraft[projectId];
    if (!s?.name.trim()) return;
    setError(null);
    try {
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({
          user_id: userId,
          type: 'step',
          parent_id: projectId,
          name: s.name.trim(),
          due_date: s.due_date || null,
        }),
      });
      if (!res.ok) throw new Error('Step anlegen fehlgeschlagen');
      setStepDraft((prev) => ({ ...prev, [projectId]: { name: '', due_date: '' } }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    }
  }

  async function handleSaveRow(id: string, type: KpiType) {
    const e = editing[id];
    if (!e) return;
    setError(null);
    try {
      const target = Number(e.target);
      const patch: Record<string, unknown> = { name: e.name.trim() };
      if (type === 'counter') {
        patch.unit = e.unit.trim();
        patch.target = Number.isFinite(target) && target >= 0 ? target : 0;
      } else {
        patch.due_date = e.due_date || null;
      }
      const res = await fetch(`/api/kpis/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      setEditing((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Wirklich löschen?')) return;
    setError(null);
    try {
      const res = await fetch(`/api/kpis/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SECRET}` },
      });
      if (!res.ok) throw new Error('Löschen fehlgeschlagen');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    }
  }

  function startEdit(k: KpiWithWeek) {
    setEditing((prev) => ({
      ...prev,
      [k.id]: {
        name: k.name,
        unit: k.unit,
        target: String(k.target),
        due_date: k.due_date ?? '',
      },
    }));
  }

  const counters = (items ?? []).filter((k) => k.type === 'counter');
  const projects = (items ?? []).filter((k) => k.type === 'project');
  const stepsByParent = new Map<string, KpiWithWeek[]>();
  for (const s of (items ?? []).filter((k) => k.type === 'step')) {
    if (!s.parent_id) continue;
    const arr = stepsByParent.get(s.parent_id) ?? [];
    arr.push(s);
    stepsByParent.set(s.parent_id, arr);
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-foreground/[0.06] bg-card/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neu anlegen</h3>
          <div className="flex gap-1 rounded-lg bg-foreground/[0.05] p-0.5">
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_DRAFT, type: 'counter' })}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                draft.type === 'counter' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Counter
            </button>
            <button
              type="button"
              onClick={() => setDraft({ ...EMPTY_DRAFT, type: 'project' })}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                draft.type === 'project' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Projekt
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kpi-name" className="text-xs">Name</Label>
            <Input
              id="kpi-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={draft.type === 'counter' ? 'z.B. Sales Calls' : 'z.B. Hermes integrieren'}
              className="min-h-[44px]"
              required
            />
          </div>

          {draft.type === 'counter' ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="kpi-unit" className="text-xs">Einheit</Label>
                <Input
                  id="kpi-unit"
                  value={draft.unit}
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  placeholder="z.B. Anrufe"
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kpi-target" className="text-xs">Ziel diese Woche</Label>
                <Input
                  id="kpi-target"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={draft.target}
                  onChange={(e) => setDraft({ ...draft, target: e.target.value })}
                  placeholder="0"
                  className="min-h-[44px]"
                />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="kpi-due" className="text-xs">Fällig (optional)</Label>
              <Input
                id="kpi-due"
                type="date"
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                className="min-h-[44px]"
              />
            </div>
          )}
        </div>
        <Button type="submit" disabled={creating || !draft.name.trim()} className="min-h-[44px] w-full sm:w-auto">
          {creating ? 'Wird angelegt…' : draft.type === 'counter' ? 'Counter hinzufügen' : 'Projekt hinzufügen'}
        </Button>
      </form>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {items === null && <p className="text-sm text-muted-foreground">Lädt…</p>}

      {items && counters.length === 0 && projects.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch nichts angelegt für diese Person.</p>
      )}

      {projects.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projekte</h4>
          <ul className="space-y-2">
            {projects.map((p) => {
              const steps = (stepsByParent.get(p.id) ?? []);
              const sd = stepDraft[p.id] ?? { name: '', due_date: '' };
              const e = editing[p.id];
              return (
                <li key={p.id} className="rounded-xl border border-foreground/[0.06] bg-card/40 p-4">
                  {e ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          value={e.name}
                          onChange={(ev) => setEditing((pp) => ({ ...pp, [p.id]: { ...e, name: ev.target.value } }))}
                          className="min-h-[44px]"
                          placeholder="Name"
                        />
                        <Input
                          type="date"
                          value={e.due_date}
                          onChange={(ev) => setEditing((pp) => ({ ...pp, [p.id]: { ...e, due_date: ev.target.value } }))}
                          className="min-h-[44px]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => void handleSaveRow(p.id, 'project')} className="min-h-[44px]">Speichern</Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditing((pp) => { const n = { ...pp }; delete n[p.id]; return n; })}
                          className="min-h-[44px]"
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {steps.filter((s) => s.completed).length}/{steps.length} Steps
                            {p.due_date && ` · fällig ${p.due_date}`}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="rounded-md px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(p.id)}
                            className="rounded-md px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                          >
                            Löschen
                          </button>
                        </div>
                      </div>

                      {steps.length > 0 && (
                        <ul className="ml-1 space-y-1 border-l border-foreground/[0.08] pl-3">
                          {steps.map((s) => (
                            <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                              <span className="truncate">
                                {s.completed ? '✓ ' : '○ '}
                                {s.name}
                                {s.due_date && <span className="ml-1.5 text-[11px] text-muted-foreground">{s.due_date}</span>}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleDelete(s.id)}
                                className="shrink-0 text-[11px] text-muted-foreground hover:text-rose-600"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}

                      <div className="flex gap-2">
                        <Input
                          value={sd.name}
                          onChange={(ev) => setStepDraft((prev) => ({ ...prev, [p.id]: { ...sd, name: ev.target.value } }))}
                          placeholder="Neuer Step…"
                          className="min-h-[40px] flex-1 text-sm"
                        />
                        <Input
                          type="date"
                          value={sd.due_date}
                          onChange={(ev) => setStepDraft((prev) => ({ ...prev, [p.id]: { ...sd, due_date: ev.target.value } }))}
                          className="min-h-[40px] w-auto text-sm"
                        />
                        <Button
                          type="button"
                          onClick={() => void handleAddStep(p.id)}
                          disabled={!sd.name.trim()}
                          className="min-h-[40px] shrink-0"
                        >
                          + Step
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {counters.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Counter</h4>
          <ul className="space-y-2">
            {counters.map((k) => {
              const e = editing[k.id];
              return (
                <li key={k.id} className="rounded-xl border border-foreground/[0.06] bg-card/40 p-4">
                  {e ? (
                    <div className="space-y-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Input
                          value={e.name}
                          onChange={(ev) => setEditing((p) => ({ ...p, [k.id]: { ...e, name: ev.target.value } }))}
                          className="min-h-[44px] sm:col-span-2"
                          placeholder="Name"
                        />
                        <Input
                          value={e.unit}
                          onChange={(ev) => setEditing((p) => ({ ...p, [k.id]: { ...e, unit: ev.target.value } }))}
                          className="min-h-[44px]"
                          placeholder="Einheit"
                        />
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={e.target}
                          onChange={(ev) => setEditing((p) => ({ ...p, [k.id]: { ...e, target: ev.target.value } }))}
                          className="min-h-[44px]"
                          placeholder="Ziel"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => void handleSaveRow(k.id, 'counter')} className="min-h-[44px]">Speichern</Button>
                        <Button
                          variant="outline"
                          onClick={() => setEditing((p) => { const n = { ...p }; delete n[k.id]; return n; })}
                          className="min-h-[44px]"
                        >
                          Abbrechen
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {k.name}
                          {k.unit && <span className="ml-1.5 text-xs text-muted-foreground">· {k.unit}</span>}
                        </p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {k.actual} / {k.target || '∞'} diese Woche
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(k)}
                          className="rounded-md px-3 py-1.5 text-xs hover:bg-foreground/[0.05]"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(k.id)}
                          className="rounded-md px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
