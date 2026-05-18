'use client';

import { useHermes } from './HermesContext';
import { HermesInput } from './HermesInput';

export function HermesBubble() {
  const { close, memberName } = useHermes();
  return (
    <>
      <div className="hermes-bubble-catcher" onClick={close} aria-hidden />
      <div className="hermes-bubble glass" onClick={(e) => e.stopPropagation()}>
        <span className="hermes-bubble-hint">
          {memberName ? `Hey ${memberName} —` : 'Frag Hermes —'}
        </span>
        <HermesInput variant="bubble" autoFocus placeholder="Schreib hier rein …" />
      </div>
    </>
  );
}
