'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';

const TYPES = [
  { value: 'cold-call', label: 'Cold Call' },
  { value: 'demo', label: 'Demo' },
  { value: 'follow-up', label: 'Follow-up' },
] as const;

type SalesType = (typeof TYPES)[number]['value'];

export function SalesLogger({
  userId,
  initialCounts = {},
}: {
  userId: string;
  initialCounts?: Record<string, number>;
}) {
  const [counts, setCounts] = useState<Record<SalesType, number>>({
    'cold-call': initialCounts['cold-call'] ?? 0,
    demo: initialCounts['demo'] ?? 0,
    'follow-up': initialCounts['follow-up'] ?? 0,
  });
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<SalesType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState<SalesType | null>(null);

  async function log(type: SalesType) {
    setPending(type);
    setError(null);
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));

    try {
      const res = await fetch('/api/sales/log-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, type, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNote('');
      setJustLogged(type);
      setTimeout(() => setJustLogged(null), 1200);
    } catch (e) {
      setCounts((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Notiz (optional, z.B. Kundenname)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="text-base sm:text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => {
          const isPending = pending === t.value;
          const isFlash = justLogged === t.value;
          return (
            <button
              key={t.value}
              type="button"
              disabled={pending !== null}
              onClick={() => log(t.value)}
              aria-label={`${t.label} loggen, aktuell ${counts[t.value]} heute`}
              className={`group relative flex min-h-[68px] flex-col items-center justify-center gap-0.5 rounded-xl border border-foreground/[0.08] bg-card/60 px-2 py-3 text-center backdrop-blur-md transition-all hover:border-foreground/[0.16] hover:bg-card/80 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 ${
                isFlash ? 'ring-2 ring-emerald-500/60' : ''
              }`}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t.label}
              </span>
              <span className={`text-2xl font-semibold tabular-nums ${isPending ? 'opacity-50' : ''}`}>
                {counts[t.value]}
              </span>
              <span className="text-[10px] text-muted-foreground">heute</span>
              {isPending && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/40" />
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
