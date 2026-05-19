'use client';

export type AnalyticsRange = 'week' | 'month';

export function TimeRangeSwitch({
  value,
  onChange,
}: {
  value: AnalyticsRange;
  onChange: (r: AnalyticsRange) => void;
}) {
  const base =
    'flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[12px] font-medium transition-colors';
  const active = `${base} bg-white/[0.08] text-[var(--ink-1)]`;
  const inactive = `${base} text-[var(--ink-3)] hover:text-[var(--ink-2)]`;
  return (
    <div className="mb-4 flex items-center gap-1 self-start rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] p-1">
      <button type="button" onClick={() => onChange('week')} className={value === 'week' ? active : inactive}>
        Diese Woche
      </button>
      <button type="button" onClick={() => onChange('month')} className={value === 'month' ? active : inactive}>
        Dieser Monat
      </button>
    </div>
  );
}
