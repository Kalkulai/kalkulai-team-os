'use client';

import { AnimatePresence } from 'framer-motion';
import { HermesProvider, useHermes } from './HermesContext';
import { HermesTrigger } from './HermesTrigger';
import { HermesModal } from './HermesModal';

function HermesWidgetInner() {
  const { state } = useHermes();
  return (
    <>
      <HermesTrigger />
      <AnimatePresence>{state === 'open' && <HermesModal />}</AnimatePresence>
    </>
  );
}

export function HermesWidget() {
  return (
    <HermesProvider>
      <HermesWidgetInner />
    </HermesProvider>
  );
}
