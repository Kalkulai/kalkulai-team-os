import { revalidatePath } from 'next/cache';
import { broadcastDashboardChange } from '@/lib/realtime';

const DASHBOARD_PATHS = ['/dashboard', '/dashboard/board', '/dashboard/team'] as const;

/** Revalidate all dashboard routes AND fire a realtime broadcast so connected
 * tabs (iPad web-clip, laptop browser, etc.) router.refresh() immediately
 * instead of waiting for the 30s polling fallback. The broadcast is
 * fire-and-forget — never blocks the API response. */
export function revalidateDashboard(source = 'mutation'): void {
  for (const p of DASHBOARD_PATHS) revalidatePath(p);
  void broadcastDashboardChange(source).catch(() => {
    // best-effort — realtime is a nice-to-have, not blocking
  });
}
