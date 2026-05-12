/**
 * HMAC-signiertes Auth-Cookie für das Team-OS Dashboard.
 *
 * Format: `<exp_unix>.<hmac_base64url>`
 *   - `exp_unix`: Unix-Timestamp (Sekunden) wann das Cookie ungültig wird
 *   - `hmac`: HMAC-SHA-256 von `exp_unix` mit `TEAM_OS_AUTH_SECRET`, Base64URL-encoded
 *
 * Edge-Runtime-kompatibel (verwendet `crypto.subtle`, kein Node-`crypto`).
 *
 * Konsumiert von:
 *   - `middleware.ts` (verify auf jedem Request)
 *   - `app/api/auth/login/route.ts` (sign nach Passwort-Check)
 */

export const AUTH_COOKIE_NAME = 'team-os-auth';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

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
): Promise<string> {
  const exp = nowSeconds + ttlSeconds;
  const sig = await hmacSign(String(exp), getSecret());
  return `${exp}.${sig}`;
}

/**
 * Prüft Cookie. Returnt `true` wenn signiert + nicht abgelaufen.
 */
export async function verifyAuthCookie(
  cookie: string | undefined | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!cookie) return false;
  const dot = cookie.indexOf('.');
  if (dot <= 0 || dot === cookie.length - 1) return false;
  const exp = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expNum = Number.parseInt(exp, 10);
  if (!Number.isFinite(expNum) || expNum <= nowSeconds) return false;
  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return false;
  }
  const expected = await hmacSign(exp, secret);
  return timingSafeEqual(sig, expected);
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
