'use client';
import { useState } from 'react';

export interface RingDatum {
  id: string;
  label: string;
  actual: number;
  target: number;
  color?: string;
}

const PALETTE = [
  '#5B8CFF',
  '#8B6BFF',
  '#3FE0C5',
  '#F2B84B',
  '#FF6B5C',
  '#3CE08C',
];

const SIZE = 168;
const CENTER = SIZE / 2;
const STROKE = 9;
const GAP = 3;
const OUTER_PADDING = 6;

export function MultiRingChart({ data, max = 6 }: { data: RingDatum[]; max?: number }) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const rings = data.slice(0, max);
  const n = rings.length;

  if (n === 0) {
    return (
      <div
        className="grid place-items-center text-[12px] text-[var(--ink-3)]"
        style={{ width: SIZE, height: SIZE }}
      >
        Keine aktiven KPIs
      </div>
    );
  }

  const outerRadius = SIZE / 2 - OUTER_PADDING - STROKE / 2;
  const hovered = rings.find((r) => r.id === hoverId);
  const hoveredPct = hovered ? Math.round(pct(hovered.actual, hovered.target)) : null;
  const doneCount = rings.filter((r) => pct(r.actual, r.target) >= 100).length;

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="KPI- und Projekt-Fortschritt">
        <defs>
          {rings.map((r, i) => {
            const color = r.color ?? PALETTE[i % PALETTE.length];
            return (
              <linearGradient key={r.id} id={`ring-grad-${r.id}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.55" />
                <stop offset="100%" stopColor={color} stopOpacity="1" />
              </linearGradient>
            );
          })}
        </defs>

        {rings.map((r, i) => {
          const radius = outerRadius - i * (STROKE + GAP);
          if (radius < STROKE) return null;
          const circ = 2 * Math.PI * radius;
          const p = pct(r.actual, r.target);
          const dash = (p / 100) * circ;
          const color = r.color ?? PALETTE[i % PALETTE.length];
          const isHover = hoverId === r.id;
          return (
            <g
              key={r.id}
              onMouseEnter={() => setHoverId(r.id)}
              onMouseLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(r.id)}
              onBlur={() => setHoverId(null)}
              tabIndex={0}
              style={{ cursor: 'pointer', outline: 'none' }}
            >
              <circle cx={CENTER} cy={CENTER} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE} />
              <circle
                cx={CENTER}
                cy={CENTER}
                r={radius}
                fill="none"
                stroke={`url(#ring-grad-${r.id})`}
                strokeWidth={isHover ? STROKE + 2 : STROKE}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${CENTER} ${CENTER})`}
                style={{
                  transition: 'stroke-width 160ms ease',
                  filter: isHover ? `drop-shadow(0 0 6px ${color}80)` : 'none',
                }}
              />
              <title>{`${r.label}: ${r.actual} / ${r.target || '∞'} (${Math.round(p)}%)`}</title>
            </g>
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center" aria-hidden>
        {hovered ? (
          <div className="px-2">
            <p className="truncate max-w-[120px] text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">{hovered.label}</p>
            <p className="mt-0.5 mono text-[15px] font-semibold text-[var(--ink-1)]">
              {hovered.actual} / {hovered.target || '∞'}
            </p>
            <p className="mt-0.5 mono text-[11px] text-[var(--ink-3)]">{hoveredPct}%</p>
          </div>
        ) : (
          <div className="px-2">
            <p className="text-[10.5px] uppercase tracking-[0.08em] text-[var(--ink-3)]">Aktiv</p>
            <p className="mt-0.5 mono text-[18px] font-semibold text-[var(--ink-1)]">{n}</p>
            <p className="mt-0.5 mono text-[10.5px] text-[var(--ink-3)]">{doneCount} ✓</p>
          </div>
        )}
      </div>
    </div>
  );
}

function pct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, (actual / target) * 100));
}
