import { describe, it, expect } from 'vitest';
import { salesOsEnabledForMember, PAUL_MEMBER_ID } from '@/lib/sales-access';
import { LEON_MEMBER_ID } from '@/lib/agent-access';

describe('salesOsEnabledForMember', () => {
  it('allows Paul', () => {
    expect(salesOsEnabledForMember(PAUL_MEMBER_ID)).toBe(true);
  });
  it('allows Leon (admin)', () => {
    expect(salesOsEnabledForMember(LEON_MEMBER_ID)).toBe(true);
  });
  it('denies others and null', () => {
    expect(salesOsEnabledForMember('c9677ade-e42c-4593-81c6-7a2108b145fd')).toBe(false);
    expect(salesOsEnabledForMember(null)).toBe(false);
  });
});
