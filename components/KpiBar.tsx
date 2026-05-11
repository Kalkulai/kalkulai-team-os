export function KpiBar({ label, actual, target }: { label: string; actual: number; target: number }) {
  const pct = target > 0 ? Math.min(Math.round((actual / target) * 100), 100) : 0;
  const barCls = pct >= 100 ? 'bar ok' : 'bar';

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="ovr">{label}</span>
        <span className="tnum text-[11px] font-medium text-[var(--ink-3)]">{pct}%</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tnum text-[22px] font-semibold leading-none tracking-[-0.015em] text-[var(--ink-1)]">
          {actual}
        </span>
        <span className="tnum text-[12px] text-[var(--ink-3)]">/ {target}</span>
      </div>
      <div className="mt-2">
        <div className={barCls}>
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
