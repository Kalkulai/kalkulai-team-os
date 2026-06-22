'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExistFinanceData } from '@/types/finance-expense';
import { formatEur } from '@/lib/finance-format';
import { KPICard } from './KPICard';
import { TrafficLight } from './TrafficLight';
import { ExpenseLedger } from './ExpenseLedger';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

interface MemberLite {
  id: string;
  name: string;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

function ampelCopy(status: ExistFinanceData['reimbursements']['ampel']): string {
  switch (status) {
    case 'green':
      return 'Keine kritische Vorstreckung offen';
    case 'yellow':
      return 'Mindestens eine Vorstreckung ist älter als 14 Tage';
    case 'red':
      return 'Mindestens eine Vorstreckung ist älter als 30 Tage';
  }
}

function kpiTone(value: number): 'ok' | 'warn' | 'bad' {
  if (value === 0) return 'ok';
  if (value <= 3) return 'warn';
  return 'bad';
}

function BudgetBar({
  label,
  spent,
  remaining,
  total,
}: {
  label: string;
  spent: number;
  remaining: number;
  total: number;
}) {
  const usedPct = total > 0 ? Math.min(100, Math.max(0, (spent / total) * 100)) : 0;
  const isOver = remaining < 0;

  return (
    <div className="rounded-[14px] border border-[var(--line-1)] bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-[var(--font)] text-[12.5px] font-semibold text-[var(--ink-1)]">{label}</span>
        <span className="font-[var(--mono)] text-[12px] font-semibold text-[var(--ink-1)]">
          {formatEur(spent)} / {formatEur(total)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <div
          className={`h-full rounded-full ${isOver ? 'bg-[var(--danger)]' : 'bg-[var(--brand-2)]'}`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 font-[var(--mono)] text-[11px] text-[var(--ink-3)]">
        <span>verbraucht {usedPct.toFixed(0)}%</span>
        <span className={isOver ? 'text-[var(--danger)]' : 'text-[var(--ok)]'}>
          {isOver ? `${formatEur(Math.abs(remaining))} drüber` : `${formatEur(remaining)} frei`}
        </span>
      </div>
    </div>
  );
}

export function ExistCockpit() {
  const [data, setData] = useState<ExistFinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const lastFetchAtRef = useRef(0);

  const memberNameById = useMemo(() => {
    const byId = new Map<string, string>();
    for (const member of members) byId.set(member.id, member.name);
    return byId;
  }, [members]);

  const resolvePayerName = useCallback(
    (paidBy: string) => memberNameById.get(paidBy) ?? paidBy,
    [memberNameById],
  );

  const fetchExistFinance = useCallback(async (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastFetchAtRef.current < 30_000) return;
    lastFetchAtRef.current = now;

    try {
      const res = await fetch('/api/finance/exist', {
        headers: { Authorization: `Bearer ${SECRET}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as ExistFinanceData;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/members', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : []))
      .then((payload: unknown) => {
        if (cancelled || !Array.isArray(payload)) return;
        const safeMembers = payload
          .filter((member): member is MemberLite => {
            if (typeof member !== 'object' || member === null) return false;
            const maybeMember = member as { id?: unknown; name?: unknown };
            return typeof maybeMember.id === 'string' && typeof maybeMember.name === 'string';
          })
          .map((member) => ({ id: member.id, name: member.name }));
        setMembers(safeMembers);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) void fetchExistFinance(true);
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchExistFinance(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchExistFinance(false);
    }, 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(intervalId);
    };
  }, [fetchExistFinance]);

  const refreshCockpit = useCallback(() => {
    void fetchExistFinance(true);
  }, [fetchExistFinance]);

  return (
    <section className="company-section">
      <h2 className="company-section-title">EXIST / Förderlogik</h2>
      <p className="company-section-sub">
        Operative Vorstreckungen, Topfverbrauch und Ledger-Review aus dem EXIST-Ausgabenbuch.
        {data && <span className="fin-asof"> · {data.as_of}</span>}
      </p>

      {loading && <p className="text-[13px] text-[var(--ink-3)]">Lade EXIST-Finanzdaten …</p>}

      {!loading && error && (
        <div className="company-pilot-empty glass">EXIST-Finanzdaten konnten nicht geladen werden: {error}</div>
      )}

      {!loading && !error && data && (
        <div className="fin-grid">
          <article className="fin-card glass">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-3">
                  <TrafficLight
                    status={data.reimbursements.ampel}
                    label={`Vorstreckungsampel: ${ampelCopy(data.reimbursements.ampel)}`}
                  />
                </div>
                <div className="font-[var(--font)] text-[42px] font-semibold leading-none text-[var(--ink-1)]">
                  {formatEur(data.reimbursements.pending_reimbursements_eur)}
                </div>
                <p className="mt-2 max-w-[720px] text-[12.5px] leading-5 text-[var(--ink-3)]">
                  Offene private Vorstreckungen mit reimbursable=yes; unklare Erstattbarkeit wird nicht optimistisch
                  eingerechnet.
                </p>
              </div>
              <div className="grid min-w-[220px] grid-cols-2 gap-2 text-right font-[var(--mono)]">
                <div className="rounded-[12px] border border-[var(--line-1)] bg-white/[0.03] p-3">
                  <div className="text-[22px] font-semibold text-[var(--ink-1)]">
                    {data.reimbursements.open_reimbursement_count}
                  </div>
                  <div className="text-[10.5px] text-[var(--ink-3)]">offen</div>
                </div>
                <div className="rounded-[12px] border border-[var(--line-1)] bg-white/[0.03] p-3">
                  <div className="text-[22px] font-semibold text-[var(--danger)]">
                    {data.reimbursements.overdue_reimbursement_count}
                  </div>
                  <div className="text-[10.5px] text-[var(--ink-3)]">&gt;30 Tage</div>
                </div>
              </div>
            </div>
          </article>

          <div className="fin-kpi-row">
            <KPICard
              label="Pending reimbursements"
              value={formatEur(data.reimbursements.pending_reimbursements_eur)}
              tone={data.reimbursements.pending_reimbursements_eur === 0 ? 'ok' : 'warn'}
              sub={`${data.reimbursements.open_reimbursement_count} offen · ${data.reimbursements.overdue_reimbursement_count} überfällig`}
            />
            <KPICard
              label="Aging"
              value={data.reimbursements.oldest_open_days.toFixed(0)}
              unit="Tage"
              tone={data.reimbursements.oldest_open_days > 30 ? 'bad' : data.reimbursements.oldest_open_days > 14 ? 'warn' : 'ok'}
              sub={`Ø ${data.reimbursements.avg_days_outstanding.toFixed(0)} Tage outstanding`}
            />
            <KPICard
              label="Non-fundable Spend"
              value={formatEur(data.non_fundable_spend_eur)}
              tone={data.non_fundable_spend_eur > 0 ? 'warn' : 'ok'}
              sub="Funding-Pot non_fundable"
            />
            <KPICard
              label="Unklare Items"
              value={data.unclear_items_count.toFixed(0)}
              tone={kpiTone(data.unclear_items_count)}
              sub="Topf oder Förderfähigkeit unclear"
            />
          </div>

          <div className="fin-chart-row">
            <article className="fin-card glass">
              <div className="fin-card-head">
                <h3 className="fin-card-title">Topfverbrauch</h3>
              </div>
              <BudgetBar
                label="Sachmittel"
                spent={data.pots.sachmittel_spent_eur}
                remaining={data.pots.sachmittel_remaining_eur}
                total={data.budget.sachmittel_total_eur}
              />
              <BudgetBar
                label="Coaching"
                spent={data.pots.coaching_spent_eur}
                remaining={data.pots.coaching_remaining_eur}
                total={data.budget.coaching_total_eur}
              />
            </article>

            <article className="fin-card glass">
              <div className="fin-card-head">
                <h3 className="fin-card-title">Founder-Transparenz</h3>
              </div>
              {data.founder_out_of_pocket_by_person.length === 0 ? (
                <p className="m-0 text-[12.5px] text-[var(--ink-3)]">Keine offenen privaten Auslagen im Ledger.</p>
              ) : (
                <ul className="fin-paidby-legend">
                  {data.founder_out_of_pocket_by_person.map((row) => (
                    <li key={row.paid_by} className="fin-paidby-row">
                      <span className="fin-paidby-name">{resolvePayerName(row.paid_by)}</span>
                      <span className="fin-paidby-amount">{formatEur(row.amount_eur)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>

          <article className="fin-card glass">
            <div className="fin-card-head">
              <h3 className="fin-card-title">Größte offene Vorstreckungen</h3>
            </div>
            {data.reimbursements.largest_open_items.length === 0 ? (
              <p className="m-0 text-[12.5px] text-[var(--ink-3)]">Keine offenen erstattbaren Items.</p>
            ) : (
              <ul className="fin-cost-notes">
                {data.reimbursements.largest_open_items.map((item) => (
                  <li key={item.id} className="fin-cost-note">
                    <span className="fin-cost-note-label">{item.vendor}</span>
                    <span className="fin-cost-note-amount">{formatEur(item.amount_eur)}</span>
                    <span className="fin-cost-note-text">
                      {item.description} · {formatDate(item.expense_date)} · {item.days_outstanding} Tage offen
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="fin-card glass">
            <div className="fin-card-head">
              <h3 className="fin-card-title">Datenstand</h3>
            </div>
            <div className="grid gap-2 text-[12.5px] text-[var(--ink-3)] md:grid-cols-3">
              <div>
                <span className="block font-[var(--mono)] text-[10.5px] uppercase text-[var(--ink-4)]">as_of</span>
                {data.as_of}
              </div>
              <div>
                <span className="block font-[var(--mono)] text-[10.5px] uppercase text-[var(--ink-4)]">generated_at</span>
                {formatDateTime(data.generated_at)}
              </div>
              <div>
                <span className="block font-[var(--mono)] text-[10.5px] uppercase text-[var(--ink-4)]">data_origin</span>
                {data.data_origin}
              </div>
            </div>
            {data.data_origin === 'defaults' && (
              <div className="rounded-[14px] border border-[rgba(242,184,75,0.35)] bg-[rgba(242,184,75,0.08)] p-3 text-[12.5px] leading-5 text-[var(--warn)]">
                Ledger ist leer. Budgets werden angezeigt, operative Ist-Werte kommen aus Defaults.
              </div>
            )}
          </article>

          <ExpenseLedger memberNameById={resolvePayerName} onExpenseChanged={refreshCockpit} />
        </div>
      )}
    </section>
  );
}
