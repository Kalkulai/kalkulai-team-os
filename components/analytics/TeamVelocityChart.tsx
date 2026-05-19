'use client';

import type { CSSProperties } from 'react';

interface Series {
  memberId: string;
  name: string;
  role: string;
  daily: number[];
}

const MEMBER_COLORS = [
  'var(--brand)',
  'var(--brand-2)',
  'var(--brand-3)',
  'var(--ok)',
  'var(--warn)',
];

function colorFor(idx: number): string {
  return MEMBER_COLORS[idx % MEMBER_COLORS.length];
}

export function TeamVelocityChart({
  days,
  series,
}: {
  days: string[];
  series: Series[];
}) {
  const dayTotals = days.map((_, i) => series.reduce((acc, s) => acc + (s.daily[i] ?? 0), 0));
  const max = Math.max(1, ...dayTotals);

  return (
    <div className="company-velocity">
      <div className="company-velocity-bars">
        {days.map((day, i) => {
          const total = dayTotals[i];
          return (
            <div key={day} className="company-velocity-col" title={`${day} · ${total}`}>
              <div className="company-velocity-stack">
                {series.map((s, sIdx) => {
                  const value = s.daily[i] ?? 0;
                  if (value === 0) return null;
                  const segStyle = {
                    '--seg-h': `${(value / max) * 100}%`,
                    '--seg-bg': colorFor(sIdx),
                  } as CSSProperties;
                  return (
                    <div
                      key={s.memberId}
                      className="company-velocity-seg"
                      style={segStyle}
                      title={`${s.name} · ${day}: ${value}`}
                      aria-label={`${s.name} ${day} ${value}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="company-velocity-legend">
        {series.map((s, idx) => {
          const dotStyle = { '--dot-bg': colorFor(idx) } as CSSProperties;
          const total = s.daily.reduce((a, b) => a + b, 0);
          return (
            <span key={s.memberId} className="company-velocity-legend-item">
              <span className="company-velocity-dot" style={dotStyle} aria-hidden />
              {s.name} <span className="company-velocity-legend-num">{total}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
