'use client';

import { motion } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useHermes } from './HermesContext';
import { HermesFrame } from './HermesFrame';

const HERMES_URL = process.env.NEXT_PUBLIC_HERMES_CHAT_URL ?? '';

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
        <div className="hermes-modal-header">
          <span className="hermes-modal-title">Hermes</span>
          <div className="hermes-modal-actions">
            {HERMES_URL && (
              <a
                href={HERMES_URL}
                target="_blank"
                rel="noreferrer"
                className="hermes-modal-icon-btn"
                aria-label="In neuem Tab öffnen"
              >
                <ExternalLink size={15} aria-hidden />
              </a>
            )}
            <button type="button" onClick={close} className="hermes-modal-icon-btn" aria-label="Schließen">
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
        <HermesFrame className="hermes-modal-frame" />
      </motion.div>
    </motion.div>
  );
}
