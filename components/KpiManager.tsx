'use client';
import { useEffect, useState, useCallback } from 'react';
import { Hash, Target, Plus, X } from 'lucide-react';
import type { KpiWithWeek, KpiType, KpiSource, TeamMember } from '@/types';
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
  source: KpiSource;
}

interface DraftStep {
  name: string;
  due_date: string;
}

const EMPTY_DRAFT: CreateDraft = {
  type: 'counter',
  name: '',
  unit: '',
  target: '',
  due_date: '',
  source: 'manual',
};

export function KpiManager({ userId, member }: { userId: string; member?: TeamMember | null }) {
  const [items, setItems] = useState<KpiWithWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CreateDraft>(EMPTY_DRAFT);
  const [draftSteps, setDraftSteps] = useState<DraftStep[]>([]);
  const [pendingStep, setPendingStep] = useState<DraftStep>({ name: '', due_date: '' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<string, { name: string; unit: string; target: string; due_date: string }>>({});
  const [stepDraft, setStepDraft] = useState<Record<string, DraftStep>>({});

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount; no external subscription model available
    void load();
  }, [load]);

  function switchType(type: KpiType) {
    setDraft({ ...EMPTY_DRAFT, type });
    setDraftSteps([]);
    setPendingStep({ name: '', due_date: '' });
  }

  function addPendingStep() {
    const name = pendingStep.name.trim();
    if (!name) return;
    setDraftSteps((prev) => [...prev, { name, due_date: pendingStep.due_date }]);
    setPendingStep({ name: '', due_date: '' });
  }

  function removeDraftStep(idx: number) {
    setDraftSteps((prev) => prev.filter((_, i) => i !== idx));
  }

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
        if (draft.source !== 'manual') body.source = draft.source;
      } else {
        body.due_date = draft.due_date || null;
      }
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Anlegen fehlgeschlagen');

      if (draft.type === 'project') {
        const created = (await res.json()) as { id: string };
        const stepsToCreate = [...draftSteps];
        const tailName = pendingStep.name.trim();
        if (tailName) stepsToCreate.push({ name: tailName, due_date: pendingStep.due_date });
        for (const s of stepsToCreate) {
          await fetch('/api/kpis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
            body: JSON.stringify({
              user_id: userId,
              type: 'step',
              parent_id: created.id,
              name: s.name,
              due_date: s.due_date || null,
            }),
          });
        }
      }

      setDraft({ ...EMPTY_DRAFT, type: draft.type });
      setDraftSteps([]);
      setPendingStep({ name: '', due_date: '' });
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

  const isProject = draft.type === 'project';
  const queuedStepCount = draftSteps.length + (pendingStep.name.trim() ? 1 : 0);
  const submitLabel = creating
    ? 'Wird angelegt…'
    : isProject
      ? queuedStepCount > 0
        ? `Projekt + ${queuedStepCount} ${queuedStepCount === 1 ? 'Step' : 'Steps'} anlegen`
        : 'Projekt anlegen'
      : 'Counter anlegen';

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-foreground/[0.06] bg-card/40 p-4">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neu anlegen</h3>
          <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg bg-foreground/[0.05] p-1">
            <button
              type="button"
              onClick={() => switchType('counter')}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-md text-sm font-medium transition-all ${
                draft.type === 'counter'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-foreground/[0.06]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={draft.type === 'counter'}
            >
              <Hash size={16} aria-hidden />
              Counter & KPI
            </button>
            <button
              type="button"
              onClick={() => switchType('project')}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-md text-sm font-medium transition-all ${
                draft.type === 'project'
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-foreground/[0.06]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={draft.type === 'project'}
            >
              <Target size={16} aria-hidden />
              Projekt & Ziel
            </button>
          </div>
        </div>

        {draft.type === 'counter' && member?.role === 'sales' && member?.hubspot_owner_id && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Tracking-Modus
            </h4>
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg bg-foreground/[0.05] p-1">
              <button
                type="button"
                onClick={() => setDraft({ ...draft, source: 'manual' })}
                className={`flex min-h-[40px] flex-col items-center justify-center rounded-md text-sm font-medium transition-all ${
                  draft.source === 'manual'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-foreground/[0.06]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={draft.source === 'manual'}
              >
                Manuell
                <span className="text-[10px] font-normal text-muted-foreground">+/- im Tracker</span>
              </button>
              <button
                type="button"
                onClick={() => setDraft({
                  ...draft,
                  source: 'hubspot:calls-week',
                  unit: draft.unit.trim() ? draft.unit : 'Anrufe',
                })}
                className={`flex min-h-[40px] flex-col items-center justify-center rounded-md text-sm font-medium transition-all ${
                  draft.source === 'hubspot:calls-week'
                    ? 'bg-background text-foreground shadow-sm ring-1 ring-foreground/[0.06]'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-pressed={draft.source === 'hubspot:calls-week'}
              >
                Automatisch (HubSpot)
                <span className="text-[10px] font-normal text-muted-foreground">Calls diese Woche</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kpi-name" className="text-xs">Name</Label>
            <Input
              id="kpi-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={isProject ? 'z.B. Hermes integrieren' : 'z.B. Sales Calls'}
              className="min-h-[44px]"
              required
            />
          </div>

          {!isProject ? (
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

        {isProject && (
          <div className="space-y-2.5 rounded-lg border border-dashed border-foreground/[0.08] bg-background/40 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Teilschritte
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {draftSteps.length === 0 ? 'optional' : `${draftSteps.length} angelegt`}
              </span>
            </div>

            {draftSteps.length > 0 && (
              <ul className="space-y-1">
                {draftSteps.map((s, i) => (
                  <li
                    key={`${i}-${s.name}`}
                    className="flex items-center gap-2 rounded-md bg-foreground/[0.04] px-2.5 py-1.5 text-sm"
                  >
                    <span className="flex-1 truncate">{s.name}</span>
                    {s.due_date && (
                      <span className="text-[11px] text-muted-foreground">{s.due_date}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeDraftStep(i)}
                      className="rounded-sm p-0.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
                      aria-label="Step entfernen"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <Input
                value={pendingStep.name}
                onChange={(e) => setPendingStep({ ...pendingStep, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addPendingStep();
                  }
                }}
                placeholder="z.B. Brief an Investoren schreiben"
                className="min-h-[40px] flex-1 text-sm"
              />
              <Input
                type="date"
                value={pendingStep.due_date}
                onChange={(e) => setPendingStep({ ...pendingStep, due_date: e.target.value })}
                className="min-h-[40px] w-auto text-sm"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addPendingStep}
                disabled={!pendingStep.name.trim()}
                className="min-h-[40px] shrink-0 gap-1"
              >
                <Plus size={14} aria-hidden />
                Step
              </Button>
            </div>
          </div>
        )}

        <Button type="submit" disabled={creating || !draft.name.trim()} className="min-h-[44px] w-full sm:w-auto">
          {submitLabel}
        </Button>
      </form>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {items === null && <p className="text-sm text-muted-foreground">Lädt…</p>}

      {items && counters.length === 0 && projects.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch nichts angelegt für diese Person.</p>
      )}

      {projects.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projekte & Ziele</h4>
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
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Counter & KPIs</h4>
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
