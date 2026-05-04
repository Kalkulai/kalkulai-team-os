'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
    'cold-call': (initialCounts['cold-call'] ?? 0),
    'demo': (initialCounts['demo'] ?? 0),
    'follow-up': (initialCounts['follow-up'] ?? 0),
  });
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<SalesType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function log(type: SalesType) {
    setPending(type);
    setError(null);
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));

    try {
      const res = await fetch('/api/sales/log-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? ''}`,
        },
        body: JSON.stringify({ userId, type, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNote('');
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
        className="text-sm"
      />
      <div className="grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <Button
            key={t.value}
            variant="secondary"
            disabled={pending !== null}
            onClick={() => log(t.value)}
            className="flex flex-col h-auto py-2"
          >
            <span className="text-xs">{t.label}</span>
            <span className="text-lg font-bold">+{counts[t.value]}</span>
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
