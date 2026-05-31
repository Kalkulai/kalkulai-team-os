'use client';
import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface HorizonCardProps {
  /** kept for API compatibility; not rendered (overline removed per design feedback) */
  number?: 1 | 2 | 3;
  /** kept for API compatibility; not rendered */
  overline?: string;
  /** kept for API compatibility; not rendered (meta removed per design feedback) */
  meta?: ReactNode;
  title: string;
  delayMs?: number;
  children: ReactNode;
  /** Enable collapse toggle on the card header */
  collapsible?: boolean;
  /** Initial collapsed state (default: false) */
  defaultCollapsed?: boolean;
  /** localStorage key for persisting collapse state */
  storageKey?: string;
}

export function HorizonCard({
  title,
  delayMs = 0,
  children,
  collapsible,
  defaultCollapsed = false,
  storageKey,
}: HorizonCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!storageKey) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) setCollapsed(stored === 'true');
      } catch {
        // localStorage unavailable
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      if (storageKey) {
        try { localStorage.setItem(storageKey, String(next)); } catch { /* noop */ }
      }
      return next;
    });
  }

  const style: CSSProperties = { animationDelay: `${delayMs}ms` };
  return (
    <section className="glass card-rise overflow-hidden flex flex-col" style={style}>
      <header className="relative z-[1] flex-none px-5 pt-[18px] pb-[14px]">
        {collapsible ? (
          <button
            type="button"
            onClick={toggle}
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={!collapsed}
          >
            <h2 className="flex-1 text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ink-1)]">
              {title}
            </h2>
            <ChevronDown
              size={16}
              className={`flex-none text-[var(--ink-3)] transition-transform ${collapsed ? '' : 'rotate-180'}`}
              aria-hidden
            />
          </button>
        ) : (
          <h2 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ink-1)]">
            {title}
          </h2>
        )}
      </header>
      {collapsed ? (
        <div className="horizon-preview">
          <div className="absolute inset-0 flex flex-col overflow-hidden">
            {children}
          </div>
          <div className="horizon-fade" />
        </div>
      ) : (
        <div className="flex flex-col">{children}</div>
      )}
    </section>
  );
}

export function HorizonSection({
  label,
  end,
  children,
}: {
  label: string;
  end?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative z-[1] px-5 pb-4 [&+&]:mt-0.5 [&+&]:border-t [&+&]:border-[var(--line-1)] [&+&]:pt-4">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="ovr flex-1">{label}</span>
        {end && <span className="text-[11.5px] font-normal text-[var(--ink-3)]">{end}</span>}
      </div>
      {children}
    </div>
  );
}
