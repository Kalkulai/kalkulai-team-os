'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Minus } from 'lucide-react';
import type { KpiWithWeek } from '@/types';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

function barClass(pct: number): string {
  if (pct >= 100) return 'bar ok';
  return 'bar';
}

function strokeTone(pct: number): string {
  if (pct >= 100) return 'var(--ok)';
  return 'var(--brand)';
}

function sparkPath(pct: number): string {
  const yEnd = Math.max(3, Math.min(21, 21 - (pct / 100) * 18));
  const yMid = yEnd + (21 - yEnd) * 0.55;
  return `M2,21 L26,${yMid} L50,${yEnd + 3} L78,${yEnd}`;
}

/**
 * Build SVG polyline from real daily history. y is normalised against the
 * higher of `target` or `max(history)` so a series exceeding target still
 * stays inside the 24px SVG canvas.
 */
function sparkPathFromHistory(history: number[], target: number): string {
  const max = Math.max(target, ...history, 1);
  const n = history.length;
  if (n < 2) return `M2,21 L78,21`;
  const xStart = 2;
  const xEnd = 78;
  const step = (xEnd - xStart) / (n - 1);
  const points = history.map((v, i) => {
    const x = xStart + step * i;
    const y = Math.max(3, 21 - (v / max) * 18);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${points.join(' L')}`;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  async function adjust(id: string, delta: number) {
    setBusy((prev) => new Set(prev).add(id));
    setKpis((prev) =>
      prev ? prev.map((k) => (k.id === id ? { ...k, actual: Math.max(0, k.actual + delta) } : k)) : prev,
    );
    try {
      await fetch(`/api/kpis/${id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ delta }),
      });
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (kpis === null) return <p className="text-[13px] text-[var(--ink-3)]">Lade KPIs…</p>;

  if (kpis.length === 0) {
    return (
      <p className="text-[13px] text-[var(--ink-3)]">
        Noch keine KPIs angelegt. Geh zu{' '}
        <a href="/settings" className="text-[var(--ink-1)] underline underline-offset-2">
          Einstellungen
        </a>{' '}
        und leg deine ersten an.
      </p>
    );
  }

  return (
    <ul>
      {kpis.map((k) => {
        const pct = k.target > 0 ? Math.min(Math.round((k.actual / k.target) * 100), 100) : 0;
        const isBusy = busy.has(k.id);
        const stroke = strokeTone(pct);
        return (
          <li key={k.id} className="kpi">
            <div className="kpi-row">
              <span className="kpi-name">
                {k.name}
                {k.unit && <span className="text-[12px] text-[var(--ink-3)]">· {k.unit}</span>}
                <span className="pill pill-blue">Manual</span>
              </span>
              <span className="kpi-actions">
                <button
                  type="button"
                  onClick={() => adjust(k.id, -1)}
                  disabled={isBusy || k.actual === 0}
                  aria-label="Eins weniger"
                  className="btn-step"
                >
                  <Minus size={12} aria-hidden />
                </button>
                <span className="kpi-num">
                  <span className="v">{k.actual}</span>
                  <span className="t">/ {k.target || '∞'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => adjust(k.id, +1)}
                  disabled={isBusy}
                  aria-label="Eins mehr"
                  className="btn-step pri"
                >
                  <Plus size={12} aria-hidden />
                </button>
              </span>
            </div>
            <div className="kpi-bar">
              <div className={barClass(pct)}>
                <i
                  ref={(el) => {
                    if (el) el.style.width = `${pct}%`;
                  }}
                />
              </div>
              <svg className="spark" width="74" height="20" viewBox="0 0 80 24" aria-hidden>
                <path
                  d={
                    k.history && k.history.length >= 2
                      ? sparkPathFromHistory(k.history, k.target)
                      : sparkPath(pct)
                  }
                  fill="none"
                  stroke={stroke}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
