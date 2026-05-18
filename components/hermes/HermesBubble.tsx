'use client';

import { motion } from 'framer-motion';
import { useHermes } from './HermesContext';
import { HermesInput } from './HermesInput';

/**
 * KAI-style bubble: bottom-center anchor, spring-animates from FAB
 * (bottom-right) to center. Transparent click-away catcher — the
 * dashboard underneath stays fully visible + interactive.
 */
export function HermesBubble() {
  const { close } = useHermes();
  return (
    <>
      <div className="hermes-bubble-catcher" onClick={close} aria-hidden />
      <div className="hermes-bubble-anchor">
        <motion.div
          className="hermes-bubble glass"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.13, x: 'calc(50vw - 3.25rem)' }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.13, x: 'calc(50vw - 3.25rem)' }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        >
          <HermesInput variant="bubble" autoFocus placeholder="Frag Hermes …" />
        </motion.div>
      </div>
    </>
  );
}
