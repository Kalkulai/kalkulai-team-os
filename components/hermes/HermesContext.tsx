'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type UiState = 'closed' | 'open';

interface HermesContextValue {
  state: UiState;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const HermesContext = createContext<HermesContextValue | null>(null);

export function HermesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UiState>('closed');
  const open = useCallback(() => setState('open'), []);
  const close = useCallback(() => setState('closed'), []);
  const toggle = useCallback(() => setState((s) => (s === 'open' ? 'closed' : 'open')), []);

  useEffect(() => {
    if (state !== 'open') return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [state, close]);

  return (
    <HermesContext.Provider value={{ state, open, close, toggle }}>
      {children}
    </HermesContext.Provider>
  );
}

export function useHermes() {
  const ctx = useContext(HermesContext);
  if (!ctx) throw new Error('useHermes must be used inside <HermesProvider>');
  return ctx;
}
