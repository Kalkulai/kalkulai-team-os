import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';

const SECRET = 'unit-test-secret-1234';

function buildRequest(authHeader?: string | null): NextRequest {
  const headers = new Headers();
  if (authHeader !== null && authHeader !== undefined) {
    headers.set('authorization', authHeader);
  }
  return new NextRequest('http://localhost/api/test', { headers });
}

describe('requireApiAuth', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.DASHBOARD_API_SECRET;
    process.env.DASHBOARD_API_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.DASHBOARD_API_SECRET = original;
  });

  it('accepts a correctly-formatted Bearer token', () => {
    expect(requireApiAuth(buildRequest(`Bearer ${SECRET}`))).toBe(true);
  });

  it('rejects when authorization header is missing', () => {
    expect(requireApiAuth(buildRequest(null))).toBe(false);
  });

  it('rejects when authorization header is empty', () => {
    expect(requireApiAuth(buildRequest(''))).toBe(false);
  });

  it('rejects a wrong secret', () => {
    expect(requireApiAuth(buildRequest('Bearer wrong-secret'))).toBe(false);
  });

  it('rejects bare secret without Bearer prefix', () => {
    expect(requireApiAuth(buildRequest(SECRET))).toBe(false);
  });

  it('rejects a different scheme like Basic', () => {
    expect(requireApiAuth(buildRequest(`Basic ${SECRET}`))).toBe(false);
  });

  it('is case-sensitive on the secret value', () => {
    expect(requireApiAuth(buildRequest(`Bearer ${SECRET.toUpperCase()}`))).toBe(false);
  });
});
