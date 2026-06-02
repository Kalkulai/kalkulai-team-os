import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requireActor } from '@/lib/auth-context';
import { AUTH_COOKIE_NAME, signAuthCookie } from '@/lib/auth-cookie';

const SECRET = 'test-secret-with-enough-bytes-1234';
const HERMES = 'hermes-token';

function request(init: ConstructorParameters<typeof NextRequest>[1] = {}): NextRequest {
  return new NextRequest('http://localhost/api/test', init);
}

describe('requireActor', () => {
  beforeEach(() => {
    process.env.TEAM_OS_AUTH_SECRET = SECRET;
    process.env.HERMES_DASHBOARD_TOKEN = HERMES;
  });

  afterEach(() => {
    delete process.env.TEAM_OS_AUTH_SECRET;
    delete process.env.HERMES_DASHBOARD_TOKEN;
  });

  it('resolves signed member sessions', async () => {
    const cookie = await signAuthCookie(undefined, Math.floor(Date.now() / 1000), 'member-1');
    const actor = await requireActor(request({
      headers: { cookie: `${AUTH_COOKIE_NAME}=${cookie}` },
    }), { scopes: ['hermes:chat'] });

    expect(actor).toMatchObject({
      type: 'member',
      id: 'member-1',
      memberId: 'member-1',
    });
  });

  it('rejects legacy cookies when a member identity is missing', async () => {
    const cookie = await signAuthCookie(undefined, Math.floor(Date.now() / 1000));
    const actor = await requireActor(request({
      headers: { cookie: `${AUTH_COOKIE_NAME}=${cookie}` },
    }));

    expect(actor).toBeNull();
  });

  it('resolves scoped Hermes service tokens', async () => {
    const actor = await requireActor(request({
      headers: { authorization: `Bearer ${HERMES}` },
    }), { scopes: ['campaigns:write'], allowMember: false });

    expect(actor).toMatchObject({
      type: 'hermes',
      id: 'hermes',
    });
  });
});
