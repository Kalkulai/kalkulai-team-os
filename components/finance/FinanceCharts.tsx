'use client';

import type { CSSProperties } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CostLine, ForecastPoint, PaidBySlice } from '@/types/finance';
import { formatEur } from '@/lib/finance-format';

// Dark-theme palette pulled from the dashboard design tokens.
const PIE_COLORS = ['var(--brand-2)', 'var(--brand)', 'var(--brand-3)', 'var(--warn)', 'var(--ink-3)'];
const COLOR_FIXED = 'var(--brand-2)';
const COLOR_VARIABLE = 'var(--brand)';
const COLOR_CASH = 'var(--brand-2)';
const COLOR_BURN = 'var(--warn)';

// Plain SVG-text props (not CSSProperties — recharts `tick` expects text-element props).
const AXIS_TICK = {
  fill: 'var(--ink-3)',
  fontSize: 11,
  fontFamily: 'var(--mono)',
} as const;

// recharts requires inline style objects for tooltip surfaces (library API).
const TOOLTIP_CONTENT: CSSProperties = {
  background: 'rgba(20, 24, 38, 0.96)',
  border: '1px solid var(--line-2)',
  borderRadius: 10,
  boxShadow: '0 12px 40px -10px rgba(0,0,0,0.6)',
  fontFamily: 'var(--font)',
  fontSize: 12,
};
const TOOLTIP_LABEL: CSSProperties = { color: 'var(--ink-2)', fontWeight: 600 };
const TOOLTIP_ITEM: CSSProperties = { color: 'var(--ink-1)' };

type RechartsValue = number | string | ReadonlyArray<number | string> | undefined;

/** Coerce any recharts axis/tooltip value into a compact EUR string. */
function eurFormatter(value: RechartsValue): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return formatEur(Number(raw ?? 0));
}

/** Monthly cost lines as a bar chart; fixed costs accented in purple. */
export function CostBarChart({ data }: { data: CostLine[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line-1)" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={eurFormatter} width={56} />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          formatter={(value) => [eurFormatter(value), 'Kosten / Monat']}
        />
        <Bar dataKey="amount_eur" radius={[6, 6, 0, 0]} maxBarSize={48}>
          {data.map((line) => (
            <Cell key={line.label} fill={line.fixed ? COLOR_FIXED : COLOR_VARIABLE} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Spend share per payer as a donut. */
export function PaidByPieChart({ data }: { data: PaidBySlice[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Tooltip
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          formatter={(value) => [eurFormatter(value), 'Anteil']}
        />
        <Pie
          data={data}
          dataKey="value_eur"
          nameKey="name"
          innerRadius={50}
          outerRadius={84}
          paddingAngle={2}
          stroke="var(--bg)"
          strokeWidth={2}
        >
          {data.map((slice, idx) => (
            <Cell key={slice.name} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

/** 6-month cash balance (line) vs. monthly burn (line). */
export function ForecastLineChart({ data }: { data: ForecastPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line-1)" vertical={false} />
        <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={eurFormatter} width={56} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT}
          labelStyle={TOOLTIP_LABEL}
          itemStyle={TOOLTIP_ITEM}
          formatter={(value, name) => [eurFormatter(value), name === 'cash_eur' ? 'Cash' : 'Burn']}
        />
        <Line
          type="monotone"
          dataKey="cash_eur"
          stroke={COLOR_CASH}
          strokeWidth={2.4}
          dot={{ r: 3, fill: COLOR_CASH }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="burn_eur"
          stroke={COLOR_BURN}
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
