import type {
  ExpenseApprovalStatus,
  ExpenseFundability,
  ExpenseFundingPot,
  ExpenseLegalEntity,
  ExpenseReceiptStatus,
  ExpenseReimbursable,
  ExpenseReimbursementStatus,
  ExpenseScenario,
  ExpenseSource,
  FinanceExpensePatch,
  NewFinanceExpense,
} from '@/types/finance-expense';

export const LEGAL_ENTITIES = ['private', 'gmbh', 'chair'] as const;
export const EXPENSE_SCENARIOS = ['exist', 'pre-exist'] as const;
export const FUNDING_POTS = ['sachmittel', 'coaching', 'stipend', 'non_fundable', 'unclear'] as const;
export const FUNDABILITIES = ['fundable', 'non_fundable', 'unclear'] as const;
export const REIMBURSABLE_VALUES = ['yes', 'no', 'unclear'] as const;
export const REIMBURSEMENT_STATUSES = ['open', 'submitted', 'approved', 'reimbursed', 'rejected', 'n_a'] as const;
export const RECEIPT_STATUSES = ['missing', 'available'] as const;
export const APPROVAL_STATUSES = ['not_checked', 'checked', 'needs_clarification'] as const;
export const EXPENSE_SOURCES = ['hermes', 'manual_ui', 'import'] as const;

type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
type ExistExpenseCreateField =
  | 'legal_entity'
  | 'scenario'
  | 'funding_pot'
  | 'fundability'
  | 'reimbursable'
  | 'reimbursement_status'
  | 'receipt_status'
  | 'source';

const UUID_IN_TEXT = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const PAYER_LABELS: Record<string, string> = {
  leon: 'Leon',
  felix: 'Felix',
  paul: 'Paul',
  gmbh: 'GmbH',
  lehrstuhl: 'Lehrstuhl',
  company: 'Company',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStr(value: unknown): value is string {
  return typeof value === 'string';
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function enumValue<T extends readonly string[]>(
  field: string,
  value: unknown,
  allowed: T,
): ValidationResult<T[number]> {
  if (isStr(value) && allowed.includes(value)) return { ok: true, value };
  return { ok: false, error: `${field} must be one of: ${allowed.join(', ')}` };
}

function requiredEnumValue<T extends readonly string[]>(
  field: ExistExpenseCreateField,
  value: unknown,
  allowed: T,
): ValidationResult<T[number]> {
  if (value === undefined || value === null) {
    return { ok: false, error: `${field} is required for EXIST expense creates` };
  }
  return enumValue(field, value, allowed);
}

function optionalNullableString(field: string, value: unknown): ValidationResult<string | null | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (isStr(value)) return { ok: true, value };
  return { ok: false, error: `${field} must be a string or null` };
}

function requiredTrimmedString(field: string, value: unknown): ValidationResult<string> {
  if (!isStr(value) || value.trim() === '') {
    return { ok: false, error: `${field} must be a non-empty string` };
  }
  return { ok: true, value: value.trim() };
}

function requiredPaidBy(value: unknown): ValidationResult<string> {
  const paidBy = requiredTrimmedString('paid_by', value);
  if (!paidBy.ok) return paidBy;
  if (UUID_IN_TEXT.test(paidBy.value)) {
    return { ok: false, error: 'paid_by must be a stable human-readable payer label, not a UUID' };
  }
  return { ok: true, value: PAYER_LABELS[paidBy.value.toLowerCase()] ?? paidBy.value };
}

function optionalDate(field: string, value: unknown): ValidationResult<string | undefined> {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isStr(value) || !isDateString(value)) {
    return { ok: false, error: `${field} must be a YYYY-MM-DD date` };
  }
  return { ok: true, value };
}

export function isExpenseScenario(value: unknown): value is ExpenseScenario {
  return isStr(value) && EXPENSE_SCENARIOS.includes(value as ExpenseScenario);
}

