'use client';

import { useEffect, useState } from 'react';
import type { PlanningData, PlanningItem } from '@/types/exist-planning';
import { formatEur } from '@/lib/finance-format';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

// Monate Aug 2026 – Jul 2027 (12 Einträge, Reihenfolge stabil)
const MONTHS: string[] = [
  '2026-08', '2026-09', '2026-10', '2026-11', '2026-12',
  '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07',
];

const MONTH_LABELS: Record<string, string> = {
  '2026-08': 'Aug 26', '2026-09': 'Sep', '2026-10': 'Okt', '2026-11': 'Nov', '2026-12': 'Dez',
  '2027-01': 'Jan 27', '2027-02': 'Feb', '2027-03': 'Mrz', '2027-04': 'Apr',
  '2027-05': 'Mai', '2027-06': 'Jun', '2027-07': 'Jul',
};

const CATEGORY_LABEL: Record<string, string> = {
  sachmittel: 'Sachmittel',
  coaching: 'Coaching',
};

const CATEGORY_COLOR: Record<string, string> = {
  sachmittel: 'bg-[var(--brand-2)] opacity-80',
  coaching: 'bg-[var(--brand-1)] opacity-80',
};

/** Spaltenindex: 1 = Label, 2..13 = Monate */
function monthColIdx(month: string): number {
  return MONTHS.indexOf(month) + 2;
}

/** Berechnet amount pro Monat. Einmalposten: ganzer Betrag. Block: gleichmäßig. */
function perMonthAmount(item: PlanningItem): number {
  if (item.start === item.end) return item.amount_eur_total;
  const [sy, sm] = item.start.split('-').map(Number);
  const [ey, em] = item.end.split('-').map(Number);
  const count = (ey - sy) * 12 + (em - sm) + 1;
  return item.amount_eur_total / count;
}

function PlanBar({ item }: { item: PlanningItem }) {
  const colStart = monthColIdx(item.start);
  const colEnd = monthColIdx(item.end) + 1;
  // skip items fully outside our month range
  if (colStart < 2 || colEnd <= 2) return null;

  const isRecurring = item.start !== item.end;
  const perMonth = perMonthAmount(item);

  return (
    <div className="contents" role="row" aria-label={`${item.name}: ${formatEur(item.amount_eur_total)}`}>
      {/* Label */}
      <div
        className="flex items-center gap-2 py-1 text-[11.5px] text-[var(--ink-2)]"
        style={{ gridColumn: '1' }}
      >
        <span className="truncate">{item.name}</span>
        <span className="ml-auto shrink-0 font-[var(--mono)] text-[10px] text-[var(--ink-3)]">
          {formatEur(item.amount_eur_total)}
        </span>
      </div>

      {/* Bar */}
      <div
        className={`mx-0.5 my-0.5 flex items-center rounded-[6px] px-2 py-1 ${CATEGORY_COLOR[item.category]}`}
        style={{ gridColumn: `${colStart} / ${colEnd}` }}
        aria-hidden
      >
        {isRecurring && (
          <span className="font-[var(--mono)] text-[9.5px] text-white/70">
            {formatEur(perMonth)}/Mon.
          </span>
        )}
      </div>
    </div>
  );
}

function CategorySection({ label, items }: { label: string; items: PlanningItem[] }) {
  return (
    <>
      <div
        className="flex items-center gap-2 border-t border-[var(--line-1)] pb-1 pt-3"
        style={{ gridColumn: '1 / -1' }}
      >
        <span className="font-[var(--mono)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          {label}
        </span>
      </div>
      {items.map((item) => (
        <PlanBar key={item.id} item={item} />
      ))}
    </>
  );
}

export function ExistPlanningTimeline() {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/finance/planning', {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: 'no-store',
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PlanningData>;
      })
      .then((payload) => { if (!cancelled) { setData(payload); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Fehler'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <p className="py-6 text-[13px] text-[var(--ink-3)]">Lade Planung …</p>;
  }
  if (error || !data) {
    return (
      <p className="py-6 text-[13px] text-[var(--danger)]">
        Planung nicht verfügbar: {error ?? 'Unbekannter Fehler'}
      </p>
    );
  }

  const sachmittelItems = data.items.filter((i) => i.category === 'sachmittel');
  const coachingItems = data.items.filter((i) => i.category === 'coaching');

  return (
    <section className="company-section" aria-label="EXIST Planungsübersicht">
      <h2 className="company-section-title">Planung Aug 2026 – Jul 2027</h2>
      <p className="company-section-sub">
        Geplante EXIST-Ausgaben nach Monat — read-only
      </p>

      {/* Legende */}
      <div className="mb-4 flex flex-wrap items-center gap-4 font-[var(--mono)] text-[11px] text-[var(--ink-3)]">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[var(--brand-2)] opacity-80" />
          Sachmittel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm bg-[var(--brand-1)] opacity-80" />
          Coaching
        </span>
      </div>

      {/* Timeline Grid: 1 Label-Spalte + 12 Monats-Spalten */}
      <div
        className="overflow-x-auto rounded-[14px] border border-[var(--line-1)] bg-white/[0.02] p-3"
        role="grid"
        aria-label="Planungs-Timeline"
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(160px, 220px) repeat(12, 1fr)',
            gap: '0 2px',
            minWidth: '700px',
          }}
        >
          {/* Monats-Header */}
          <div style={{ gridColumn: '1' }} className="py-1" />
          {MONTHS.map((m, idx) => (
            <div
              key={m}
              style={{ gridColumn: `${idx + 2}` }}
              className="py-1 text-center font-[var(--mono)] text-[10px] font-semibold text-[var(--ink-3)]"
            >
              {MONTH_LABELS[m]}
            </div>
          ))}

          <CategorySection label={CATEGORY_LABEL.sachmittel} items={sachmittelItems} />
          <CategorySection label={CATEGORY_LABEL.coaching} items={coachingItems} />
        </div>
      </div>
    </section>
  );
}
