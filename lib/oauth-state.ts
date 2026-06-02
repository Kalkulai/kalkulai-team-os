import { timingSafeEqual } from 'node:crypto';

const STATE_TTL_SECONDS = 10 * 60;

type OAuthStatePayload = {
  userId: string;
  exp: number;
  nonce: string;
};

function getSecret(): string {
  const secret = process.env.TEAM_OS_AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('TEAM_OS_AUTH_SECRET missing or too short (min 16 chars)');
  }
  return secret;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Buffer.from(sig).toString('base64url');
}

function encodePayload(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(encoded: string): OAuthStatePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.exp !== 'number') return null;
    if (typeof parsed.nonce !== 'string' || parsed.nonce.length < 16) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function signGoogleOAuthState(
  userId: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload = encodePayload({
    userId,
    exp: nowSeconds + STATE_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  });
  const sig = await hmacSign(payload, getSecret());
  return `${payload}.${sig}`;
}

export async function verifyGoogleOAuthState(
  state: string | null,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  if (!state) return null;
  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;
  const payloadPart = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const payload = decodePayload(payloadPart);
  if (!payload || payload.exp <= nowSeconds) return null;

  let expected: string;
  try {
    expected = await hmacSign(payloadPart, getSecret());
  } catch {
    return null;
  }
  return safeEqual(sig, expected) ? payload.userId : null;
}
