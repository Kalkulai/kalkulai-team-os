'use client';

import type { FinanceData } from '@/types/finance';
import { formatEur, formatEurDelta } from '@/lib/finance-format';
import { KPICard } from './KPICard';
import { TrafficLight } from './TrafficLight';
import { CostBarChart, ForecastLineChart, PaidByPieChart } from './FinanceCharts';

function runwayTone(months: number): 'ok' | 'warn' | 'bad' {
  if (months >= 9) return 'ok';
  if (months >= 5) return 'warn';
  return 'bad';
}

export function FinanceSection({
  data,
  loading,
  error,
}: {
  data: FinanceData | null;
  loading: boolean;
  error: string | null;
}) {
  const maxForecastBurn = data ? Math.max(...data.forecast_6m.map((p) => p.burn_eur)) : 0;

  return (
    <section className="company-section">
      <h2 className="company-section-title">Finanzen — CFO-Kai</h2>
      <p className="company-section-sub">
        Runway, Burn, Kostenstruktur und Pilot-Funnel auf einen Blick.
        {data && <span className="fin-asof"> · {data.as_of}</span>}
      </p>

      {loading && <p className="text-[13px] text-[var(--ink-3)]">Lade Finanzdaten …</p>}

      {!loading && error && (
        <div className="company-pilot-empty glass">Finanzdaten konnten nicht geladen werden: {error}</div>
      )}

      {!loading && !error && data && (
        <div className="fin-grid">
          {/* KPI row */}
          <div className="fin-kpi-row">
            <KPICard
              label="Förderlaufzeit"
              value={data.runway_months.toFixed(0)}
              unit="Monate"
              tone={runwayTone(data.runway_months)}
              sub="EXIST-gefördert bis Jul 2027"
            />
            <KPICard
              label="Monthly Burn"
              value={formatEur(data.monthly_burn.actual_eur)}
              tone="default"
              sub={
                data.monthly_burn.delta_eur === 0
                  ? `Betriebskosten M1 · wächst auf ${formatEur(maxForecastBurn)}`
                  : (
                    <>
                      Plan {formatEur(data.monthly_burn.plan_eur)} ·{' '}
                      <span className={data.monthly_burn.delta_eur > 0 ? 'fin-delta is-bad' : 'fin-delta is-ok'}>
                        {formatEurDelta(data.monthly_burn.delta_eur)}
                      </span>
                    </>
                  )
              }
            />
            <KPICard
              label="EXIST-Förderung"
              value={formatEur(data.cash_on_hand_eur)}
              tone="default"
              sub="Zuwendung Jahr 1 · 133k € gesamt"
            />
            <KPICard
              label="Break-Even"
              value={data.break_even_label}
              tone="ok"
              sub="nur Business · ohne Förderung"
            />
          </div>

          {/* Chart row: costs + paid-by */}
          <div className="fin-chart-row">
            <article className="fin-card glass">
              <div className="fin-card-head">
                <h3 className="fin-card-title">Top-Kosten / Monat</h3>
                <span className="fin-card-legend">
                  <span className="fin-legend-dot is-fixed" aria-hidden /> fix
                  <span className="fin-legend-dot is-var" aria-hidden /> variabel
                </span>
              </div>
              <CostBarChart data={data.cost_lines} />
              <ul className="fin-cost-notes">
                {data.cost_lines.map((line) => (
                  <li key={line.label} className="fin-cost-note">
                    <span className="fin-cost-note-label">
                      {line.label}
                      {line.fixed && <span className="fin-cost-fixed-tag">fix</span>}
                    </span>
                    <span className="fin-cost-note-amount">{formatEur(line.amount_eur)}</span>
                    {line.note && <span className="fin-cost-note-text">{line.note}</span>}
                  </li>
                ))}
              </ul>
            </article>

            <article className="fin-card glass">
              <div className="fin-card-head">
                <h3 className="fin-card-title">Paid-By</h3>
              </div>
              <PaidByPieChart data={data.paid_by} />
              <ul className="fin-paidby-legend">
                {data.paid_by.map((slice) => (
                  <li key={slice.name} className="fin-paidby-row">
                    <span className="fin-paidby-name">{slice.name}</span>
                    <span className="fin-paidby-amount">{formatEur(slice.value_eur)}</span>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          {/* Forecast */}
          <article className="fin-card glass">
            <div className="fin-card-head">
              <h3 className="fin-card-title">6-Monats-Forecast</h3>
              <span className="fin-card-legend">
                <span className="fin-legend-dot is-cash" aria-hidden /> Cash
                <span className="fin-legend-dot is-burn" aria-hidden /> Burn
              </span>
            </div>
            <ForecastLineChart data={data.forecast_6m} />
          </article>

          {/* Pilot health + ampeln */}
          <article className="fin-card glass">
            <div className="fin-card-head">
              <h3 className="fin-card-title">Pilot Health</h3>
            </div>
            <ul className="fin-pilot-health">
              {data.pilot_health.map((row) => (
                <li key={row.name} className={`fin-pilot-row is-${row.status}`}>
                  <TrafficLight status={row.status} showLabel={false} />
                  <div className="fin-pilot-info">
                    <span className="fin-pilot-name">{row.name}</span>
                    <span className="fin-pilot-note">{row.note}</span>
                  </div>
                  <TrafficLight status={row.status} />
                </li>
              ))}
            </ul>
          </article>
        </div>
      )}
    </section>
  );
}
