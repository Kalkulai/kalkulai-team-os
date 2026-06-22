'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExpenseFundability,
  ExpenseFundingPot,
  ExpenseReimbursementStatus,
  ExpenseSource,
  FinanceExpense,
  FinanceExpensePatch,
} from '@/types/finance-expense';
import { formatEur } from '@/lib/finance-format';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

const FUNDING_POT_OPTIONS: Array<{ value: ExpenseFundingPot; label: string }> = [
  { value: 'sachmittel', label: 'Sachmittel' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'stipend', label: 'Stipendium' },
  { value: 'non_fundable', label: 'Nicht förderfähig' },
  { value: 'unclear', label: 'Unklar' },
];

const FUNDABILITY_OPTIONS: Array<{ value: ExpenseFundability; label: string }> = [
  { value: 'fundable', label: 'Förderfähig' },
  { value: 'non_fundable', label: 'Nicht förderfähig' },
  { value: 'unclear', label: 'Unklar' },
];

const REIMBURSEMENT_STATUS_OPTIONS: Array<{ value: ExpenseReimbursementStatus; label: string }> = [
  { value: 'open', label: 'Offen' },
  { value: 'submitted', label: 'Eingereicht' },
  { value: 'approved', label: 'Freigegeben' },
  { value: 'reimbursed', label: 'Erstattet' },
  { value: 'rejected', label: 'Abgelehnt' },
  { value: 'n_a', label: 'Nicht relevant' },
];

const SOURCE_LABEL: Record<ExpenseSource, string> = {
  hermes: 'Hermes',
  import: 'Import',
  manual_ui: 'Manuell',
};

const SOURCE_CLASS: Record<ExpenseSource, string> = {
  hermes: 'border-[rgba(139,107,255,0.35)] bg-[rgba(139,107,255,0.14)] text-[var(--brand-2)]',
  import: 'border-[rgba(60,224,140,0.28)] bg-[rgba(60,224,140,0.10)] text-[var(--ok)]',
  manual_ui: 'border-[rgba(148,163,184,0.25)] bg-white/[0.04] text-[var(--ink-3)]',
};

interface ExpenseListResponse {
  expenses: FinanceExpense[];
}

interface EditableFields {
  reimbursement_status: ExpenseReimbursementStatus;
  fundability: ExpenseFundability;
  funding_pot: ExpenseFundingPot;
  note: string;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' }).format(date);
}

function createDraft(expense: FinanceExpense): EditableFields {
  return {
    reimbursement_status: expense.reimbursement_status,
    fundability: expense.fundability,
    funding_pot: expense.funding_pot,
    note: expense.note ?? '',
  };
}

function isDirty(expense: FinanceExpense, draft: EditableFields): boolean {
  return (
    draft.reimbursement_status !== expense.reimbursement_status ||
    draft.fundability !== expense.fundability ||
    draft.funding_pot !== expense.funding_pot ||
    draft.note !== (expense.note ?? '')
  );
}

function receiptLabel(status: FinanceExpense['receipt_status']): string {
  return status === 'available' ? 'vorhanden' : 'fehlt';
}

