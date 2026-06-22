import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { aggregateExist } from '@/lib/exist-aggregate';
import type { ExistBudget, FinanceExpense } from '@/types/finance-expense';

const SECRET = 'unit-test-secret';
const insertExpenseMock = vi.fn();

vi.mock('@/lib/expense-store', () => ({
  insertExpense: (...args: unknown[]) => insertExpenseMock(...args),
  listExpenses: vi.fn(),
  patchExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));

import { POST } from '@/app/api/expenses/route';

const budget: ExistBudget = {
  sachmittel_total_eur: 10_000,
  coaching_total_eur: 5_000,
  stipend_total_eur: 36_000,
  network_support_total_eur: 2_000,
  funding_start: '2026-08-01',
  funding_end: '2027-07-31',
};

function expense(patch: Partial<FinanceExpense> = {}): FinanceExpense {
  return {
    id: 'expense-1',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    expense_date: '2026-06-01',
    vendor: 'Default Vendor',
    description: 'Default expense',
    category: null,
    amount_eur: 100,
    paid_by: 'Felix',
    legal_entity: 'private',
    scenario: 'exist',
    funding_pot: 'unclear',
    fundability: 'unclear',
    reimbursable: 'unclear',
    reimbursement_status: 'open',
    receipt_status: 'missing',
    approval_status: 'not_checked',
    source: 'manual_ui',
    source_message: null,
    note: null,
    idempotency_key: null,
    ...patch,
  };
}

function postRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/expenses', {
    method: 'POST',
    headers: new Headers({
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
    }),
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.DASHBOARD_API_SECRET = SECRET;
  insertExpenseMock.mockReset();
});

