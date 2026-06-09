import type { CostLine, FinanceData, ForecastPoint } from '@/types/finance';

// Single source of truth for the CFO-Kai finance snapshot. Consumed by the
// authed API route (/api/finance) and the dev-only preview page.
//
// Figures are REAL, sourced from Kalkulai_EXIST_Finanzplan_v11 (Drive → Vault:
// sources/drive/bewerbungen-programme/2026/05/kalkulai-exist-finanzplan-v11.md).
// Szenario: EXIST-Förderplan, Laufzeit 01.08.2026–31.07.2027 (M1 = Aug 2026).
// Förderbeginn liegt in der Zukunft → Plan-/Forward-Sicht, Grant pending.
//
// TODO(plan B): Hermes ersetzt diese Defaults via POST /api/finance/snapshot
// (Supabase), sobald pull_finance_sheets.py die canonical Sheets live zieht.

const AS_OF = 'EXIST-Finanzplan v11 · Förderstart Aug 2026 · Plan-Szenario (Grant pending)';

// Betriebskosten Monat 1 (Aug 2026), Summe 2.068 €. Förder-Stipendien
// (7.500 €/Mo) + Sachmittel (2.462 €/Mo) sind Einnahmen, kein Firmen-Burn.
// Nur Claude ist namentlich einem Zahler zugeordnet (Felix); Rest = Company.
const COST_LINES: CostLine[] = [
  { label: 'UG Gründung', amount_eur: 650, fixed: false, paid_by: 'Company', note: 'einmalig M1 · 1× operative UG' },
  { label: 'Legal & Beratung', amount_eur: 417, fixed: true, paid_by: 'Company', note: 'an Coachingplan gekoppelt' },
  { label: 'API (Azure + Whisper)', amount_eur: 400, fixed: false, paid_by: 'Company', note: '~20 €/Kunde/Monat' },
  { label: 'Claude Max (2×)', amount_eur: 220, fixed: true, paid_by: 'Felix', note: '2× M1–M5, 3× ab M6' },
  { label: 'Marketing & Vertrieb', amount_eur: 100, fixed: false, paid_by: 'Company', note: 'Content → Ads → Events' },
  { label: 'Versicherung (IT+Cyber)', amount_eur: 80, fixed: true, paid_by: 'Company', note: 'Team-Police' },
  { label: 'Sales-Tools', amount_eur: 50, fixed: false, paid_by: 'Company', note: 'Apollo+Instantly ab M6' },
  { label: 'Geschäftskonto', amount_eur: 50, fixed: true, paid_by: 'Company', note: 'Qonto o.ä.' },
  { label: 'Infrastruktur', amount_eur: 48, fixed: true, paid_by: 'Company', note: 'Hetzner + Supabase + Domain' },
  { label: 'Monitoring & Office', amount_eur: 45, fixed: true, paid_by: 'Company', note: 'Sentry + Google Workspace' },
  { label: 'Stripe Gebühren', amount_eur: 8, fixed: false, paid_by: 'Company', note: '~2% vom Umsatz' },
];

// EXIST-Zuwendung Jahr 1 (Aug 2026 – Jul 2027): 54.558 € (Aug–Dez) + 78.481 €
// (Jan–Jul) = 133.039 € gesamt lt. AZA-Gesamtfinanzierungsplan.
const EXIST_FUNDING_Y1_EUR = 54_558;
const BURN_M1_EUR = 2_068; // Betriebskosten M1 (Aug), ohne Förder-Posten

// 6-Monats-Forecast M1–M6 (Aug 2026 – Jan 2027) direkt aus der GuV:
// cash = Kapital (kumuliert, inkl. Förderung), burn = Kosten Total.
const FORECAST_6M: ForecastPoint[] = [
  { month: 'Aug', cash_eur: 6_794, burn_eur: 2_068 },
  { month: 'Sep', cash_eur: 15_736, burn_eur: 1_520 },
  { month: 'Okt', cash_eur: 24_676, burn_eur: 1_622 },
  { month: 'Nov', cash_eur: 33_514, burn_eur: 1_824 },
  { month: 'Dez', cash_eur: 42_350, burn_eur: 1_926 },
  { month: 'Jan', cash_eur: 53_243, burn_eur: 4_619 },
];

/** Sum cost lines per payer for the Paid-By pie. */
function buildPaidBy(lines: CostLine[]) {
  const byPayer = new Map<string, number>();
  for (const line of lines) {
    byPayer.set(line.paid_by, (byPayer.get(line.paid_by) ?? 0) + line.amount_eur);
  }
  return [...byPayer.entries()]
    .map(([name, value_eur]) => ({ name, value_eur }))
    .sort((a, b) => b.value_eur - a.value_eur);
}

export function buildFinanceData(): FinanceData {
  return {
    generated_at: new Date().toISOString(),
    data_origin: 'defaults',
    as_of: AS_OF,
    currency: 'EUR',
    cash_on_hand_eur: EXIST_FUNDING_Y1_EUR,
    runway_months: 12, // Förderlaufzeit Aug 2026 – Jul 2027
    break_even_label: 'M6 · Jan 2027',
    monthly_burn: {
      actual_eur: BURN_M1_EUR,
      plan_eur: BURN_M1_EUR,
      delta_eur: 0,
    },
    cost_lines: COST_LINES,
    paid_by: buildPaidBy(COST_LINES),
    forecast_6m: FORECAST_6M,
    pilot_health: [
      { name: '20 Piloten ab Aug (20 €)', status: 'green', note: '+5 Neukunden/Monat lt. Plan' },
      { name: '70% Conversion → 150 € (Jan)', status: 'yellow', note: 'LOI-gestützt · M6' },
      { name: 'Ziel M12: 105 Kunden', status: 'green', note: '15.750 € MRR / 189k € ARR' },
    ],
  };
}
