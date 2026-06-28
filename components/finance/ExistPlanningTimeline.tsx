'use client';

import { useEffect, useState } from 'react';
import type { PlanningData, PlanningItem } from '@/types/exist-planning';
import { formatEur } from '@/lib/finance-format';
import { KPICard } from './KPICard';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate array of 'YYYY-MM' strings from funding_start to funding_end (inclusive). */
function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/**
 * Human-readable month label.
 * First month of range or January → 'Aug 26', 'Jan 27'; rest → 'Sep', 'Okt', ...
 */
function monthLabel(m: string, firstMonth: string): string {
  const [y, mo] = m.split('-').map(Number);
  const NAMES = ['Jan', 'Feb', 'Mrz', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const name = NAMES[mo - 1];
  if (m === firstMonth || mo === 1) return `${name} ${String(y).slice(2)}`;
  return name;
}

/** Amount attributed to a single month for a given item. */
function perMonthAmt(item: PlanningItem, months: string[]): number {
  if (item.start === item.end) return item.amount_eur_total;
  const count = months.filter((m) => m >= item.start && m <= item.end).length;
  return count > 0 ? item.amount_eur_total / count : 0;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function GroupHead({ label, count, total }: { label: string; count: number; total: number }) {
  return (
    <div className="ep-group-head">
      <span className="ep-group-label">{label}</span>
      <span className="ep-group-count">{count} Posten</span>
      <span className="ep-group-total">{formatEur(total)}</span>
    </div>
  );
}

function ItemRow({ item }: { item: PlanningItem }) {
  const isEinmalig = item.start === item.end;
  return (
    <div className="ep-row">
      <span className="ep-row-dot" data-cat={item.category} data-einm={isEinmalig ? 'true' : undefined} />
      <span className="ep-row-name">{item.name}</span>
      {item.description && <span className="ep-row-desc">{item.description}</span>}
      <span className="ep-row-tag">{isEinmalig ? 'Einmalig' : `${item.start} – ${item.end}`}</span>
      <span className="ep-row-amt">{formatEur(item.amount_eur_total)}</span>
    </div>
  );
}

function CategoryGroupedList({
  category,
  pill,
  desc,
  items,
}: {
  category: string;
  pill: string;
  desc: string;
  items: PlanningItem[];
}) {
  const laufend = items.filter((i) => i.start !== i.end);
  const einmalig = items.filter((i) => i.start === i.end);
  const total = items.reduce((s, i) => s + i.amount_eur_total, 0);
  const laufendTotal = laufend.reduce((s, i) => s + i.amount_eur_total, 0);
  const einmaligTotal = einmalig.reduce((s, i) => s + i.amount_eur_total, 0);

  return (
    <article className="ep-section">
      <div className="ep-section-head">
        <span className={`ep-section-pill ${category === 'sachmittel' ? 'sach' : 'coach'}`}>{pill}</span>
        <span className="ep-section-desc">{desc}</span>
        <span className="ep-section-total">{formatEur(total)}</span>
      </div>

      {laufend.length > 0 && (
        <div className="ep-group">
          <GroupHead label="Laufend" count={laufend.length} total={laufendTotal} />
          {laufend.map((item) => <ItemRow key={item.id} item={item} />)}
        </div>
      )}

      {einmalig.length > 0 && (
        <div className="ep-group">
          <GroupHead label="Einmalig" count={einmalig.length} total={einmaligTotal} />
          {einmalig.map((item) => <ItemRow key={item.id} item={item} />)}
        </div>
      )}
    </article>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ExistPlanningTimeline() {
  const [data, setData] = useState<PlanningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tlOpen, setTlOpen] = useState(true);
  const [calOpen, setCalOpen] = useState(true);

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

  const months = monthsBetween(data.funding_start, data.funding_end);
  const firstMonth = months[0] ?? data.funding_start;

  const sachItems = data.items.filter((i) => i.category === 'sachmittel');
  const coachItems = data.items.filter((i) => i.category === 'coaching');

  const sachTotal = sachItems.reduce((s, i) => s + i.amount_eur_total, 0);
  const coachTotal = coachItems.reduce((s, i) => s + i.amount_eur_total, 0);
  const grandTotal = sachTotal + coachTotal;

  const laufendeItems = data.items.filter((i) => i.start !== i.end);
  const laufendeSum = laufendeItems.reduce((s, i) => s + i.amount_eur_total, 0);
  const avgPerMonth = laufendeSum / 12;

  // Per-month column sums (for timeline sum row and calendar)
  const monthTotals: Record<string, number> = {};
  const monthSachTotals: Record<string, number> = {};
  const monthCoachTotals: Record<string, number> = {};
  for (const m of months) {
    let total = 0;
    let sach = 0;
    let coach = 0;
    for (const item of data.items) {
      if (m >= item.start && m <= item.end) {
        const amt = perMonthAmt(item, months);
        total += amt;
        if (item.category === 'sachmittel') sach += amt;
        else coach += amt;
      }
    }
    monthTotals[m] = total;
    monthSachTotals[m] = sach;
    monthCoachTotals[m] = coach;
  }

  // All items ordered sachmittel-first for calendar display
  const allItemsOrdered: PlanningItem[] = [...sachItems, ...coachItems];

  return (
    <section className="company-section" aria-label="EXIST Planungsübersicht">

      {/* 1. Section header */}
      <h2 className="company-section-title">Planung Aug 2026 – Jul 2027</h2>
      <p className="company-section-sub">Geplante EXIST-Ausgaben — read-only</p>

      {/* 2. Legend row */}
      <div className="mb-4 flex flex-wrap items-center gap-4 font-[var(--mono)] text-[11px] text-[var(--ink-3)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--brand)] opacity-80" />
          Sachmittel
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--brand-2)] opacity-80" />
          Coaching
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--brand-3)] opacity-85" />
          Einmalig
        </span>
      </div>

      {/* 3. KPI strip */}
      <div className="fin-kpi-row">
        <KPICard
          label="Gesamt-Budget"
          value={formatEur(grandTotal)}
          sub={`${data.funding_start} – ${data.funding_end}`}
          tone="default"
        />
        <KPICard
          label="Sachmittel"
          value={formatEur(sachTotal)}
          sub={`${sachItems.length} Posten`}
          tone="default"
        />
        <KPICard
          label="Coaching"
          value={formatEur(coachTotal)}
          sub={`${coachItems.length} Maßnahmen`}
          tone="default"
        />
        <KPICard
          label="Ø / Monat"
          value={formatEur(avgPerMonth)}
          sub="laufende Kosten"
          tone="default"
        />
      </div>

      {/* 4. Sachmittel grouped list */}
      <CategoryGroupedList
        category="sachmittel"
        pill="Sachmittel"
        desc="Material, Software, Infrastruktur"
        items={sachItems}
      />

      {/* 5. Coaching grouped list */}
      <CategoryGroupedList
        category="coaching"
        pill="Coaching"
        desc="Beratung, Qualifizierung, Mentoring"
        items={coachItems}
      />

      {/* 6. Timeline (collapsible) */}
      <div className="ep-collapsible">
        <button
          className={`ep-sec-toggle${tlOpen ? ' is-open' : ''}`}
          onClick={() => setTlOpen((v) => !v)}
          type="button"
          aria-expanded={tlOpen}
        >
          <span>Timeline</span>
          <span className="ep-toggle-caret">{tlOpen ? '▲' : '▼'}</span>
        </button>

        {tlOpen && (
          <div className="ep-tl-scroll">
            <div
              className="ep-tl-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(170px,220px) repeat(12, minmax(48px,1fr))',
                minWidth: '720px',
              }}
            >
              {/* Header row */}
              <div className="ep-tl-hdr-label">Posten</div>
              {months.map((m) => (
                <div key={m} className="ep-tl-hdr-month">
                  {monthLabel(m, firstMonth)}
                </div>
              ))}

              {/* Sachmittel separator */}
              <div className="ep-tl-cat-sep" style={{ gridColumn: '1 / -1' }}>
                <span className="ep-section-pill sach">Sachmittel</span>
                <span className="ep-tl-cat-total">{formatEur(sachTotal)}</span>
              </div>

              {/* Sachmittel item rows */}
              {sachItems.map((item) => {
                const isEinmalig = item.start === item.end;
                return (
                  <div key={item.id} style={{ display: 'contents' }}>
                    <div className="ep-tl-row-label">{item.name}</div>
                    {months.map((m) => {
                      const active = m >= item.start && m <= item.end;
                      const barClass = isEinmalig ? 'einm' : 'sach';
                      return (
                        <div key={m} className="ep-tl-cell">
                          {active && <div className={`ep-tl-bar ${barClass}`} />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Coaching separator */}
              <div className="ep-tl-cat-sep" style={{ gridColumn: '1 / -1' }}>
                <span className="ep-section-pill coach">Coaching</span>
                <span className="ep-tl-cat-total">{formatEur(coachTotal)}</span>
              </div>

              {/* Coaching item rows */}
              {coachItems.map((item) => {
                const isEinmalig = item.start === item.end;
                return (
                  <div key={item.id} style={{ display: 'contents' }}>
                    <div className="ep-tl-row-label">{item.name}</div>
                    {months.map((m) => {
                      const active = m >= item.start && m <= item.end;
                      const barClass = isEinmalig ? 'einm' : 'coach';
                      return (
                        <div key={m} className="ep-tl-cell">
                          {active && <div className={`ep-tl-bar ${barClass}`} />}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Budget sum row */}
              <div className="ep-tl-sum-label">Gesamt</div>
              {months.map((m) => {
                const total = monthTotals[m] ?? 0;
                const sach = monthSachTotals[m] ?? 0;
                const coach = monthCoachTotals[m] ?? 0;
                const sachPct = total > 0 ? (sach / total) * 100 : 0;
                const coachPct = total > 0 ? (coach / total) * 100 : 0;
                return (
                  <div key={m} className="ep-tl-sum-cell">
                    {total > 0 && (
                      <>
                        <div className="ep-tl-sum-bar">
                          <div className="ep-tl-sum-seg sach" style={{ width: `${sachPct}%` }} />
                          <div className="ep-tl-sum-seg coach" style={{ width: `${coachPct}%` }} />
                        </div>
                        <span className="ep-tl-sum-amt">{formatEur(total)}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 7. Monatskalender (collapsible) */}
      <div className="ep-collapsible">
        <button
          className={`ep-sec-toggle${calOpen ? ' is-open' : ''}`}
          onClick={() => setCalOpen((v) => !v)}
          type="button"
          aria-expanded={calOpen}
        >
          <span>Monatskalender</span>
          <span className="ep-toggle-caret">{calOpen ? '▲' : '▼'}</span>
        </button>

        {calOpen && (
          <div className="ep-cal-grid">
            {months.map((m) => {
              const total = monthTotals[m] ?? 0;
              const sach = monthSachTotals[m] ?? 0;
              const coach = monthCoachTotals[m] ?? 0;
              const sachPct = total > 0 ? (sach / total) * 100 : 0;
              const coachPct = total > 0 ? (coach / total) * 100 : 0;

              const activeItems = allItemsOrdered.filter((i) => m >= i.start && m <= i.end);
              const shown = activeItems.slice(0, 4);
              const extra = activeItems.length - shown.length;

              return (
                <div key={m} className="ep-cal-month">
                  <div className="ep-cal-label">{monthLabel(m, firstMonth)}</div>
                  <div className="ep-cal-total">{total > 0 ? formatEur(total) : '—'}</div>
                  {total > 0 && (
                    <div className="ep-cal-bar-track">
                      <div className="ep-cal-bar-sach" style={{ width: `${sachPct}%` }} />
                      <div className="ep-cal-bar-coach" style={{ width: `${coachPct}%` }} />
                    </div>
                  )}
                  <ul className="ep-cal-items">
                    {shown.map((item) => (
                      <li key={item.id} className="ep-cal-item" data-cat={item.category}>
                        {item.name}
                      </li>
                    ))}
                    {extra > 0 && (
                      <li className="ep-cal-item-more">+{extra} weitere</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
