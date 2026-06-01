/** Compact EUR formatter shared across the finance UI (e.g. 28.4k €, 210 €). */
export function formatEur(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k €`;
  }
  return `${Math.round(value)} €`;
}

/** Signed EUR with explicit +/- prefix, for deltas. */
export function formatEurDelta(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${formatEur(Math.abs(value))}`;
}
