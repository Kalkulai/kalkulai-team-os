import { describe, expect, it } from 'vitest';
import { validateCreateExpense, validatePatchExpense } from '@/lib/expense-validation';

const validExistExpense = {
  expense_date: '2026-08-05',
  vendor: 'OpenAI',
  description: 'API credits for prototype evaluation',
  amount_eur: 420,
  paid_by: 'felix',
  legal_entity: 'private',
  scenario: 'exist',
  funding_pot: 'sachmittel',
  fundability: 'fundable',
  reimbursable: 'yes',
  reimbursement_status: 'open',
  receipt_status: 'available',
  source: 'hermes',
  note: 'Project infrastructure with receipt available.',
};

describe('validateCreateExpense EXIST write contract', () => {
  it('requires the explicit MVP contract fields for new EXIST expenses', () => {
    const result = validateCreateExpense({
      ...validExistExpense,
      funding_pot: undefined,
    });

    expect(result).toEqual({ ok: false, error: 'funding_pot is required for EXIST expense creates' });
  });

  it('normalizes founder paid_by labels to stable display names', () => {
    const result = validateCreateExpense({
      ...validExistExpense,
      paid_by: ' felix ',
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paid_by).toBe('Felix');
  });

  it('rejects UUID-like paid_by values before insert', () => {
    const result = validateCreateExpense({
      ...validExistExpense,
      paid_by: 'c9677ade-e42c-4593-81c6-7a2108b145fd',
    });

    expect(result).toEqual({
      ok: false,
      error: 'paid_by must be a stable human-readable payer label, not a UUID',
    });
  });

  it('keeps this create path scoped to EXIST expenses', () => {
    const result = validateCreateExpense({
      ...validExistExpense,
      scenario: 'pre-exist',
    });

    expect(result).toEqual({ ok: false, error: "scenario must be 'exist' for expense creates" });
  });
});

describe('validatePatchExpense paid_by normalization', () => {
  it('normalizes founder paid_by labels on patch', () => {
    const result = validatePatchExpense({ paid_by: ' paul ' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paid_by).toBe('Paul');
  });

  it('rejects UUID-like paid_by patch values', () => {
    const result = validatePatchExpense({ paid_by: 'bd695d11-0632-4a0a-b1d0-db43acf46a68' });

    expect(result).toEqual({
      ok: false,
      error: 'paid_by must be a stable human-readable payer label, not a UUID',
    });
  });
});
