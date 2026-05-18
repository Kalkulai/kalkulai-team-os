'use client';

export function HermesOrb({ size = 56 }: { size?: number }) {
  return (
    <div
      ref={(el) => { if (el) { el.style.width = `${size}px`; el.style.height = `${size}px`; } }}
      className="hermes-orb"
      aria-hidden
    />
  );
}
