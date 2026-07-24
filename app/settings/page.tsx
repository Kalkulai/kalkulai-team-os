'use client';
import { Suspense, useState, useCallback } from 'react';
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
  const { members, activeId, activeMember } = useActiveMember({ details: true });

  return (
    <div className="space-y-5">
      <section className="glass card-rise overflow-hidden">
        <header className="relative z-[1] px-5 pt-[20px] pb-[14px]">
          <h2 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.015em] text-[var(--ink-1)]">
            KPIs und Projekte
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--ink-3)]">
            Eigene KPIs anlegen, Ziele setzen, Projekte mit Teilschritten planen.
          </p>
        </header>
        <div className="relative z-[1] px-5 pb-5">
          {activeId ? (
            <KpiManager userId={activeId} member={activeMember} />
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
                {activeMember.calendar_connected ? (
                  <>
                    Verbunden mit{' '}
                    <span className="font-medium text-[var(--ink-1)]">
                      {activeMember.google_calendar_email ?? 'Google Calendar'}
                    </span>
                  </>
                ) : activeMember.google_calendar_email ? (
                  <>
                    Token ungültig oder revoked — bitte neu verbinden (war zuletzt{' '}
                    <span className="font-medium text-[var(--ink-1)]">
                      {activeMember.google_calendar_email}
                    </span>
                    ).
                  </>
                ) : (
                  'Noch nicht verbunden — Briefing nutzt Fallback-Kalender.'
                )}
              </p>
              <a
                href={`/api/oauth/google/start?userId=${activeMember.id}`}
                className="btn-action"
              >
                {activeMember.calendar_connected
                  ? 'Anderen Account verbinden'
                  : activeMember.google_calendar_email
                    ? 'Neu verbinden'
                    : 'Mit Google Calendar verbinden'}
              </a>
            </div>
          ) : (
            <p className="text-[13px] text-[var(--ink-3)]">Lädt…</p>
          )}
        </div>
      </section>

      <ImportPanel />

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

type ImportStatus = 'idle' | 'running' | 'done' | 'error';

interface HubspotImportState { status: ImportStatus; companies: number; pages: number }
interface NotionImportState  { status: ImportStatus; imported: number; skipped: number; pages: number }
interface PilotImportState   { status: ImportStatus; seeded: number; companies: string[] }

function ImportPanel() {
  const [hs, setHs] = useState<HubspotImportState>({ status: 'idle', companies: 0, pages: 0 });
  const [no, setNo] = useState<NotionImportState>({ status: 'idle', imported: 0, skipped: 0, pages: 0 });
  const [pi, setPi] = useState<PilotImportState>({ status: 'idle', seeded: 0, companies: [] });
  const [running, setRunning] = useState(false);

  const startImport = useCallback(async () => {
    setRunning(true);
    setHs({ status: 'running', companies: 0, pages: 0 });
    setNo({ status: 'running', imported: 0, skipped: 0, pages: 0 });
    setPi({ status: 'idle', seeded: 0, companies: [] });

    const [hubResult, notionResult] = await Promise.allSettled([
      (async () => {
        let after: string | undefined;
        let totalCompanies = 0;
        let pages = 0;
        do {
          const r = await fetch('/api/sales/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ after }),
          });
          if (!r.ok) throw new Error(`HubSpot ${r.status}`);
          const d = await r.json();
          totalCompanies += d.stats?.companies ?? 0;
          pages++;
          after = d.nextAfter ?? undefined;
          setHs({ status: 'running', companies: totalCompanies, pages });
        } while (after);
        return totalCompanies;
      })(),
      (async () => {
        let cursor: string | undefined;
        let totalImported = 0;
        let totalSkipped = 0;
        let pages = 0;
        do {
          const r = await fetch('/api/sales/sync-notion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cursor, limit: 20 }),
          });
          if (!r.ok) throw new Error(`Notion ${r.status}`);
          const d = await r.json();
          totalImported += d.imported ?? 0;
          totalSkipped += d.skipped ?? 0;
          pages++;
          cursor = d.nextCursor ?? undefined;
          setNo({ status: 'running', imported: totalImported, skipped: totalSkipped, pages });
        } while (cursor);
        return totalImported;
      })(),
    ]);

    setHs((s) => ({ ...s, status: hubResult.status === 'fulfilled' ? 'done' : 'error' }));
    setNo((s) => ({ ...s, status: notionResult.status === 'fulfilled' ? 'done' : 'error' }));

    setPi({ status: 'running', seeded: 0, companies: [] });
    try {
      const r = await fetch('/api/sales/seed-pilots', { method: 'POST' });
      const d = await r.json();
      setPi({ status: 'done', seeded: d.seeded ?? 0, companies: d.companies ?? [] });
    } catch {
      setPi((s) => ({ ...s, status: 'error' }));
    }

    setRunning(false);
  }, []);

  return (
    <section className="glass card-rise overflow-hidden">
      <header className="relative z-[1] px-5 pt-[18px] pb-[14px]">
        <span className="ovr">Daten importieren</span>
      </header>
      <div className="relative z-[1] px-5 pb-5 space-y-4">
        <p className="text-[12.5px] text-[var(--ink-3)]">
          Importiert alle HubSpot-Firmen und Notion-Transkripte in die Datenbank. HubSpot und Notion laufen parallel.
        </p>
        <div className="grid gap-2.5 md:grid-cols-3">
          <ImportStatusCard
            label="HubSpot Firmen"
            status={hs.status}
            detail={hs.status !== 'idle' ? `${hs.companies} Firmen · ${hs.pages} Seiten` : undefined}
          />
          <ImportStatusCard
            label="Notion Transkripte"
            status={no.status}
            detail={no.status !== 'idle' ? `${no.imported} importiert · ${no.skipped} übersprungen` : undefined}
          />
          <ImportStatusCard
            label="Pilot-Status"
            status={pi.status}
            detail={pi.status === 'done' ? `${pi.seeded} Pilot-Kunden markiert` : undefined}
          />
        </div>
        <button onClick={startImport} disabled={running} className="btn-action disabled:opacity-40">
          {running ? 'Importiert…' : 'Import starten'}
        </button>
      </div>
    </section>
  );
}

function ImportStatusCard({ label, status, detail }: { label: string; status: ImportStatus; detail?: string }) {
  const color =
    status === 'done' ? 'text-emerald-400' :
    status === 'error' ? 'text-red-400' :
    status === 'running' ? 'text-amber-400' :
    'text-[var(--ink-3)]';
  const icon = status === 'done' ? '✓' : status === 'error' ? '✗' : status === 'running' ? '…' : '○';
  return (
    <div className="rounded-[9px] border border-[var(--line-1)] bg-white/[0.025] p-3">
      <div className="flex items-center gap-2">
        <span className={`text-[13px] font-medium ${color}`}>{icon}</span>
        <span className="text-[13px] font-medium text-[var(--ink-1)]">{label}</span>
      </div>
      {detail && <p className="mt-1 text-[11.5px] text-[var(--ink-3)]">{detail}</p>}
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
      ok: !!m.calendar_connected,
      hint: m.google_calendar_email
        ? 'Token ungültig — Person muss erneut "Mit Google Calendar verbinden" klicken'
        : 'Person klickt "Mit Google Calendar verbinden"',
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
