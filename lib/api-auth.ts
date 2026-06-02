import { NextRequest } from 'next/server';
import { hasValidServiceBearer } from '@/lib/auth-context';

/**
 * Accept either DASHBOARD_API_SECRET (Hermes/manual callers) or CRON_SECRET
 * (Vercel-Cron auto-attaches this header when CRON_SECRET is set in env).
 * Both must be present in Vercel-Env for the respective callers to auth.
 */
export function requireApiAuth(req: NextRequest): boolean {
  return hasValidServiceBearer(req);
}
