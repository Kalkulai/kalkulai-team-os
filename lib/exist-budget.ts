import type { ExistBudget } from '@/types/finance-expense';

// Werte aus Kalkulai_EXIST_Finanzplan_v11, AZA-Gesamtfinanzierungsplan
// (Planlaufzeit 01.08.2026–31.07.2027):
//   F0843 Sachausgaben 30.000 · F0835 Coaching 5.000 ·
//   F0824 Personalausgaben/Stipendien 88.500 · F0842 Betreuungspauschale 10.000
export const existBudgetConfig: ExistBudget = {
  sachmittel_total_eur: 30_000,
  coaching_total_eur: 5_000,
  stipend_total_eur: 88_500,
  network_support_total_eur: 10_000, // Betreuungspauschale — kein operativer Founder-Topf
  funding_start: '2026-08-01',
  funding_end: '2027-07-31',
};

export function getExistBudget(): ExistBudget {
  return existBudgetConfig;
}
