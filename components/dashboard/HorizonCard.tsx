import type { CSSProperties, ReactNode } from 'react';

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
}

export function HorizonCard({
  title,
  delayMs = 0,
  children,
}: HorizonCardProps) {
  const style: CSSProperties = { animationDelay: `${delayMs}ms` };
  return (
    <section className="glass card-rise overflow-hidden" style={style}>
      <header className="relative z-[1] px-5 pt-[18px] pb-[14px]">
        <h2 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ink-1)]">
          {title}
        </h2>
      </header>
      <div className="flex flex-col">{children}</div>
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
