import { describe, it, expect } from 'vitest';
import { backlogEnabledForMember, defaultStepStatus } from '../lib/backlog-access';

const FELIX = 'c9677ade-e42c-4593-81c6-7a2108b145fd';
const LEON = 'bd695d11-0632-4a0a-b1d0-db43acf46a68';

describe('backlog-access', () => {
  it('enabled only for Felix', () => {
    expect(backlogEnabledForMember(FELIX)).toBe(true);
    expect(backlogEnabledForMember(LEON)).toBe(false);
    expect(backlogEnabledForMember(null)).toBe(false);
    expect(backlogEnabledForMember(undefined)).toBe(false);
  });

  it('new steps default to backlog for Felix, null otherwise', () => {
    expect(defaultStepStatus(FELIX)).toBe('backlog');
    expect(defaultStepStatus(LEON)).toBe(null);
    expect(defaultStepStatus(undefined)).toBe(null);
  });
});
