import { NextRequest } from 'next/server';

/**
 * Accept either DASHBOARD_API_SECRET (Hermes/manual callers) or CRON_SECRET
 * (Vercel-Cron auto-attaches this header when CRON_SECRET is set in env).
 * Both must be present in Vercel-Env for the respective callers to auth.
 */
export function requireApiAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const dashboard = process.env.DASHBOARD_API_SECRET;
  const cron = process.env.CRON_SECRET;
  if (dashboard && auth === `Bearer ${dashboard}`) return true;
  if (cron && auth === `Bearer ${cron}`) return true;
  return false;
}
