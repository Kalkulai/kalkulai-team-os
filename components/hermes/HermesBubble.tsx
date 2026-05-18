'use client';

import { motion } from 'framer-motion';
import { useHermes } from './HermesContext';
import { HermesInput } from './HermesInput';

export function HermesBubble() {
  const { close, memberName } = useHermes();
  return (
    <motion.div
      className="hermes-bubble-bg"
      onClick={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      <motion.div
        className="hermes-bubble glass"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
      >
        <span className="hermes-bubble-hint">
          {memberName ? `Hey ${memberName}, was läuft?` : 'Schreib Hermes …'}
        </span>
        <HermesInput variant="bubble" autoFocus placeholder="Frag Hermes irgendwas …" />
      </motion.div>
    </motion.div>
  );
}
