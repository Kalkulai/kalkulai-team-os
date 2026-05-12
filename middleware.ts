import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, verifyAuthCookie } from '@/lib/auth-cookie';

/**
 * Root-Middleware: Team-Access-Guard.
 *
 * Drei Pfad-Klassen:
 *
 * 1. **Public paths** — werden immer durchgelassen:
 *    - `/login` und `/api/auth/*` (Login-Flow selbst)
 *    - OAuth-Callbacks (Google Calendar, kein Cookie da Browser-Redirect von extern)
 *    - GitHub-Webhooks (HMAC-verified im Handler)
 *    - `/api/members` (vom Client-Bundle vor Auth gebraucht → wird vom Login-Page-State gelesen)
 *
 * 2. **API paths** (`/api/*`) — durchlassen wenn ENTWEDER:
 *    - `Authorization: Bearer …` Header gesetzt ist (Hermes / Server-to-Server / Client-Bundle)
 *    - ODER ein gültiges Auth-Cookie da ist
 *    Sonst: 401 JSON.
 *
 * 3. **Alles andere** (HTML-Seiten) — verlangt Auth-Cookie. Ohne → Redirect auf `/login`.
 *
 * Hermes ist unbetroffen: Server-to-Server-Calls senden den Bearer-Header und
 * gehen direkt durch (Klasse 2).
 */

const PUBLIC_EXACT = new Set<string>([
  '/login',
  '/favicon.ico',
  '/robots.txt',
]);

const PUBLIC_PREFIXES = [
  '/api/auth/',            // Login/Logout
  '/api/oauth/google/',    // Calendar-OAuth-Flow (Browser-Redirect von Google)
  '/api/webhooks/',        // GitHub-Webhooks (HMAC-secured)
  '/api/members',          // Vom Client-Bundle vor Auth gebraucht (Member-Dropdown)
];

function isPublic(path: string): boolean {
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (isPublic(path)) return NextResponse.next();

  const isApi = path.startsWith('/api/');
  const hasBearer = req.headers.get('authorization')?.startsWith('Bearer ');

  // API: Bearer (Hermes) ODER Cookie reicht
  if (isApi && hasBearer) return NextResponse.next();

  const cookieValue = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const cookieOk = await verifyAuthCookie(cookieValue);
  if (cookieOk) return NextResponse.next();

  // Unauthenticated
  if (isApi) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  const redirect = path + (req.nextUrl.search ?? '');
  if (redirect !== '/login') loginUrl.searchParams.set('redirect', redirect);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Alle Routes außer Static-Assets matchen
  matcher: ['/((?!_next/static|_next/image|_next/data|.*\\..*).*)'],
};