export function validateCreateExpense(value: unknown): ValidationResult<NewFinanceExpense> {
  if (!isRecord(value)) return { ok: false, error: 'Body must be JSON' };

  const expenseDate = optionalDate('expense_date', value.expense_date);
  if (!expenseDate.ok || expenseDate.value === undefined) {
    return { ok: false, error: expenseDate.ok ? 'expense_date must be a YYYY-MM-DD date' : expenseDate.error };
  }

  const vendor = requiredTrimmedString('vendor', value.vendor);
  if (!vendor.ok) return vendor;
  const description = requiredTrimmedString('description', value.description);
  if (!description.ok) return description;
  const paidBy = requiredPaidBy(value.paid_by);
  if (!paidBy.ok) return paidBy;
  if (!isNum(value.amount_eur)) return { ok: false, error: 'amount_eur must be a finite number' };

  const legalEntity = requiredEnumValue('legal_entity', value.legal_entity, LEGAL_ENTITIES);
  if (!legalEntity.ok) return legalEntity;
  const scenario = requiredEnumValue('scenario', value.scenario, EXPENSE_SCENARIOS);
  if (!scenario.ok) return scenario;
  if (scenario.value !== 'exist') return { ok: false, error: "scenario must be 'exist' for expense creates" };
  const fundingPot = requiredEnumValue('funding_pot', value.funding_pot, FUNDING_POTS);
  if (!fundingPot.ok) return fundingPot;
  const fundability = requiredEnumValue('fundability', value.fundability, FUNDABILITIES);
  if (!fundability.ok) return fundability;
  const reimbursable = requiredEnumValue('reimbursable', value.reimbursable, REIMBURSABLE_VALUES);
  if (!reimbursable.ok) return reimbursable;
  const reimbursementStatus = requiredEnumValue(
    'reimbursement_status',
    value.reimbursement_status,
    REIMBURSEMENT_STATUSES,
  );
  if (!reimbursementStatus.ok) return reimbursementStatus;
  const receiptStatus = requiredEnumValue('receipt_status', value.receipt_status, RECEIPT_STATUSES);
  if (!receiptStatus.ok) return receiptStatus;
  const approvalStatus = enumValue('approval_status', value.approval_status ?? 'not_checked', APPROVAL_STATUSES);
  if (!approvalStatus.ok) return approvalStatus;
  const source = requiredEnumValue('source', value.source, EXPENSE_SOURCES);
  if (!source.ok) return source;

  const category = optionalNullableString('category', value.category);
  if (!category.ok) return category;
  const sourceMessage = optionalNullableString('source_message', value.source_message);
  if (!sourceMessage.ok) return sourceMessage;
  const note = requiredTrimmedString('note', value.note);
  if (!note.ok) return note;
  const idempotencyKey = optionalNullableString('idempotency_key', value.idempotency_key);
  if (!idempotencyKey.ok) return idempotencyKey;

  return {
    ok: true,
    value: {
      expense_date: expenseDate.value,
      vendor: vendor.value,
      description: description.value,
      category: category.value ?? null,
      amount_eur: value.amount_eur,
      paid_by: paidBy.value,
      legal_entity: legalEntity.value as ExpenseLegalEntity,
      scenario: scenario.value as ExpenseScenario,
      funding_pot: fundingPot.value as ExpenseFundingPot,
      fundability: fundability.value as ExpenseFundability,
      reimbursable: reimbursable.value as ExpenseReimbursable,
      reimbursement_status: reimbursementStatus.value as ExpenseReimbursementStatus,
      receipt_status: receiptStatus.value as ExpenseReceiptStatus,
      approval_status: approvalStatus.value as ExpenseApprovalStatus,
      source: source.value as ExpenseSource,
      source_message: sourceMessage.value ?? null,
      note: note.value,
      idempotency_key: idempotencyKey.value ?? null,
    },
  };
}

export function validatePatchExpense(value: unknown): ValidationResult<FinanceExpensePatch> {
  if (!isRecord(value)) return { ok: false, error: 'Body must be JSON' };

  const patch: FinanceExpensePatch = {};

  if ('expense_date' in value) {
    const result = optionalDate('expense_date', value.expense_date);
    if (!result.ok || result.value === undefined) {
      return { ok: false, error: result.ok ? 'expense_date must be a YYYY-MM-DD date' : result.error };
    }
    patch.expense_date = result.value;
  }

  for (const field of ['vendor', 'description', 'paid_by'] as const) {
    if (field in value) {
      const result = field === 'paid_by' ? requiredPaidBy(value[field]) : requiredTrimmedString(field, value[field]);
      if (!result.ok) return result;
      patch[field] = result.value;
    }
  }

  if ('amount_eur' in value) {
    if (!isNum(value.amount_eur)) return { ok: false, error: 'amount_eur must be a finite number' };
    patch.amount_eur = value.amount_eur;
  }

  if ('legal_entity' in value) {
    const result = enumValue('legal_entity', value.legal_entity, LEGAL_ENTITIES);
    if (!result.ok) return result;
    patch.legal_entity = result.value;
  }
  if ('scenario' in value) {
    const result = enumValue('scenario', value.scenario, EXPENSE_SCENARIOS);
    if (!result.ok) return result;
    patch.scenario = result.value;
  }
  if ('funding_pot' in value) {
    const result = enumValue('funding_pot', value.funding_pot, FUNDING_POTS);
    if (!result.ok) return result;
    patch.funding_pot = result.value;
  }
  if ('fundability' in value) {
    const result = enumValue('fundability', value.fundability, FUNDABILITIES);
    if (!result.ok) return result;
    patch.fundability = result.value;
  }
  if ('reimbursable' in value) {
    const result = enumValue('reimbursable', value.reimbursable, REIMBURSABLE_VALUES);
    if (!result.ok) return result;
    patch.reimbursable = result.value;
  }
  if ('reimbursement_status' in value) {
    const result = enumValue('reimbursement_status', value.reimbursement_status, REIMBURSEMENT_STATUSES);
    if (!result.ok) return result;
    patch.reimbursement_status = result.value;
  }
  if ('receipt_status' in value) {
    const result = enumValue('receipt_status', value.receipt_status, RECEIPT_STATUSES);
    if (!result.ok) return result;
    patch.receipt_status = result.value;
  }
  if ('approval_status' in value) {
    const result = enumValue('approval_status', value.approval_status, APPROVAL_STATUSES);
    if (!result.ok) return result;
    patch.approval_status = result.value;
  }
  if ('source' in value) {
    const result = enumValue('source', value.source, EXPENSE_SOURCES);
    if (!result.ok) return result;
    patch.source = result.value;
  }

  for (const field of ['category', 'source_message', 'note', 'idempotency_key'] as const) {
    if (field in value) {
      const result = optionalNullableString(field, value[field]);
      if (!result.ok) return result;
      patch[field] = result.value ?? null;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'no fields to update' };
  }

  return { ok: true, value: patch };
}
