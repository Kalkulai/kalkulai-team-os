'use client';

import type { ReactNode } from 'react';

/**
 * Reusable KPI tile matching the company-hero aesthetic:
 * uppercase tracking label, large metric, optional unit + sub/delta.
 * `tone` drives accent border + glow (purple by default, ok/warn/bad for status).
 */
export function KPICard({
  label,
  value,
  unit,
  sub,
  tone = 'default',
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'bad';
  children?: ReactNode;
}) {
  return (
    <div className={`fin-kpi glass tone-${tone}`}>
      <span className="fin-kpi-label">{label}</span>
      <span className="fin-kpi-value">
        {value}
        {unit != null && <span className="fin-kpi-unit">{unit}</span>}
      </span>
      {sub != null && <span className="fin-kpi-sub">{sub}</span>}
      {children}
    </div>
  );
}
