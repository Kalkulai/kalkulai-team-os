'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Login fehlgeschlagen');
      }
      router.replace(redirect.startsWith('/') ? redirect : '/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-[10vh] flex max-w-md flex-col gap-5">
      <section className="glass card-rise overflow-hidden p-7">
        <p className="ovr">Team-Zugang</p>
        <h2 className="mt-1.5 text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ink-1)]">
          KalkulAI Team OS
        </h2>
        <p className="mt-1.5 text-[12.5px] text-[var(--ink-3)]">
          Geteiltes Team-Passwort eingeben. Du bleibst 30 Tage angemeldet.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <div className="space-y-1.5">
            <label htmlFor="pw" className="ovr block">Passwort</label>
            <input
              id="pw"
              type="password"
              autoFocus
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="block w-full rounded-[10px] border border-[var(--line-1)] bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-[var(--ink-1)] outline-none transition-colors focus:border-[var(--line-2)] focus:bg-white/[0.07]"
              placeholder="••••••••••"
            />
          </div>

          {error && (
            <p className="text-[13px] text-rose-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !password}
            className="btn-action w-full disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Prüfe…' : 'Anmelden'}
          </button>
        </form>
      </section>

      <p className="text-center text-[12px] text-[var(--ink-3)]">
        Kein Passwort? Frag Leon — siehe <code className="rounded bg-white/[0.05] px-1.5 py-0.5 mono text-[11px]">docs/TEAM-ACCESS.md</code>.
      </p>
    </div>
  );
}
