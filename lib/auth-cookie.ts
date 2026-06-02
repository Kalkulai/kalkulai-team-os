/**
 * HMAC-signiertes Auth-Cookie für das Team-OS Dashboard.
 *
 * Format:
 *   - Legacy: `<exp_unix>.<hmac_base64url>`
 *   - Member-Session: `<payload_base64url>.<hmac_base64url>`
 *
 * `payload_base64url` ist JSON mit `exp` und optional `memberId`.
 *
 * Edge-Runtime-kompatibel (verwendet `crypto.subtle`, kein Node-`crypto`).
 *
 * Konsumiert von:
 *   - `middleware.ts` (verify auf jedem Request)
 *   - `app/api/auth/login/route.ts` (sign nach Passwort-Check)
 */

export const AUTH_COOKIE_NAME = 'team-os-auth';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

export interface AuthCookiePayload {
  exp: number;
  memberId?: string;
}

function getSecret(): string {
  const s = process.env.TEAM_OS_AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error('TEAM_OS_AUTH_SECRET missing or too short (min 16 chars)');
  }
  return s;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

function encodePayload(payload: AuthCookiePayload): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
}

function decodePayload(raw: string): AuthCookiePayload | null {
  if (/^\d+$/.test(raw)) return { exp: Number.parseInt(raw, 10) };
  try {
    const decoded = base64UrlDecode(raw);
    const parsed = JSON.parse(decoded) as Partial<AuthCookiePayload>;
    if (!Number.isFinite(parsed.exp)) return null;
    return {
      exp: Number(parsed.exp),
      memberId: typeof parsed.memberId === 'string' && parsed.memberId ? parsed.memberId : undefined,
    };
  } catch {
    return null;
  }
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
  return base64UrlEncode(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Erzeugt ein neues signiertes Cookie. `nowSeconds` ist optional (für Tests).
 */
export async function signAuthCookie(
  ttlSeconds: number = AUTH_COOKIE_MAX_AGE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  memberId?: string,
): Promise<string> {
  const exp = nowSeconds + ttlSeconds;
  const payload = memberId ? encodePayload({ exp, memberId }) : String(exp);
  const sig = await hmacSign(payload, getSecret());
  return `${payload}.${sig}`;
}

/**
 * Prüft Cookie. Returnt `true` wenn signiert + nicht abgelaufen.
 */
export async function verifyAuthCookie(
  cookie: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  options?: { requireMember?: boolean },
): Promise<boolean> {
  const payload = await parseAuthCookie(cookie, nowSeconds);
  if (!payload) return false;
  if (options?.requireMember && !payload.memberId) return false;
  return true;
}

export async function parseAuthCookie(
  cookie: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<AuthCookiePayload | null> {
  if (!cookie) return null;
  const dot = cookie.indexOf('.');
  if (dot <= 0 || dot === cookie.length - 1) return null;
  const rawPayload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const payload = decodePayload(rawPayload);
  if (!payload || payload.exp <= nowSeconds) return null;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }
  const expected = await hmacSign(rawPayload, secret);
  return timingSafeEqual(sig, expected) ? payload : null;
}

/**
 * Vergleicht Plain-Password mit dem konfigurierten `TEAM_OS_ACCESS_PASSWORD`.
 * Timing-safe.
 */
export function checkPassword(plain: string): boolean {
  const expected = process.env.TEAM_OS_ACCESS_PASSWORD;
  if (!expected || expected.length === 0) return false;
  if (typeof plain !== 'string') return false;
  return timingSafeEqual(plain, expected);
}
