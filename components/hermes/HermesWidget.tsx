'use client';

import { AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useHermes } from './HermesContext';
import { HermesTrigger } from './HermesTrigger';
import { HermesBubble } from './HermesBubble';
import { HermesModal } from './HermesModal';

export function HermesWidget() {
  const { ui } = useHermes();
  const pathname = usePathname();
  // On the dedicated /dashboard/chat page, the shell is already rendered
  // full-page — hide the FAB + modal there to avoid double-UI.
  const onChatPage = pathname?.startsWith('/dashboard/chat');
  if (onChatPage) return null;
  return (
    <>
      <HermesTrigger />
      <AnimatePresence>
        {ui === 'bubble' && <HermesBubble />}
        {ui === 'modal' && <HermesModal />}
      </AnimatePresence>
    </>
  );
}
