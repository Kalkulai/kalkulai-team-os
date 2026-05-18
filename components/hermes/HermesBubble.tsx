'use client';

import { motion } from 'framer-motion';
import { useHermes } from './HermesContext';
import { HermesInput } from './HermesInput';

export function HermesBubble() {
  const { close, memberName } = useHermes();
  return (
    <>
      {/* Click-away catcher, transparent */}
      <div className="hermes-bubble-catcher" onClick={close} aria-hidden />
      {/* The pill itself, anchored next to the FAB, expanding leftward */}
      <motion.div
        className="hermes-bubble glass"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scaleX: 0.25, originX: 1 }}
        animate={{ opacity: 1, scaleX: 1, originX: 1 }}
        exit={{ opacity: 0, scaleX: 0.25, originX: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 26 }}
      >
        <span className="hermes-bubble-hint">
          {memberName ? `Hey ${memberName} —` : 'Frag Hermes —'}
        </span>
        <HermesInput variant="bubble" autoFocus placeholder="Schreib hier rein …" />
      </motion.div>
    </>
  );
}
