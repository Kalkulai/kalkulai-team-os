'use client';
import { useEffect, useState, useCallback } from 'react';
import type { KpiWithWeek } from '@/types';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

function toneFor(pct: number) {
  if (pct >= 100) return { text: 'text-emerald-600 dark:text-emerald-400', bar: 'from-emerald-500 to-emerald-400' };
  if (pct >= 60) return { text: 'text-amber-600 dark:text-amber-400', bar: 'from-amber-500 to-amber-400' };
  return { text: 'text-rose-600 dark:text-rose-400', bar: 'from-rose-500 to-rose-400' };
}

export function KpiTracker({ userId }: { userId: string }) {
  const [kpis, setKpis] = useState<KpiWithWeek[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch(`/api/kpis?userId=${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = (await res.json()) as KpiWithWeek[];
    setKpis(data.filter((k) => k.type === 'counter'));
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function adjust(id: string, delta: number) {
    setBusy((prev) => new Set(prev).add(id));
    setKpis((prev) =>
      prev
        ? prev.map((k) =>
            k.id === id ? { ...k, actual: Math.max(0, k.actual + delta) } : k
          )
        : prev
    );
    try {
      await fetch(`/api/kpis/${id}/adjust`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SECRET}`,
        },
        body: JSON.stringify({ delta }),
      });
    } finally {
      setBusy((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  }

  if (kpis === null) return <p className="text-sm text-muted-foreground">Lade KPIs…</p>;

  if (kpis.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Noch keine KPIs angelegt. Geh zu{' '}
        <a href="/settings" className="text-foreground underline underline-offset-2">
          Einstellungen
        </a>{' '}
        und leg deine ersten an.
      </p>
    );
  }

  return (
    <ul className="space-y-5">
      {kpis.map((k) => {
        const pct = k.target > 0 ? Math.min(Math.round((k.actual / k.target) * 100), 100) : 0;
        const tone = toneFor(pct);
        const isBusy = busy.has(k.id);
        return (
          <li key={k.id} className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {k.name}
                {k.unit && <span className="ml-1 text-muted-foreground/60">· {k.unit}</span>}
              </span>
              <span className={`text-xs tabular-nums ${tone.text}`}>{pct}%</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => adjust(k.id, -1)}
                disabled={isBusy || k.actual === 0}
                aria-label="Eins weniger"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-foreground/[0.08] bg-card/60 text-base backdrop-blur-md transition-colors hover:border-foreground/[0.2] hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
              <div className="flex-1 space-y-1">
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>{k.actual}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">/ {k.target || '∞'}</span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-foreground/[0.08]">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${tone.bar} transition-[width] duration-500 ease-out`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => adjust(k.id, +1)}
                disabled={isBusy}
                aria-label="Eins mehr"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-foreground/[0.08] bg-foreground text-base font-medium text-background backdrop-blur-md transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
              >
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
