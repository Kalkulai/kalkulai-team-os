'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar as CalIcon, X } from 'lucide-react';
import 'react-day-picker/dist/style.css';

interface Props {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Datum',
  disabled = false,
  className,
  ariaLabel = 'Datum auswählen',
}: Props) {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const anchor = wrapRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const popover = popoverRef.current;
      const margin = 8;
      const gap = 6;
      const width = popover?.offsetWidth ?? 292;
      const height = popover?.offsetHeight ?? 330;
      const fitsBelow = rect.bottom + gap + height <= window.innerHeight - margin;
      const top = fitsBelow
        ? rect.bottom + gap
        : Math.max(margin, rect.top - gap - height);
      const left = Math.min(
        Math.max(margin, rect.left),
        Math.max(margin, window.innerWidth - width - margin),
      );

      setPopoverStyle({ position: 'fixed', top, left, zIndex: 1000 });
    }

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const parsed = value ? safeParse(value) : null;
  const label = parsed ? format(parsed, 'd. MMM yyyy', { locale: de }) : placeholder;
  const popover = open && typeof document !== 'undefined' ? (
    <div
      ref={popoverRef}
      className="datepicker-popover"
      style={popoverStyle ?? { position: 'fixed', top: -9999, left: -9999, zIndex: 1000 }}
    >
      <DayPicker
        mode="single"
        selected={parsed ?? undefined}
        onSelect={(d) => {
          onChange(d ? format(d, 'yyyy-MM-dd') : null);
          setOpen(false);
        }}
        locale={de}
        weekStartsOn={1}
        showOutsideDays
      />
    </div>
  ) : null;

  return (
    <div className={`datepicker ${className ?? ''}`} ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        className={`datepicker-trigger ${parsed ? '' : 'is-empty'}`}
        onClick={() => setOpen((s) => !s)}
        aria-label={ariaLabel}
      >
        <CalIcon size={13} aria-hidden />
        <span>{label}</span>
        {parsed && (
          <span
            role="button"
            tabIndex={0}
            className="datepicker-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange(null);
              }
            }}
            aria-label="Datum entfernen"
          >
            <X size={11} aria-hidden />
          </span>
        )}
      </button>
      {popover ? createPortal(popover, document.body) : null}
    </div>
  );
}

function safeParse(s: string): Date | null {
  try {
    const d = parseISO(s);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}
