'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { useHermes } from './HermesContext';

interface Props {
  placeholder?: string;
  autoFocus?: boolean;
  variant?: 'bubble' | 'shell';
}

export function HermesInput({ placeholder = 'Schreib Hermes …', autoFocus = false, variant = 'shell' }: Props) {
  const { sendMessage, sending } = useHermes();
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [value]);

  function submit() {
    const v = value.trim();
    if (!v || sending) return;
    setValue('');
    void sendMessage(v);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={`hermes-input hermes-input-${variant}`}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholder}
        rows={1}
        disabled={sending}
        className="hermes-input-ta"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || sending}
        className="hermes-input-send"
        aria-label="Senden"
      >
        {sending ? <Loader2 size={15} className="hermes-spin" aria-hidden /> : <ArrowUp size={15} aria-hidden />}
      </button>
    </div>
  );
}
