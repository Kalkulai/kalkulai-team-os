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

// What Leon/Felix/Paul personally produced — own output, no team-wide KPIs.
export const PERSONAL_WIDGETS: WidgetDef[] = [
  { key: 'tasks_completed',                  label: 'Tasks erledigt',    unit: '/Woche', threshold: { good: 8, warn: 3 } },
  { key: 'commits_count',                    label: 'Commits',           unit: '/Woche', threshold: { good: 15, warn: 5 } },
  { key: METRIC_KEYS.DEPLOYS_PER_DAY,        label: 'Deploys',           unit: '/Woche', threshold: { good: 5, warn: 2 } },
  { key: METRIC_KEYS.BUGS_CLOSED,            label: 'Bugs geschlossen',  unit: '/Woche' },
  { key: METRIC_KEYS.CUSTOMER_CONVERSATIONS, label: 'Kunden-Calls',      unit: '/Woche', threshold: { good: 3, warn: 1 } },
  { key: METRIC_KEYS.COMMITMENT_HIT_PCT,     label: 'Commitment-Hit',    unit: '%',      threshold: { good: 80, warn: 50 } },
  { key: METRIC_KEYS.MAILS_SENT,             label: 'Mails gesendet',    unit: '/Woche', threshold: { good: 50, warn: 15 } },
  { key: METRIC_KEYS.REPLIES_RECEIVED,       label: 'Antworten',         unit: '/Woche', threshold: { good: 5, warn: 1 } },
  { key: METRIC_KEYS.MEETINGS_BOOKED,        label: 'Termine gebucht',   unit: '/Woche', threshold: { good: 3, warn: 1 } },
];

// Cross-cutting company KPIs — these belong on the Firma-page, not on
// an individual's analytics view.
export const COMPANY_WIDGETS: WidgetDef[] = [
  { key: METRIC_KEYS.PILOTS_ACTIVE,    label: 'Aktive Piloten',    unit: '/5' },
  { key: METRIC_KEYS.DEMOS_COMPLETED,  label: 'Demos (Team)',      unit: '/Woche', threshold: { good: 3, warn: 1 } },
  { key: METRIC_KEYS.DEMO_TO_PILOT_PCT,label: 'Demo → Pilot',      unit: '%',      threshold: { good: 40, warn: 20 } },
  { key: METRIC_KEYS.PIPELINE_VALUE_EUR,label: 'Pipeline',         unit: '€' },
  { key: 'tasks_completed',            label: 'Team-Velocity',     unit: '/Woche', threshold: { good: 25, warn: 10 } },
  { key: METRIC_KEYS.BUGS_CLOSED,      label: 'Bugs gefixt (Team)', unit: '/Woche' },
];

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function MetricGrid({
  metrics,
  range,
  mode = 'personal',
}: {
  metrics: MetricsPayload;
  range: 'week' | 'month';
  mode?: 'personal' | 'company';
}) {
  const widgets = mode === 'company' ? COMPANY_WIDGETS : PERSONAL_WIDGETS;
  const source = range === 'month' ? metrics.month : metrics.week_now;
  return (
    <div className="metric-grid">
      {widgets.map((w) => {
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
