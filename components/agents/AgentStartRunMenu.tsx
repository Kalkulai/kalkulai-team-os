'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ListChecks, SquareTerminal } from 'lucide-react';

export function AgentStartRunMenu({
  open,
  anchorRef,
  onClose,
  onTaskStart,
  onQuickTerminal,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onTaskStart: () => void;
  onQuickTerminal: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = 214;
      const margin = 12;
      const left = Math.min(
        Math.max(margin, rect.right - menuWidth),
        Math.max(margin, window.innerWidth - menuWidth - margin),
      );
      setPosition({ top: rect.bottom + 8, left });
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [anchorRef, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div ref={menuRef} className="agent-start-menu" role="menu" style={{ top: position.top, left: position.left }}>
      <button type="button" onClick={onTaskStart}>
        <ListChecks size={15} aria-hidden />
        <span>Aus Task starten</span>
      </button>
      <button type="button" onClick={onQuickTerminal}>
        <SquareTerminal size={15} aria-hidden />
        <span>Quick Terminal</span>
      </button>
    </div>,
    document.body,
  );
}
