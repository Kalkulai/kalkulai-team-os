// Finance / CFO-Kai data contract — shared between /api/finance and the
// dashboard UI (CompanyPageClient + components/finance/*).
// Source of truth for the "Finanzen — CFO-Kai" section on /dashboard/company.

export type AmpelStatus = 'green' | 'yellow' | 'red';

/** A single recurring cost line (monthly basis, EUR). */
export interface CostLine {
  /** Display label, e.g. "Claude", "Hosting", "Legal". */
  label: string;
  /** Monthly amount in EUR. */
  amount_eur: number;
  /** Fixed contractual cost (e.g. Claude 210€) vs. variable/usage-based. */
  fixed: boolean;
  /** Who pays this line out of pocket (drives the Paid-By pie). */
  paid_by: string;
  /** Optional context note, e.g. Legal "läuft Q3 aus". */
  note?: string;
}

/** Aggregated spend per payer for the Paid-By pie chart. */
export interface PaidBySlice {
  name: string;
  value_eur: number;
}

/** One month in the 6-month cash/burn forecast line. */
export interface ForecastPoint {
  /** Short month label, e.g. "Jun". */
  month: string;
  /** Projected cash balance at month end (EUR). */
  cash_eur: number;
  /** Projected monthly burn (EUR). */
  burn_eur: number;
}

/** Burn comparison: actual vs. planned, with signed delta. */
export interface MonthlyBurn {
  actual_eur: number;
  plan_eur: number;
  /** actual - plan; positive = over plan (bad), negative = under plan (good). */
  delta_eur: number;
}

/** Per-pilot health row with traffic-light status. */
export interface PilotHealthRow {
  name: string;
  status: AmpelStatus;
  note: string;
}

export interface FinanceData {
  /** ISO 8601 timestamp of when the snapshot was produced. */
  generated_at: string;
  /** Provenance + freshness of the underlying figures (shown in the UI). */
  as_of: string;
  currency: 'EUR';
  /** Liquid cash currently available (EUR). */
  cash_on_hand_eur: number;
  /** cash_on_hand / monthly burn, in months. */
  runway_months: number;
  /** Break-even milestone label, e.g. "M8 · Nov". */
  break_even_label: string;
  monthly_burn: MonthlyBurn;
  cost_lines: CostLine[];
  paid_by: PaidBySlice[];
  forecast_6m: ForecastPoint[];
  pilot_health: PilotHealthRow[];
}
