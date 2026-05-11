'use client';
import { useEffect } from 'react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // surfaces in dev terminal so we can see what threw
    console.error('[error.tsx] caught', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="glass card-rise overflow-hidden p-6 text-[var(--ink-1)]">
      <p className="ovr">Fehler</p>
      <h2 className="mt-1.5 text-[20px] font-semibold tracking-[-0.015em]">
        Etwas ist schiefgegangen
      </h2>
      <pre className="mono mt-3 max-h-60 overflow-auto rounded-md border border-[var(--line-1)] bg-black/30 p-3 text-[12px] leading-snug whitespace-pre-wrap">
        {error.message}
        {error.digest && `\n\ndigest: ${error.digest}`}
      </pre>
      <button
        type="button"
        onClick={reset}
        className="btn-action mt-4"
      >
        Nochmal versuchen
      </button>
    </div>
  );
}
