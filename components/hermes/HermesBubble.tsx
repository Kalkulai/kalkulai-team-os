'use client';

import { useHermes } from './HermesContext';
import { HermesInput } from './HermesInput';

export function HermesBubble() {
  const { close } = useHermes();
  return (
    <>
      <div className="hermes-bubble-catcher" onClick={close} aria-hidden />
      <div className="hermes-bubble glass" onClick={(e) => e.stopPropagation()}>
        <HermesInput variant="bubble" autoFocus placeholder="Frag Hermes …" />
      </div>
    </>
  );
}
