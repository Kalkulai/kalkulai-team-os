import { describe, expect, it } from 'vitest';
import { isLeonMemberId, LEON_MEMBER_ID } from '@/lib/agent-access';

describe('agent access', () => {
  it('allows only the Leon member id for the cockpit profile gate', () => {
    expect(isLeonMemberId(LEON_MEMBER_ID)).toBe(true);
    expect(isLeonMemberId('c9677ade-e42c-4593-81c6-7a2108b145fd')).toBe(false);
    expect(isLeonMemberId(null)).toBe(false);
  });
});
