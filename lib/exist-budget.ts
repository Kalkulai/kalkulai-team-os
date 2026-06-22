import type { ExistBudget } from '@/types/finance-expense';

export const existBudgetConfig: ExistBudget = {
  sachmittel_total_eur: 0, // TODO(felix): echte Werte aus Förderbescheid
  coaching_total_eur: 0, // TODO(felix): echte Werte aus Förderbescheid
  stipend_total_eur: 0, // TODO(felix): echte Werte aus Förderbescheid
  network_support_total_eur: 0, // TODO(felix): echte Werte aus Förderbescheid
  funding_start: '2026-08-01',
  funding_end: '2027-07-31',
};

export function getExistBudget(): ExistBudget {
  return existBudgetConfig;
}
