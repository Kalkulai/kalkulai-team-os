'use client';

import { useEffect, useRef, useState } from 'react';
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
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
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
      {open && (
        <div className="datepicker-popover">
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
      )}
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
