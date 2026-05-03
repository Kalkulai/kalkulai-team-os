import { describe, it, expect } from 'vitest';
import { extractLinearIdFromBranch, extractLinearIdFromText } from '@/lib/branch-parser';

describe('extractLinearIdFromBranch', () => {
  it('extracts a Linear identifier from a feature/<id>-<slug> branch', () => {
    expect(extractLinearIdFromBranch('feature/kal-42-add-login')).toBe('KAL-42');
  });

  it('returns null for branches without an identifier', () => {
    expect(extractLinearIdFromBranch('main')).toBeNull();
    expect(extractLinearIdFromBranch('master')).toBeNull();
    expect(extractLinearIdFromBranch('fix/some-bug')).toBeNull();
  });

  it('uppercases lowercased team prefixes', () => {
    expect(extractLinearIdFromBranch('kal-1')).toBe('KAL-1');
    expect(extractLinearIdFromBranch('user/leo/eng-99-x')).toBe('ENG-99');
  });

  it('handles already-uppercased identifiers', () => {
    expect(extractLinearIdFromBranch('ENG-1234/refactor')).toBe('ENG-1234');
  });

  it('returns null when team prefix is too short or too long', () => {
    expect(extractLinearIdFromBranch('a-1')).toBeNull();
    expect(extractLinearIdFromBranch('toolongprefix-42')).toBeNull();
  });

  it('matches the first identifier when multiple appear', () => {
    expect(extractLinearIdFromBranch('kal-1-then-eng-2')).toBe('KAL-1');
  });

  it('rejects digits as team prefix', () => {
    expect(extractLinearIdFromBranch('123-foo')).toBeNull();
  });

  it('extractLinearIdFromText is an alias of extractLinearIdFromBranch', () => {
    expect(extractLinearIdFromText('KAL-99: smoke-test PR')).toBe('KAL-99');
  });
});
