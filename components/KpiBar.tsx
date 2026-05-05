import type { CSSProperties } from 'react';

export function KpiBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;
  const tone =
    pct >= 100
      ? { text: 'text-emerald-600 dark:text-emerald-400', bar: 'from-emerald-500 to-emerald-400' }
      : pct >= 60
      ? { text: 'text-amber-600 dark:text-amber-400', bar: 'from-amber-500 to-amber-400' }
      : { text: 'text-rose-600 dark:text-rose-400', bar: 'from-rose-500 to-rose-400' };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`text-xs tabular-nums ${tone.text}`}>{pct}%</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular-nums ${tone.text}`}>{actual}</span>
        <span className="text-sm text-muted-foreground tabular-nums">/ {target}</span>
      </div>
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-foreground/[0.06] dark:bg-foreground/[0.08]"
        style={{ '--kpi-pct': `${pct}%` } as CSSProperties}
      >
        <div
          className={`absolute inset-y-0 left-0 w-[var(--kpi-pct)] origin-left rounded-full bg-gradient-to-r ${tone.bar} animate-[kpi-fill_900ms_cubic-bezier(0.22,1,0.36,1)_forwards]`}
        />
      </div>
    </div>
  );
}
