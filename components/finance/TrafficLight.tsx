'use client';

import type { AmpelStatus } from '@/types/finance';

const STATUS_LABEL: Record<AmpelStatus, string> = {
  green: 'gesund',
  yellow: 'beobachten',
  red: 'Action nötig',
};

/**
 * Reusable traffic-light (Ampel) dot + optional label.
 * green = emerald (--ok), yellow = --warn, red = rose (--danger).
 */
export function TrafficLight({
  status,
  label,
  showLabel = true,
}: {
  status: AmpelStatus;
  label?: string;
  showLabel?: boolean;
}) {
  return (
    <span className={`fin-ampel is-${status}`}>
      <span className="fin-ampel-dot" aria-hidden />
      {showLabel && <span className="fin-ampel-label">{label ?? STATUS_LABEL[status]}</span>}
    </span>
  );
}
