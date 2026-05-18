'use client';

import { motion } from 'framer-motion';
import { useHermes } from './HermesContext';
import { HermesOrb } from './HermesOrb';

export function HermesTrigger() {
  const { open } = useHermes();
  return (
    <motion.button
      type="button"
      onClick={open}
      className="hermes-fab"
      aria-label="Hermes Chat öffnen"
      whileHover={{ scale: 1.08, y: -2 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18 }}
    >
      <HermesOrb size={52} />
    </motion.button>
  );
}
