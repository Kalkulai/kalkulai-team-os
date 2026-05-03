import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

// Mirrors verifyGithubSignature from app/api/webhooks/github/pr-merged/route.ts.
// Kept inline because the route file imports next/server which isn't available
// in the Vitest node environment.
function verifyGithubSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expected = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

const SECRET = 'test-secret';
const BODY = JSON.stringify({ action: 'closed', pull_request: { merged: true } });
const validSig = () => 'sha256=' + crypto.createHmac('sha256', SECRET).update(BODY).digest('hex');

describe('verifyGithubSignature', () => {
  it('accepts a correctly-signed payload', () => {
    expect(verifyGithubSignature(BODY, validSig(), SECRET)).toBe(true);
  });

  it('rejects when signature header is missing', () => {
    expect(verifyGithubSignature(BODY, null, SECRET)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const wrong = 'sha256=' + crypto.createHmac('sha256', 'other-secret').update(BODY).digest('hex');
    expect(verifyGithubSignature(BODY, wrong, SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const sig = validSig();
    const tampered = BODY.replace('"merged":true', '"merged":false');
    expect(verifyGithubSignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects malformed signatures without throwing', () => {
    expect(verifyGithubSignature(BODY, 'sha256=not-hex-and-wrong-length', SECRET)).toBe(false);
    expect(verifyGithubSignature(BODY, '', SECRET)).toBe(false);
  });

  it('rejects signatures of differing byte length without throwing (timingSafeEqual guard)', () => {
    expect(verifyGithubSignature(BODY, 'sha256=abcd', SECRET)).toBe(false);
  });
});
