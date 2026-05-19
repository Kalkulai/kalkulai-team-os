'use client';

import type { CSSProperties } from 'react';

interface HeatmapMember {
  memberId: string;
  name: string;
  byWeekday: number[]; // length 7, Mo..So
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function cellColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return 'rgba(255,255,255,0.04)';
  const t = Math.min(1, value / max);
  const r = Math.round(120 + (255 - 120) * t);
  const g = Math.round(100 + (180 - 100) * t);
  const b = Math.round(240 + (120 - 240) * t);
  return `rgba(${r}, ${g}, ${b}, ${0.25 + t * 0.65})`;
}

export function WeekHeatmap({ rows }: { rows: HeatmapMember[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[13px] text-[var(--ink-3)]">
        Noch keine Heatmap-Daten — der erste Snapshot läuft heute 23:30 UTC.
      </p>
    );
  }
  const max = Math.max(1, ...rows.flatMap((m) => m.byWeekday));

  return (
    <div className="company-heatmap">
      <div className="company-heatmap-head">
        <div className="company-heatmap-corner" aria-hidden />
        {WEEKDAYS.map((d) => (
          <div key={d} className="company-heatmap-weekday">{d}</div>
        ))}
      </div>
      {rows.map((m) => (
        <div key={m.memberId} className="company-heatmap-row">
          <div className="company-heatmap-name">{m.name}</div>
          {m.byWeekday.map((v, i) => {
            const cellStyle = { '--cell-bg': cellColor(v, max) } as CSSProperties;
            return (
              <div
                key={i}
                className="company-heatmap-cell"
                style={cellStyle}
                title={`${m.name} · ${WEEKDAYS[i]}: ${v.toFixed(1)} Aktivität/Tag`}
                aria-label={`${m.name} ${WEEKDAYS[i]} ${v.toFixed(1)}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
