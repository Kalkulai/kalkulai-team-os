'use client';
import { useEffect, useState } from 'react';
import { Phone, X } from 'lucide-react';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

const TYPES = [
  { key: 'cold-call' as const, label: 'Cold Call', cls: 'b1' },
  { key: 'demo'      as const, label: 'Demo',      cls: 'b2' },
  { key: 'follow-up' as const, label: 'Follow-up', cls: 'b3' },
];
type SalesType = (typeof TYPES)[number]['key'];

const BTN_BG: Record<string, string> = {
  b1: 'linear-gradient(135deg,var(--brand),var(--brand-2))',
  b2: 'linear-gradient(135deg,var(--brand-3),#1F9B7E)',
  b3: 'linear-gradient(135deg,var(--warn),#D4830A)',
};

export function SalesFab({
  userId,
  initialCounts = {},
  dayShort,
}: {
  userId: string;
  initialCounts?: Record<string, number>;
  dayShort: string;
}) {
  const [counts, setCounts] = useState<Record<SalesType, number>>({
    'cold-call': initialCounts['cold-call'] ?? 0,
    demo:        initialCounts['demo']      ?? 0,
    'follow-up': initialCounts['follow-up'] ?? 0,
  });
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<SalesType | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  async function log(type: SalesType) {
    setPending(type);
    setCounts((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    try {
      const res = await fetch('/api/sales/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
        body: JSON.stringify({ userId, type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setCounts((prev) => ({ ...prev, [type]: Math.max(0, prev[type] - 1) }));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button type="button" className="fab" onClick={() => setOpen(true)}>
        <Phone size={14} aria-hidden />
        Call loggen
        <span className="n">
          {counts['cold-call']} · {counts.demo} · {counts['follow-up']}
        </span>
      </button>

      {open && (
        <div
          className="modal-bg"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal dropmenu">
            <button
              type="button"
              className="absolute right-[18px] top-[18px] grid size-[30px] place-items-center rounded-[7px] text-[var(--ink-3)] transition-colors hover:bg-white/[0.08] hover:text-[var(--ink-1)]"
              onClick={() => setOpen(false)}
              aria-label="Schließen"
            >
              <X size={14} aria-hidden />
            </button>
            <h3 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.015em] text-[var(--ink-1)]">
              Call loggen
            </h3>
            <p className="mt-1.5 mb-5 text-[12.5px] leading-[1.4] text-[var(--ink-3)]">
              Heutige Logs · {dayShort}
            </p>
            <div className="grid grid-cols-3 gap-[11px]">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={pending !== null}
                  onClick={() => log(t.key)}
                  className="relative overflow-hidden rounded-[12px] p-4 text-left text-white shadow-[0_4px_16px_-4px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.08)_inset] transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  ref={(el) => {
                    if (el) el.style.background = BTN_BG[t.cls];
                  }}
                >
                  <div className="text-[10.5px] font-medium uppercase leading-none tracking-[0.14em] opacity-90">
                    {t.label}
                  </div>
                  <div className="tnum mt-3 text-[36px] font-semibold leading-none tracking-[-0.025em]">
                    {counts[t.key]}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-none opacity-85">+ neuer Eintrag</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
