'use client';

import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useHermes } from './HermesContext';
import { HermesChatShell } from './HermesChatShell';

export function HermesModal() {
  const { close } = useHermes();
  return (
    <motion.div
      className="hermes-modal-bg"
      onClick={close}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        className="hermes-modal glass"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      >
        <button type="button" onClick={close} className="hermes-modal-close" aria-label="Schließen">
          <X size={16} aria-hidden />
        </button>
        <HermesChatShell embedded />
      </motion.div>
    </motion.div>
  );
}
