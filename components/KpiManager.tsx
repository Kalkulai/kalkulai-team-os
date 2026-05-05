'use client';
import { useEffect, useState, useCallback } from 'react';
import type { KpiWithWeek } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

export function KpiManager({ userId }: { userId: string }) {
  const [kpis, setKpis] = useState<KpiWithWeek[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', unit: '', target: '' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Record<string, { name: string; unit: string; target: string }>>({});

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/kpis?userId=${encodeURIComponent(userId)}`, {
        headers: { Authorization: `Bearer ${SECRET}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Laden fehlgeschlagen');
      setKpis((await res.json()) as KpiWithWeek[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
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
      const res = await fetch('/api/kpis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({
          user_id: userId,
          name: draft.name.trim(),
          unit: draft.unit.trim(),
          target: Number.isFinite(target) && target > 0 ? target : 0,
        }),
      });
      if (!res.ok) throw new Error('Anlegen fehlgeschlagen');
      setDraft({ name: '', unit: '', target: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveRow(id: string) {
    const e = editing[id];
    if (!e) return;
    setError(null);
    try {
      const target = Number(e.target);
      const res = await fetch(`/api/kpis/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({
          name: e.name.trim(),
          unit: e.unit.trim(),
          target: Number.isFinite(target) && target >= 0 ? target : 0,
        }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');
      setEditing((prev) => { const next = { ...prev }; delete next[id]; return next; });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('KPI wirklich löschen?')) return;
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
      [k.id]: { name: k.name, unit: k.unit, target: String(k.target) },
    }));
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-foreground/[0.06] bg-card/40 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Neuen KPI anlegen</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="kpi-name" className="text-xs">Name</Label>
            <Input
              id="kpi-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="z.B. Sales Calls"
              className="min-h-[44px]"
              required
            />
          </div>
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
        </div>
        <Button type="submit" disabled={creating || !draft.name.trim()} className="min-h-[44px] w-full sm:w-auto">
          {creating ? 'Wird angelegt…' : 'KPI hinzufügen'}
        </Button>
      </form>

      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {loading && kpis === null && <p className="text-sm text-muted-foreground">Lädt…</p>}

      {kpis && kpis.length === 0 && (
        <p className="text-sm text-muted-foreground">Noch keine KPIs für diese Person.</p>
      )}

      {kpis && kpis.length > 0 && (
        <ul className="space-y-2">
          {kpis.map((k) => {
            const e = editing[k.id];
            const isEditing = Boolean(e);
            return (
              <li key={k.id} className="rounded-xl border border-foreground/[0.06] bg-card/40 p-4">
                {isEditing ? (
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
                      <Button onClick={() => void handleSaveRow(k.id)} className="min-h-[44px]">Speichern</Button>
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
      )}
    </div>
  );
}
