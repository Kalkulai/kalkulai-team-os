'use client';
import { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { KpiManager } from '@/components/KpiManager';
import type { TeamMember } from '@/types';

const GLASS =
  'rounded-2xl bg-card/70 backdrop-blur-xl ring-1 ring-foreground/5 ' +
  'shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_-12px_rgba(0,0,0,0.12)] ' +
  'dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.5)] ' +
  'animate-[card-rise_400ms_cubic-bezier(0.22,1,0.36,1)_both]';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function SettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/members')
      .then((r) => r.json())
      .then((data: TeamMember[]) => {
        setMembers(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => setError('Teammitglieder konnten nicht geladen werden'));
  }, []);

  const selectedMember = members.find((m) => m.id === selectedId);

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-6">
      <header className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Konfiguration</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Einstellungen</h1>
      </header>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">KPIs diese Woche</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Eigene KPIs anlegen, Ziele setzen, im Dashboard manuell hochzählen.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-select" className="text-xs uppercase tracking-wide text-muted-foreground">
              Person
            </Label>
            <Select
              value={selectedId}
              onValueChange={(v) => { if (v !== null) setSelectedId(v); }}
              disabled={members.length === 0}
            >
              <SelectTrigger id="member-select" className="min-h-[44px] w-full sm:w-56">
                <SelectValue placeholder={members.length === 0 ? 'Lade…' : 'Person auswählen…'}>
                  {selectedMember?.name ?? 'Person…'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    <span className="ml-2 text-xs text-muted-foreground">({m.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {error && <p className="mb-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

        {selectedId && <KpiManager userId={selectedId} />}
      </section>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <h2 className="mb-4 text-sm font-semibold tracking-tight">Google Calendar</h2>
        {selectedMember ? (
          <div className="space-y-4">
            <p className="text-sm leading-snug text-muted-foreground">
              {selectedMember.google_calendar_email ? (
                <>Verbunden mit <span className="font-medium text-foreground">{selectedMember.google_calendar_email}</span></>
              ) : (
                'Noch nicht verbunden — Briefing nutzt Fallback-Kalender.'
              )}
            </p>
            <a
              href={`/api/oauth/google/start?userId=${selectedMember.id}`}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-foreground/[0.08] bg-card/60 px-4 text-sm font-medium backdrop-blur-md transition-colors hover:border-foreground/[0.16] hover:bg-card/80 sm:w-auto"
            >
              {selectedMember.google_calendar_email ? 'Anderen Account verbinden' : 'Mit Google Calendar verbinden'}
            </a>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Person auswählen, um Calendar zu verbinden.</p>
        )}
      </section>

      <section className={`${GLASS} col-span-1 px-5 py-5 sm:px-6 sm:py-6 md:col-span-6`}>
        <header className="mb-4 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Verbindungs-Status</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {members.length} {members.length === 1 ? 'Person' : 'Personen'}
          </span>
        </header>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lädt…</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {members.map((m) => {
              const checks = buildChecks(m);
              const okCount = checks.filter((c) => c.ok).length;
              const open = checks.filter((c) => !c.ok);
              const ratio = okCount / checks.length;
              const ringTone =
                ratio === 1
                  ? 'ring-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : ratio >= 0.5
                  ? 'ring-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'ring-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400';
              return (
                <li
                  key={m.id}
                  className="flex flex-col gap-3 rounded-xl border border-foreground/[0.06] bg-card/40 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold ring-2 ${ringTone}`}>
                      {initials(m.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.role}</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{okCount}/{checks.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {checks.map((c) => (
                      <span
                        key={c.label}
                        title={c.ok ? `${c.label} verbunden` : c.hint}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          c.ok
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : 'bg-foreground/[0.05] text-muted-foreground'
                        }`}
                      >
                        <span aria-hidden>{c.ok ? '●' : '○'}</span>
                        {c.label}
                      </span>
                    ))}
                  </div>
                  {open.length > 0 && (
                    <ul className="space-y-0.5 border-t border-foreground/[0.06] pt-2 text-[11px] leading-snug text-muted-foreground">
                      {open.map((c) => (
                        <li key={c.label}>
                          <span className="font-medium text-foreground/80">{c.label}:</span> {c.hint}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function buildChecks(m: TeamMember): { label: string; ok: boolean; hint: string }[] {
  const checks = [
    { label: 'Telegram', ok: !!m.telegram_chat_id, hint: 'Person muss /start an den Bot schicken' },
    { label: 'Linear', ok: !!m.linear_user_id, hint: 'In DB: linear_user_id setzen' },
    { label: 'GitHub', ok: !!m.github_username, hint: 'In DB: github_username setzen' },
    {
      label: 'Calendar',
      ok: !!m.google_refresh_token || !!m.google_calendar_email,
      hint: 'Person klickt "Mit Google Calendar verbinden"',
    },
  ];
  if (m.role === 'sales') {
    checks.push({
      label: 'HubSpot',
      ok: !!m.hubspot_owner_id,
      hint: 'Optional — nur für VoIP-Calls',
    });
  }
  return checks;
}
