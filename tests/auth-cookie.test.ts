import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  signAuthCookie,
  verifyAuthCookie,
  parseAuthCookie,
  checkPassword,
  AUTH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/auth-cookie';

const SECRET = 'test-secret-with-enough-bytes-1234';
const PASSWORD = 'felix-and-paul-shared-key';

beforeEach(() => {
  process.env.TEAM_OS_AUTH_SECRET = SECRET;
  process.env.TEAM_OS_ACCESS_PASSWORD = PASSWORD;
});

afterEach(() => {
  delete process.env.TEAM_OS_AUTH_SECRET;
  delete process.env.TEAM_OS_ACCESS_PASSWORD;
});

describe('signAuthCookie + verifyAuthCookie', () => {
  it('signs and verifies a fresh cookie', async () => {
    const c = await signAuthCookie();
    expect(c).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
    expect(await verifyAuthCookie(c)).toBe(true);
  });

  it('signs and verifies a member session cookie', async () => {
    const c = await signAuthCookie(undefined, 1_000_000_000, 'member-1');
    expect(await verifyAuthCookie(c, 1_000_000_001, { requireMember: true })).toBe(true);
    expect(await parseAuthCookie(c, 1_000_000_001)).toEqual({
      exp: 1_000_000_000 + AUTH_COOKIE_MAX_AGE_SECONDS,
      memberId: 'member-1',
    });
  });

  it('can require a member identity in the cookie payload', async () => {
    const legacy = await signAuthCookie(undefined, 1_000_000_000);
    expect(await verifyAuthCookie(legacy, 1_000_000_001)).toBe(true);
    expect(await verifyAuthCookie(legacy, 1_000_000_001, { requireMember: true })).toBe(false);
  });

  it('rejects an empty / undefined cookie', async () => {
    expect(await verifyAuthCookie(undefined)).toBe(false);
    expect(await verifyAuthCookie(null)).toBe(false);
    expect(await verifyAuthCookie('')).toBe(false);
  });

  it('rejects a malformed cookie (no dot, no signature)', async () => {
    expect(await verifyAuthCookie('garbage')).toBe(false);
    expect(await verifyAuthCookie('1234567890')).toBe(false);
    expect(await verifyAuthCookie('1234567890.')).toBe(false);
    expect(await verifyAuthCookie('.signature')).toBe(false);
  });

  it('rejects an expired cookie', async () => {
    const now = 1_000_000_000;
    const c = await signAuthCookie(10, now);
    expect(await verifyAuthCookie(c, now + 20)).toBe(false);
  });

  it('rejects a tampered cookie (signature swapped)', async () => {
    const c1 = await signAuthCookie(60, 1_000_000_000);
    const c2 = await signAuthCookie(60, 1_000_000_500);
    const [exp1] = c1.split('.');
    const [, sig2] = c2.split('.');
    const tampered = `${exp1}.${sig2}`;
    expect(await verifyAuthCookie(tampered, 1_000_000_000)).toBe(false);
  });

  it('rejects when the signing secret has changed', async () => {
    const c = await signAuthCookie();
    process.env.TEAM_OS_AUTH_SECRET = 'different-secret-with-enough-bytes';
    expect(await verifyAuthCookie(c)).toBe(false);
  });

  it('defaults to a 30-day TTL', async () => {
    const now = 1_000_000_000;
    const c = await signAuthCookie(undefined, now);
    const [exp] = c.split('.');
    expect(Number(exp) - now).toBe(AUTH_COOKIE_MAX_AGE_SECONDS);
  });
});

describe('checkPassword', () => {
  it('returns true for an exact match', () => {
    expect(checkPassword(PASSWORD)).toBe(true);
  });

  it('returns false for a wrong password', () => {
    expect(checkPassword('nope')).toBe(false);
    expect(checkPassword(PASSWORD + 'x')).toBe(false);
    expect(checkPassword(PASSWORD.slice(0, -1))).toBe(false);
  });

  it('returns false for empty / non-string input', () => {
    expect(checkPassword('')).toBe(false);
    // @ts-expect-error - testing runtime guard for non-string
    expect(checkPassword(undefined)).toBe(false);
  });

  it('returns false when no password is configured', () => {
    delete process.env.TEAM_OS_ACCESS_PASSWORD;
    expect(checkPassword(PASSWORD)).toBe(false);
  });
});
