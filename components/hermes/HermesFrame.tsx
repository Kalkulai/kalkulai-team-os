'use client';

import { useState } from 'react';

const HERMES_URL = process.env.NEXT_PUBLIC_HERMES_CHAT_URL ?? '';

export function HermesFrame({ className }: { className?: string }) {
  const [loaded, setLoaded] = useState(false);

  if (!HERMES_URL) {
    return (
      <div className="hermes-frame-empty">
        <p>Hermes-Chat ist nicht konfiguriert.</p>
        <p className="muted">Setze <code>NEXT_PUBLIC_HERMES_CHAT_URL</code> in den Env-Variablen.</p>
      </div>
    );
  }

  return (
    <div className={`hermes-frame ${className ?? ''}`}>
      {!loaded && (
        <div className="hermes-frame-loading">
          <div className="hermes-frame-spinner" />
          <span>Hermes wird geladen…</span>
        </div>
      )}
      <iframe
        src={HERMES_URL}
        title="Hermes Chat"
        className="hermes-frame-iframe"
        onLoad={() => setLoaded(true)}
        allow="microphone; clipboard-read; clipboard-write"
      />
    </div>
  );
}
