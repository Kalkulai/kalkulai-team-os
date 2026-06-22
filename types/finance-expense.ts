export type ExpenseLegalEntity = 'private' | 'gmbh' | 'chair';
export type ExpenseScenario = 'exist' | 'pre-exist';
export type ExpenseFundingPot = 'sachmittel' | 'coaching' | 'stipend' | 'non_fundable' | 'unclear';
export type ExpenseFundability = 'fundable' | 'non_fundable' | 'unclear';
export type ExpenseReimbursable = 'yes' | 'no' | 'unclear';
export type ExpenseReimbursementStatus =
  | 'open'
  | 'submitted'
  | 'approved'
  | 'reimbursed'
  | 'rejected'
  | 'n_a';
export type ExpenseReceiptStatus = 'missing' | 'available';
export type ExpenseApprovalStatus = 'not_checked' | 'checked' | 'needs_clarification';
export type ExpenseSource = 'hermes' | 'manual_ui' | 'import';

export interface FinanceExpense {
  id: string;
  created_at: string;
  updated_at: string;
  expense_date: string;
  vendor: string;
  description: string;
  category: string | null;
  amount_eur: number;
  paid_by: string;
  legal_entity: ExpenseLegalEntity;
  scenario: ExpenseScenario;
  funding_pot: ExpenseFundingPot;
  fundability: ExpenseFundability;
  reimbursable: ExpenseReimbursable;
  reimbursement_status: ExpenseReimbursementStatus;
  receipt_status: ExpenseReceiptStatus;
  approval_status: ExpenseApprovalStatus;
  source: ExpenseSource;
  source_message: string | null;
  note: string | null;
  idempotency_key: string | null;
}

export type NewFinanceExpense = Omit<FinanceExpense, 'id' | 'created_at' | 'updated_at'>;
export type FinanceExpensePatch = Partial<NewFinanceExpense>;

export interface ExistBudget {
  sachmittel_total_eur: number;
  coaching_total_eur: number;
  stipend_total_eur: number;
  network_support_total_eur: number;
  funding_start: string;
  funding_end: string;
}

export interface ExpenseSummary {
  id: string;
  vendor: string;
  description: string;
  amount_eur: number;
  expense_date: string;
  days_outstanding: number;
}

export interface ExistFinanceData {
  generated_at: string;
  as_of: string;
  data_origin: 'db' | 'defaults';
  currency: 'EUR';
  budget: ExistBudget;
  pots: {
    sachmittel_spent_eur: number;
    sachmittel_remaining_eur: number;
    coaching_spent_eur: number;
    coaching_remaining_eur: number;
  };
  reimbursements: {
    pending_reimbursements_eur: number;
    open_reimbursement_count: number;
    overdue_reimbursement_count: number;
    avg_days_outstanding: number;
    oldest_open_days: number;
    largest_open_items: ExpenseSummary[];
    ampel: 'green' | 'yellow' | 'red';
  };
  founder_out_of_pocket_by_person: Array<{ paid_by: string; amount_eur: number }>;
  non_fundable_spend_eur: number;
  unclear_items_count: number;
}