describe('aggregateExist', () => {
  it('uses defaults and zeroed aggregates for an empty ledger', () => {
    const data = aggregateExist([], budget, new Date('2026-06-22T12:00:00.000Z'));

    expect(data.data_origin).toBe('defaults');
    expect(data.currency).toBe('EUR');
    expect(data.budget).toEqual(budget);
    expect(data.pots).toEqual({
      sachmittel_spent_eur: 0,
      sachmittel_remaining_eur: 10_000,
      coaching_spent_eur: 0,
      coaching_remaining_eur: 5_000,
    });
    expect(data.reimbursements).toMatchObject({
      pending_reimbursements_eur: 0,
      open_reimbursement_count: 0,
      overdue_reimbursement_count: 0,
      avg_days_outstanding: 0,
      oldest_open_days: 0,
      largest_open_items: [],
      ampel: 'green',
    });
    expect(data.founder_out_of_pocket_by_person).toEqual([]);
    expect(data.non_fundable_spend_eur).toBe(0);
    expect(data.unclear_items_count).toBe(0);
  });

  it('counts pending reimbursements strictly from reimbursable=yes and open/submitted/approved statuses', () => {
    const data = aggregateExist(
      [
        expense({ id: 'open', amount_eur: 100, reimbursable: 'yes', reimbursement_status: 'open' }),
        expense({ id: 'submitted', amount_eur: 200, reimbursable: 'yes', reimbursement_status: 'submitted' }),
        expense({ id: 'approved', amount_eur: 300, reimbursable: 'yes', reimbursement_status: 'approved' }),
        expense({ id: 'unclear', amount_eur: 400, reimbursable: 'unclear', reimbursement_status: 'open' }),
        expense({ id: 'reimbursed', amount_eur: 500, reimbursable: 'yes', reimbursement_status: 'reimbursed' }),
        expense({ id: 'rejected', amount_eur: 600, reimbursable: 'yes', reimbursement_status: 'rejected' }),
      ],
      budget,
      new Date('2026-06-22T12:00:00.000Z'),
    );

    expect(data.data_origin).toBe('db');
    expect(data.reimbursements.pending_reimbursements_eur).toBe(600);
    expect(data.reimbursements.open_reimbursement_count).toBe(3);
  });

  it('groups founder out-of-pocket broadly by private paid_by including unclear statuses', () => {
    const data = aggregateExist(
      [
        expense({ amount_eur: 100, paid_by: 'Felix', legal_entity: 'private', reimbursement_status: 'open' }),
        expense({ amount_eur: 200, paid_by: 'Felix', legal_entity: 'private', reimbursement_status: 'rejected' }),
        expense({ amount_eur: 300, paid_by: 'Paul', legal_entity: 'private', reimbursement_status: 'approved' }),
        expense({ amount_eur: 400, paid_by: 'Felix', legal_entity: 'private', reimbursement_status: 'n_a' }),
        expense({ amount_eur: 500, paid_by: 'Leon', legal_entity: 'private', reimbursement_status: 'reimbursed' }),
        expense({ amount_eur: 600, paid_by: 'GmbH', legal_entity: 'gmbh', reimbursement_status: 'open' }),
      ],
      budget,
      new Date('2026-06-22T12:00:00.000Z'),
    );

    expect(data.founder_out_of_pocket_by_person).toEqual([
      { paid_by: 'Felix', amount_eur: 300 },
      { paid_by: 'Paul', amount_eur: 300 },
    ]);
  });

  it('calculates aging and ampel thresholds at 13, 14, 30, and 31 days', () => {
    const now = new Date('2026-06-22T12:00:00.000Z');

    expect(
      aggregateExist(
        [expense({ expense_date: '2026-06-09', reimbursable: 'yes', reimbursement_status: 'open' })],
        budget,
        now,
      ).reimbursements.ampel,
    ).toBe('green');
    expect(
      aggregateExist(
        [expense({ expense_date: '2026-06-08', reimbursable: 'yes', reimbursement_status: 'open' })],
        budget,
        now,
      ).reimbursements.ampel,
    ).toBe('green');
    expect(
      aggregateExist(
        [expense({ expense_date: '2026-05-23', reimbursable: 'yes', reimbursement_status: 'open' })],
        budget,
        now,
      ).reimbursements.ampel,
    ).toBe('yellow');

    const red = aggregateExist(
      [expense({ expense_date: '2026-05-22', reimbursable: 'yes', reimbursement_status: 'open' })],
      budget,
      now,
    );
    expect(red.reimbursements.ampel).toBe('red');
    expect(red.reimbursements.oldest_open_days).toBe(31);
    expect(red.reimbursements.avg_days_outstanding).toBe(31);
    expect(red.reimbursements.overdue_reimbursement_count).toBe(1);
  });

  it('clamps future-dated open reimbursements to zero outstanding days', () => {
    const data = aggregateExist(
      [expense({ expense_date: '2026-06-25', reimbursable: 'yes', reimbursement_status: 'open' })],
      budget,
      new Date('2026-06-22T12:00:00.000Z'),
    );

    expect(data.reimbursements.oldest_open_days).toBe(0);
    expect(data.reimbursements.avg_days_outstanding).toBe(0);
    expect(data.reimbursements.overdue_reimbursement_count).toBe(0);
    expect(data.reimbursements.largest_open_items[0]?.days_outstanding).toBe(0);
    expect(data.reimbursements.ampel).toBe('green');
  });

  it('returns largest open items by amount with older date as the tiebreaker', () => {
    const data = aggregateExist(
      [
        expense({ id: 'small', amount_eur: 50, expense_date: '2026-06-01', reimbursable: 'yes', reimbursement_status: 'open' }),
        expense({ id: 'newer-300', amount_eur: 300, expense_date: '2026-06-10', reimbursable: 'yes', reimbursement_status: 'open' }),
        expense({ id: 'older-300', amount_eur: 300, expense_date: '2026-06-05', reimbursable: 'yes', reimbursement_status: 'open' }),
        expense({ id: '500', amount_eur: 500, expense_date: '2026-06-15', reimbursable: 'yes', reimbursement_status: 'open' }),
        expense({ id: '400', amount_eur: 400, expense_date: '2026-06-16', reimbursable: 'yes', reimbursement_status: 'submitted' }),
        expense({ id: '200', amount_eur: 200, expense_date: '2026-06-17', reimbursable: 'yes', reimbursement_status: 'approved' }),
      ],
      budget,
      new Date('2026-06-22T12:00:00.000Z'),
    );

    expect(data.reimbursements.largest_open_items.map((item) => item.id)).toEqual([
      '500',
      '400',
      'older-300',
      'newer-300',
      '200',
    ]);
  });

  it('calculates pot spend, non-fundable spend, and unclear item count from the specified fields', () => {
    const data = aggregateExist(
      [
        expense({ amount_eur: 1000, funding_pot: 'sachmittel', fundability: 'fundable' }),
        expense({ amount_eur: 250, funding_pot: 'sachmittel', fundability: 'unclear' }),
        expense({ amount_eur: 400, funding_pot: 'coaching', fundability: 'fundable' }),
        expense({ amount_eur: 75, funding_pot: 'non_fundable', fundability: 'non_fundable' }),
        expense({ amount_eur: 25, funding_pot: 'unclear', fundability: 'fundable' }),
      ],
      budget,
      new Date('2026-06-22T12:00:00.000Z'),
    );

    expect(data.pots).toEqual({
      sachmittel_spent_eur: 1250,
      sachmittel_remaining_eur: 8750,
      coaching_spent_eur: 400,
      coaching_remaining_eur: 4600,
    });
    expect(data.non_fundable_spend_eur).toBe(75);
    expect(data.unclear_items_count).toBe(2);
  });
});

describe('POST /api/expenses boundary validation', () => {
  it('rejects an invalid enum value with 400 before insert', async () => {
    const res = await POST(
      postRequest({
        expense_date: '2026-06-22',
        vendor: 'OpenAI',
        description: 'API credits',
        amount_eur: 42,
        paid_by: 'Felix',
        legal_entity: 'private',
        scenario: 'exist',
        funding_pot: 'definitely-not-valid',
        fundability: 'unclear',
        reimbursable: 'unclear',
        reimbursement_status: 'open',
        receipt_status: 'available',
        source: 'hermes',
        note: 'Invalid funding pot test.',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "funding_pot must be one of: sachmittel, coaching, stipend, non_fundable, unclear" });
    expect(insertExpenseMock).not.toHaveBeenCalled();
  });

  it('returns duplicate_ignored when idempotency conflict creates no row', async () => {
    insertExpenseMock.mockResolvedValue({ created: false, expense: null });

    const res = await POST(
      postRequest({
        expense_date: '2026-06-22',
        vendor: 'OpenAI',
        description: 'API credits',
        amount_eur: 42,
        paid_by: 'Felix',
        legal_entity: 'private',
        scenario: 'exist',
        funding_pot: 'unclear',
        fundability: 'unclear',
        reimbursable: 'unclear',
        reimbursement_status: 'open',
        receipt_status: 'available',
        source: 'hermes',
        note: 'Duplicate idempotency test.',
        idempotency_key: 'unit-test-key',
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: false, status: 'duplicate_ignored' });
    expect(insertExpenseMock).toHaveBeenCalledOnce();
  });
});