export function ExpenseLedger({
  memberNameById,
  onExpenseChanged,
}: {
  memberNameById: (id: string) => string;
  onExpenseChanged?: () => void;
}) {
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditableFields>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const lastFetchAtRef = useRef(0);

  const fetchExpenses = useCallback(async (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastFetchAtRef.current < 30_000) return;
    lastFetchAtRef.current = now;

    try {
      const res = await fetch('/api/expenses?scenario=exist', {
        headers: { Authorization: `Bearer ${SECRET}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as ExpenseListResponse;
      const nextExpenses = payload.expenses;
      setExpenses(nextExpenses);
      setDrafts(Object.fromEntries(nextExpenses.map((expense) => [expense.id, createDraft(expense)])));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      if (!cancelled) void fetchExpenses(true);
    });

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchExpenses(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') void fetchExpenses(false);
    }, 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(intervalId);
    };
  }, [fetchExpenses]);

  function updateDraft<K extends keyof EditableFields>(id: string, field: K, value: EditableFields[K]) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [field]: value,
      },
    }));
  }

  async function saveExpense(expense: FinanceExpense) {
    const draft = drafts[expense.id] ?? createDraft(expense);
    const patch: FinanceExpensePatch = {
      reimbursement_status: draft.reimbursement_status,
      fundability: draft.fundability,
      funding_pot: draft.funding_pot,
      note: draft.note.trim() === '' ? null : draft.note.trim(),
    };

    setSavingId(expense.id);
    setRowErrors((current) => {
      const next = { ...current };
      delete next[expense.id];
      return next;
    });

    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SECRET}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${res.status}`);
      }
      await fetchExpenses(true);
      onExpenseChanged?.();
    } catch (err) {
      setRowErrors((current) => ({
        ...current,
        [expense.id]: err instanceof Error ? err.message : 'Unbekannter Fehler',
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <article className="fin-card glass">
      <div className="fin-card-head">
        <div>
          <h3 className="fin-card-title">EXIST-Ausgabenbuch</h3>
          <p className="m-0 mt-1 text-[12px] leading-5 text-[var(--ink-3)]">
            Review für Erstattung, Förderfähigkeit und Belege. Status nur ändern, wenn geprüft.
          </p>
        </div>
      </div>

      {loading && <p className="m-0 text-[13px] text-[var(--ink-3)]">Lade Ausgabenbuch …</p>}
      {!loading && error && (
        <div className="company-pilot-empty glass">Ausgabenbuch konnte nicht geladen werden: {error}</div>
      )}
      {!loading && !error && expenses.length === 0 && (
        <div className="company-pilot-empty glass">Noch keine EXIST-Ausgaben im Ledger.</div>
      )}

      {!loading && !error && expenses.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-separate border-spacing-y-2 text-left text-[12px]">
            <thead className="font-[var(--mono)] text-[10.5px] uppercase text-[var(--ink-4)]">
              <tr>
                <th className="px-3 py-1 font-semibold">Datum</th>
                <th className="px-3 py-1 font-semibold">Empfänger</th>
                <th className="px-3 py-1 font-semibold">Beschreibung</th>
                <th className="px-3 py-1 text-right font-semibold">Betrag</th>
                <th className="px-3 py-1 font-semibold">Zahler</th>
                <th className="px-3 py-1 font-semibold">Topf</th>
                <th className="px-3 py-1 font-semibold">Förderfähigkeit</th>
                <th className="px-3 py-1 font-semibold">Erstattung</th>
                <th className="px-3 py-1 font-semibold">Beleg</th>
                <th className="px-3 py-1 font-semibold">Quelle</th>
                <th className="px-3 py-1 font-semibold">Notiz</th>
                <th className="px-3 py-1 font-semibold">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => {
                const draft = drafts[expense.id] ?? createDraft(expense);
                const dirty = isDirty(expense, draft);
                const isSaving = savingId === expense.id;
                const rowError = rowErrors[expense.id];

                return (
                  <tr key={expense.id} className="align-top">
                    <td className="rounded-l-[14px] border-y border-l border-[var(--line-1)] bg-white/[0.03] px-3 py-3 font-[var(--mono)] text-[var(--ink-2)]">
                      {formatDate(expense.expense_date)}
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3 font-semibold text-[var(--ink-1)]">
                      {expense.vendor}
                    </td>
                    <td className="max-w-[220px] border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3 text-[var(--ink-2)]">
                      <div className="line-clamp-3">{expense.description}</div>
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3 text-right font-[var(--mono)] font-semibold text-[var(--ink-1)]">
                      {formatEur(expense.amount_eur)}
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3 text-[var(--ink-2)]">
                      {memberNameById(expense.paid_by)}
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <select
                        className="w-full min-w-[150px] rounded-[10px] border border-[var(--line-1)] bg-[var(--glass-2)] px-2 py-2 text-[12px] text-[var(--ink-1)] outline-none focus:border-[var(--brand-2)]"
                        value={draft.funding_pot}
                        onChange={(event) =>
                          updateDraft(expense.id, 'funding_pot', event.target.value as ExpenseFundingPot)
                        }
                        disabled={isSaving}
                      >
                        {FUNDING_POT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <select
                        className="w-full min-w-[150px] rounded-[10px] border border-[var(--line-1)] bg-[var(--glass-2)] px-2 py-2 text-[12px] text-[var(--ink-1)] outline-none focus:border-[var(--brand-2)]"
                        value={draft.fundability}
                        onChange={(event) =>
                          updateDraft(expense.id, 'fundability', event.target.value as ExpenseFundability)
                        }
                        disabled={isSaving}
                      >
                        {FUNDABILITY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <select
                        className="w-full min-w-[150px] rounded-[10px] border border-[var(--line-1)] bg-[var(--glass-2)] px-2 py-2 text-[12px] text-[var(--ink-1)] outline-none focus:border-[var(--brand-2)]"
                        value={draft.reimbursement_status}
                        onChange={(event) =>
                          updateDraft(
                            expense.id,
                            'reimbursement_status',
                            event.target.value as ExpenseReimbursementStatus,
                          )
                        }
                        disabled={isSaving}
                      >
                        {REIMBURSEMENT_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 font-[var(--mono)] text-[10.5px] font-semibold ${
                          expense.receipt_status === 'available'
                            ? 'border-[rgba(60,224,140,0.28)] bg-[rgba(60,224,140,0.10)] text-[var(--ok)]'
                            : 'border-[rgba(255,107,92,0.30)] bg-[rgba(255,107,92,0.10)] text-[var(--danger)]'
                        }`}
                      >
                        {receiptLabel(expense.receipt_status)}
                      </span>
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 font-[var(--mono)] text-[10.5px] font-semibold ${SOURCE_CLASS[expense.source]}`}
                      >
                        {SOURCE_LABEL[expense.source]}
                      </span>
                    </td>
                    <td className="border-y border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <textarea
                        className="min-h-[58px] w-[180px] resize-y rounded-[10px] border border-[var(--line-1)] bg-[var(--glass-2)] px-2 py-2 text-[12px] leading-4 text-[var(--ink-1)] outline-none focus:border-[var(--brand-2)]"
                        value={draft.note}
                        onChange={(event) => updateDraft(expense.id, 'note', event.target.value)}
                        disabled={isSaving}
                        aria-label={`Notiz zu ${expense.vendor}`}
                      />
                      {rowError && <div className="mt-2 text-[11px] text-[var(--danger)]">{rowError}</div>}
                    </td>
                    <td className="rounded-r-[14px] border-y border-r border-[var(--line-1)] bg-white/[0.03] px-3 py-3">
                      <button
                        type="button"
                        className="inline-flex min-w-[86px] items-center justify-center rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] px-3 py-2 font-[var(--mono)] text-[11px] font-semibold text-[var(--ink-1)] transition hover:border-[var(--brand-2)] disabled:cursor-not-allowed disabled:opacity-45"
                        onClick={() => void saveExpense(expense)}
                        disabled={!dirty || isSaving}
                      >
                        {isSaving ? 'Speichert' : dirty ? 'Speichern' : 'Gespeichert'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
