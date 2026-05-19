'use client';

interface Props {
  label: string;
  value: number;
  unit?: string;
  spark: Array<{ day: string; value: number }>;
  deltaPct?: number | null;
  threshold?: { good: number; warn: number };
}

function trendColor(delta?: number | null, threshold?: Props['threshold'], current?: number): string {
  if (typeof current === 'number' && threshold) {
    if (current >= threshold.good) return 'is-good';
    if (current >= threshold.warn) return 'is-warn';
    return 'is-bad';
  }
  if (delta == null) return '';
  return delta >= 0 ? 'is-good' : 'is-bad';
}

function Sparkline({ data }: { data: Props['spark'] }) {
  if (data.length === 0) return <svg className="metric-spark" viewBox="0 0 100 30" aria-hidden />;
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100;
  const h = 30;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data
    .map((d, i) => `${(i * step).toFixed(2)},${(h - (d.value / max) * (h - 2) - 1).toFixed(2)}`)
    .join(' ');
  return (
    <svg className="metric-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" strokeWidth="1.4" />
    </svg>
  );
}

export function MetricWidget({ label, value, unit, spark, deltaPct, threshold }: Props) {
  const cls = trendColor(deltaPct, threshold, value);
  return (
    <div className={`metric-widget glass ${cls}`}>
      <span className="metric-label">{label}</span>
      <div className="metric-row">
        <span className="metric-value">{value.toLocaleString('de-DE')}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      <Sparkline data={spark} />
      {typeof deltaPct === 'number' && (
        <span className={`metric-delta ${deltaPct >= 0 ? 'is-up' : 'is-down'}`}>
          {deltaPct >= 0 ? '↑' : '↓'} {Math.abs(deltaPct).toFixed(0)}% vs Vorwoche
        </span>
      )}
    </div>
  );
}
