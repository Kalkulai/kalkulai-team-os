import type { ExistBudget, ExistFinanceData, ExpenseSummary, FinanceExpense } from '@/types/finance-expense';

const OPEN_REIMBURSEMENT_STATUSES = new Set(['open', 'submitted', 'approved']);
const FOUNDER_OOP_EXCLUDED_STATUSES = new Set(['reimbursed', 'n_a']);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysSince(expenseDate: string, now: Date): number {
  const start = new Date(`${expenseDate}T00:00:00.000Z`).getTime();
  return Math.floor((now.getTime() - start) / MS_PER_DAY);
}

function isOpenReimbursement(expense: FinanceExpense): boolean {
  return expense.reimbursable === 'yes' && OPEN_REIMBURSEMENT_STATUSES.has(expense.reimbursement_status);
}

export function aggregateExist(
  expenses: FinanceExpense[],
  budget: ExistBudget,
  now: Date,
): ExistFinanceData {
  const openItems = expenses.filter(isOpenReimbursement);
  const openWithAge = openItems.map((expense) => ({
    expense,
    days_outstanding: daysSince(expense.expense_date, now),
  }));

  const pendingReimbursements = roundMoney(
    openItems.reduce((sum, expense) => sum + expense.amount_eur, 0),
  );
  const days = openWithAge.map((item) => item.days_outstanding);
  const oldestOpenDays = days.length ? Math.max(...days) : 0;
  const avgDaysOutstanding = days.length
    ? Math.round(days.reduce((sum, day) => sum + day, 0) / days.length)
    : 0;
  const overdueCount = days.filter((day) => day > 30).length;
  const hasOlderThan14 = days.some((day) => day > 14);

  const largestOpenItems: ExpenseSummary[] = openWithAge
    .slice()
    .sort((a, b) => {
      if (b.expense.amount_eur !== a.expense.amount_eur) {
        return b.expense.amount_eur - a.expense.amount_eur;
      }
      return a.expense.expense_date.localeCompare(b.expense.expense_date);
    })
    .slice(0, 5)
    .map(({ expense, days_outstanding }) => ({
      id: expense.id,
      vendor: expense.vendor,
      description: expense.description,
      amount_eur: expense.amount_eur,
      expense_date: expense.expense_date,
      days_outstanding,
    }));

  const founderOop = new Map<string, number>();
  for (const expense of expenses) {
    if (
      expense.legal_entity === 'private' &&
      !FOUNDER_OOP_EXCLUDED_STATUSES.has(expense.reimbursement_status)
    ) {
      founderOop.set(expense.paid_by, (founderOop.get(expense.paid_by) ?? 0) + expense.amount_eur);
    }
  }

  const sachmittelSpent = roundMoney(
    expenses
      .filter((expense) => expense.funding_pot === 'sachmittel')
      .reduce((sum, expense) => sum + expense.amount_eur, 0),
  );
  const coachingSpent = roundMoney(
    expenses
      .filter((expense) => expense.funding_pot === 'coaching')
      .reduce((sum, expense) => sum + expense.amount_eur, 0),
  );
  const nonFundableSpend = roundMoney(
    expenses
      .filter((expense) => expense.funding_pot === 'non_fundable')
      .reduce((sum, expense) => sum + expense.amount_eur, 0),
  );
  const unclearItemsCount = expenses.filter(
    (expense) => expense.funding_pot === 'unclear' || expense.fundability === 'unclear',
  ).length;

  return {
    generated_at: now.toISOString(),
    as_of: `Ledger live · Budget Foerderbescheid · ${budget.funding_start}-${budget.funding_end}`,
    data_origin: expenses.length > 0 ? 'db' : 'defaults',
    currency: 'EUR',
    budget,
    pots: {
      sachmittel_spent_eur: sachmittelSpent,
      sachmittel_remaining_eur: roundMoney(budget.sachmittel_total_eur - sachmittelSpent),
      coaching_spent_eur: coachingSpent,
      coaching_remaining_eur: roundMoney(budget.coaching_total_eur - coachingSpent),
    },
    reimbursements: {
      pending_reimbursements_eur: pendingReimbursements,
      open_reimbursement_count: openItems.length,
      overdue_reimbursement_count: overdueCount,
      avg_days_outstanding: avgDaysOutstanding,
      oldest_open_days: oldestOpenDays,
      largest_open_items: largestOpenItems,
      ampel: overdueCount > 0 ? 'red' : hasOlderThan14 ? 'yellow' : 'green',
    },
    founder_out_of_pocket_by_person: Array.from(founderOop.entries()).map(([paid_by, amount_eur]) => ({
      paid_by,
      amount_eur: roundMoney(amount_eur),
    })),
    non_fundable_spend_eur: nonFundableSpend,
    unclear_items_count: unclearItemsCount,
  };
}
