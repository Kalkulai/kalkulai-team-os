import { describe, expect, it } from 'vitest';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  it('allows requests up to the configured limit and blocks the next one', () => {
    const opts = { limit: 2, windowMs: 60_000, now: 1_000 };

    expect(checkRateLimit('login:1.2.3.4', opts).ok).toBe(true);
    expect(checkRateLimit('login:1.2.3.4', { ...opts, now: 2_000 }).ok).toBe(true);

    const blocked = checkRateLimit('login:1.2.3.4', { ...opts, now: 3_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(58);
  });

  it('resets a bucket after the window expires', () => {
    const opts = { limit: 1, windowMs: 10_000, now: 1_000 };

    expect(checkRateLimit('api:1.2.3.4', opts).ok).toBe(true);
    expect(checkRateLimit('api:1.2.3.4', { ...opts, now: 2_000 }).ok).toBe(false);
    expect(checkRateLimit('api:1.2.3.4', { ...opts, now: 11_001 }).ok).toBe(true);
  });
});

describe('getClientIp', () => {
  it('prefers the first forwarded IP and falls back to loopback', () => {
    const forwarded = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
    });
    const empty = new Request('http://localhost');

    expect(getClientIp(forwarded)).toBe('203.0.113.10');
    expect(getClientIp(empty)).toBe('127.0.0.1');
  });
});
