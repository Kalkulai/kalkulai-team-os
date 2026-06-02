import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signGoogleOAuthState, verifyGoogleOAuthState } from '@/lib/oauth-state';

const SECRET = 'oauth-state-secret-with-enough-bytes';

beforeEach(() => {
  process.env.TEAM_OS_AUTH_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.TEAM_OS_AUTH_SECRET;
});

describe('Google OAuth state signing', () => {
  it('round-trips a signed user id', async () => {
    const state = await signGoogleOAuthState('member-1', 1_000_000);

    await expect(verifyGoogleOAuthState(state, 1_000_001)).resolves.toBe('member-1');
  });

  it('rejects a raw member id', async () => {
    await expect(verifyGoogleOAuthState('member-1', 1_000_001)).resolves.toBeNull();
  });

  it('rejects an expired state', async () => {
    const state = await signGoogleOAuthState('member-1', 1_000_000);

    await expect(verifyGoogleOAuthState(state, 1_000_700)).resolves.toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const state = await signGoogleOAuthState('member-1', 1_000_000);
    const [payload, sig] = state.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId: string;
    };
    decoded.userId = 'member-2';
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${sig}`;

    await expect(verifyGoogleOAuthState(tampered, 1_000_001)).resolves.toBeNull();
  });
});
