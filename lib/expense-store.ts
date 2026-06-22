import { supabaseAdmin } from '@/lib/supabase';
import type { ExpenseScenario, FinanceExpense, FinanceExpensePatch, NewFinanceExpense } from '@/types/finance-expense';

type FinanceExpenseRow = Omit<FinanceExpense, 'amount_eur'> & { amount_eur: number | string };

function rowToExpense(row: FinanceExpenseRow): FinanceExpense {
  return {
    ...row,
    amount_eur: typeof row.amount_eur === 'string' ? Number(row.amount_eur) : row.amount_eur,
  };
}

export interface InsertExpenseResult {
  created: boolean;
  expense: FinanceExpense | null;
}

export async function insertExpense(expense: NewFinanceExpense): Promise<InsertExpenseResult> {
  const query = expense.idempotency_key
    ? supabaseAdmin
        .from('finance_expenses')
        .upsert(expense, { onConflict: 'idempotency_key', ignoreDuplicates: true })
    : supabaseAdmin.from('finance_expenses').insert(expense);

  const { data, error } = await query.select('*').maybeSingle();
  if (error) throw error;
  if (!data) return { created: false, expense: null };
  return { created: true, expense: rowToExpense(data as FinanceExpenseRow) };
}

export async function listExpenses(scenario: ExpenseScenario = 'exist'): Promise<FinanceExpense[]> {
  const { data, error } = await supabaseAdmin
    .from('finance_expenses')
    .select('*')
    .eq('scenario', scenario)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as FinanceExpenseRow[]).map(rowToExpense);
}

export async function patchExpense(id: string, patch: FinanceExpensePatch): Promise<FinanceExpense | null> {
  const { data, error } = await supabaseAdmin
    .from('finance_expenses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ? rowToExpense(data as FinanceExpenseRow) : null;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('finance_expenses')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
