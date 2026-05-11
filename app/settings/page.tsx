'use client';
import { Suspense } from 'react';
import { useActiveMember } from '@/lib/active-member';
import { KpiManager } from '@/components/KpiManager';
import type { TeamMember } from '@/types';

const ROLE_GRADIENT: Record<string, string> = {
  dev:    'linear-gradient(135deg,#5B8CFF,#3F5BFF)',
  sales:  'linear-gradient(135deg,#3FE0C5,#1F9B7E)',
  founder:'linear-gradient(135deg,#3D4255,#1B1E2A)',
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

function gradientFor(role: string): string {
  return ROLE_GRADIENT[role] ?? ROLE_GRADIENT.dev;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { members, activeId, activeMember } = useActiveMember();

  return (
    <div className="space-y-5">
      <section className="glass card-rise overflow-hidden p-5">
        <p className="ovr">Konfiguration</p>
        <h2 className="mt-1.5 text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ink-1)]">
          Integrationen & KPIs
        </h2>
        {activeMember && (
          <p className="mt-1.5 text-[12.5px] text-[var(--ink-3)]">
            Aktiv: <span className="font-medium text-[var(--ink-1)]">{activeMember.name}</span>
            <span className="ml-1.5">— Person oben rechts wechseln.</span>
          </p>
        )}
      </section>

      <section className="glass card-rise overflow-hidden">
        <header className="relative z-[1] flex items-baseline justify-between gap-2.5 px-5 pt-[18px] pb-[14px]">
          <div>
            <span className="ovr">KPIs diese Woche</span>
            <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">
              Eigene KPIs anlegen, Ziele setzen, im Dashboard manuell hochzählen.
            </p>
          </div>
        </header>
        <div className="relative z-[1] px-5 pb-5">
          {activeId ? (
            <KpiManager userId={activeId} />
          ) : (
            <p className="text-[13px] text-[var(--ink-3)]">Lädt…</p>
          )}
        </div>
      </section>

      <section className="glass card-rise overflow-hidden">
        <header className="relative z-[1] px-5 pt-[18px] pb-[14px]">
          <span className="ovr">Google Calendar</span>
        </header>
        <div className="relative z-[1] px-5 pb-5">
          {activeMember ? (
            <div className="space-y-3.5">
              <p className="text-[13px] leading-snug text-[var(--ink-2)]">
                {activeMember.google_calendar_email ? (
                  <>
                    Verbunden mit{' '}
                    <span className="font-medium text-[var(--ink-1)]">
                      {activeMember.google_calendar_email}
                    </span>
                  </>
                ) : (
                  'Noch nicht verbunden — Briefing nutzt Fallback-Kalender.'
                )}
              </p>
              <a
                href={`/api/oauth/google/start?userId=${activeMember.id}`}
                className="btn-action"
              >
                {activeMember.google_calendar_email ? 'Anderen Account verbinden' : 'Mit Google Calendar verbinden'}
              </a>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--ink-3)]">Lädt…</p>
          )}
        </div>
      </section>

      <section className="glass card-rise overflow-hidden">
        <header className="relative z-[1] flex items-baseline justify-between gap-2.5 px-5 pt-[18px] pb-[14px]">
          <span className="ovr">Verbindungs-Status</span>
          <span className="mono text-[12px] font-medium text-[var(--ink-3)]">
            {members.length} {members.length === 1 ? 'Person' : 'Personen'}
          </span>
        </header>
        <div className="relative z-[1] px-5 pb-5">
          {members.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-3)]">Lädt…</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {members.map((m) => {
                const checks = buildChecks(m);
                const okCount = checks.filter((c) => c.ok).length;
                const open = checks.filter((c) => !c.ok);
                return (
                  <li
                    key={m.id}
                    className="flex flex-col gap-3 rounded-[11px] border border-[var(--line-1)] bg-white/[0.025] p-4 backdrop-blur-md"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="grid size-10 flex-none place-items-center rounded-full text-[12px] font-semibold text-white shadow-[0_0_0_1px_rgba(255,255,255,0.15)_inset]"
                        style={{ background: gradientFor(m.role) }}
                      >
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-[var(--ink-1)]">{m.name}</p>
                        <p className="ovr mt-0.5">{m.role}</p>
                      </div>
                      <span className="mono text-[11px] text-[var(--ink-3)]">
                        {okCount}/{checks.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {checks.map((c) => (
                        <span
                          key={c.label}
                          title={c.ok ? `${c.label} verbunden` : c.hint}
                          className={`pill ${c.ok ? 'pill-ok' : 'pill-mute'}`}
                        >
                          {c.label}
                        </span>
                      ))}
                    </div>
                    {open.length > 0 && (
                      <ul className="space-y-0.5 border-t border-[var(--line-1)] pt-2 text-[11px] leading-snug text-[var(--ink-3)]">
                        {open.map((c) => (
                          <li key={c.label}>
                            <span className="font-medium text-[var(--ink-2)]">{c.label}:</span> {c.hint}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
