import { revalidatePath } from 'next/cache';

const DASHBOARD_PATHS = ['/dashboard', '/dashboard/board', '/dashboard/team'] as const;

export function revalidateDashboard(): void {
  for (const p of DASHBOARD_PATHS) revalidatePath(p);
}
