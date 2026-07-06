import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, parseAuthCookie } from '@/lib/auth-cookie';

export type ActorType = 'member' | 'hermes' | 'cron' | 'ops' | 'legacy_admin';

export type ActorScope =
  | 'agents:write'
  | 'briefing:write'
  | 'campaigns:read'
  | 'campaigns:write'
  | 'claude:write'
  | 'conflicts:read'
  | 'hermes:chat'
  | 'kpis:read'
  | 'kpis:write'
  | 'linear:write'
  | 'metrics:read'
  | 'metrics:write'
  | 'posthog:read'
  | 'recap:write'
  | 'sales:read'
  | 'sales:write'
  | 'tasks:write'
  | 'vault:read'
  | '*';

export interface AuthActor {
  type: ActorType;
  id: string;
  memberId?: string;
  scopes: ActorScope[];
}

export interface ActorRequirement {
  scopes?: ActorScope[];
  allowMember?: boolean;
}

const MEMBER_SCOPES: ActorScope[] = [
  'campaigns:read',
  'conflicts:read',
  'hermes:chat',
  'kpis:read',
  'kpis:write',
  'metrics:read',
  'sales:read',
  'sales:write',
  'tasks:write',
  'vault:read',
];

const TOKEN_ACTORS: Array<{ env: string; type: ActorType; id: string; scopes: ActorScope[] }> = [
  {
    env: 'HERMES_DASHBOARD_TOKEN',
    type: 'hermes',
    id: 'hermes',
    scopes: ['*'],
  },
  {
    env: 'CRON_DASHBOARD_TOKEN',
    type: 'cron',
    id: 'cron',
    scopes: ['*'],
  },
  {
    env: 'OPS_DASHBOARD_TOKEN',
    type: 'ops',
    id: 'ops',
    scopes: ['*'],
  },
  {
    env: 'DASHBOARD_API_SECRET',
    type: 'legacy_admin',
    id: 'dashboard-api-secret',
    scopes: ['*'],
  },
  {
    env: 'CRON_SECRET',
    type: 'cron',
    id: 'cron-secret',
    scopes: ['*'],
  },
];

function bearerValue(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice('Bearer '.length);
  return token || null;
}

function scopesAllow(actorScopes: ActorScope[], required: ActorScope[]): boolean {
  if (!required.length) return true;
  if (actorScopes.includes('*')) return true;
  return required.every((scope) => actorScopes.includes(scope));
}

export function resolveBearerActor(req: NextRequest): AuthActor | null {
  const bearer = bearerValue(req);
  if (!bearer) return null;
  for (const candidate of TOKEN_ACTORS) {
    const token = process.env[candidate.env];
    if (token && bearer === token) {
      return {
        type: candidate.type,
        id: candidate.id,
        scopes: candidate.scopes,
      };
    }
  }
  return null;
}

export function hasValidServiceBearer(req: NextRequest): boolean {
  return resolveBearerActor(req) !== null;
}

export async function resolveActor(req: NextRequest): Promise<AuthActor | null> {
  const bearerActor = resolveBearerActor(req);
  if (bearerActor) return bearerActor;

  const payload = await parseAuthCookie(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!payload?.memberId) return null;
  return {
    type: 'member',
    id: payload.memberId,
    memberId: payload.memberId,
    scopes: MEMBER_SCOPES,
  };
}

export async function requireActor(
  req: NextRequest,
  requirement: ActorRequirement = {},
): Promise<AuthActor | null> {
  const actor = await resolveActor(req);
  if (!actor) return null;
  if (actor.type === 'member' && requirement.allowMember === false) return null;
  if (!scopesAllow(actor.scopes, requirement.scopes ?? [])) return null;
  return actor;
}

export function actorCan(actor: AuthActor, scopes: ActorScope[]): boolean {
  return scopesAllow(actor.scopes, scopes);
}
