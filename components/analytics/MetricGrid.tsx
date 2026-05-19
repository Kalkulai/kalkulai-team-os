'use client';

import { MetricWidget } from './MetricWidget';
import { METRIC_KEYS } from '@/lib/business-metrics';

interface MetricsPayload {
  week_now: Record<string, { sum_value: number } | null>;
  week_prev: Record<string, { sum_value: number } | null>;
  month: Record<string, { sum_value: number } | null>;
  sparklines: Record<string, Array<{ day: string; value: number }>>;
}

interface WidgetDef {
  key: string;
  label: string;
  unit?: string;
  threshold?: { good: number; warn: number };
}

const WIDGETS: WidgetDef[] = [
  { key: METRIC_KEYS.PILOTS_ACTIVE, label: 'Aktive Piloten', unit: '/5' },
  { key: METRIC_KEYS.DEMOS_COMPLETED, label: 'Demos', unit: '/Woche', threshold: { good: 3, warn: 1 } },
  { key: METRIC_KEYS.DEPLOYS_PER_DAY, label: 'Deploys', unit: '/Woche', threshold: { good: 5, warn: 2 } },
  { key: METRIC_KEYS.BUGS_CLOSED, label: 'Bugs geschlossen', unit: '/Woche' },
  { key: METRIC_KEYS.CUSTOMER_CONVERSATIONS, label: 'Kunden-Calls', unit: '/Woche', threshold: { good: 3, warn: 1 } },
  { key: METRIC_KEYS.COMMITMENT_HIT_PCT, label: 'Commitment-Hit', unit: '%', threshold: { good: 80, warn: 50 } },
];

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function MetricGrid({ metrics, range }: { metrics: MetricsPayload; range: 'week' | 'month' }) {
  const source = range === 'month' ? metrics.month : metrics.week_now;
  return (
    <div className="metric-grid">
      {WIDGETS.map((w) => {
        const cur = Number(source?.[w.key]?.sum_value ?? 0);
        const prev = Number(metrics.week_prev?.[w.key]?.sum_value ?? 0);
        const spark = metrics.sparklines[w.key] ?? [];
        return (
          <MetricWidget
            key={w.key}
            label={w.label}
            value={cur}
            unit={w.unit}
            spark={spark}
            deltaPct={range === 'week' ? deltaPct(cur, prev) : null}
            threshold={w.threshold}
          />
        );
      })}
    </div>
  );
}
