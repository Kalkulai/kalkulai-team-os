'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { TeamVelocityChart } from '@/components/analytics/TeamVelocityChart';
import { WeekHeatmap } from '@/components/analytics/WeekHeatmap';
import { useHermes } from '@/components/hermes/HermesContext';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

interface PilotPerson {
  id: string;
  email: string | null;
  name: string | null;
  last_seen_at: string | null;
  status: 'active' | 'recent' | 'stale' | 'unknown';
  last_seen_label: string;
}

interface PilotEventCount {
  event: string;
  count: number;
}

interface PilotActivity {
  slug: string;
  name: string;
  owner: string | null;
  tracked_users: number;
  active_24h: number;
  active_7d: number;
  last_seen_at: string | null;
  last_seen_label: string;
  stale_after_hours: number;
  status: 'healthy' | 'warning' | 'stale' | 'unconfigured';
  needs_action: boolean;
  people: PilotPerson[];
  daily_counts_14d: number[];
  top_events_30d: PilotEventCount[];
  top_paths_30d: PilotEventCount[];
}

function prettyEventName(event: string): string {
  if (event === '$autocapture') return 'Clicks (autocapture)';
  if (event === '$pageview') return 'Page views';
  if (event === '$pageleave') return 'Page leaves';
  if (event === '$web_vitals') return 'Web vitals';
  if (event === '$rageclick') return 'Rage clicks';
  return event;
}

function Sparkline({ values, height = 28 }: { values: number[]; height?: number }) {
  if (values.length === 0 || values.every((v) => v === 0)) {
    return <div className="company-pilot-spark-empty">keine Aktivität (14d)</div>;
  }
  const max = Math.max(...values, 1);
  const width = 100;
  const step = width / (values.length - 1 || 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - (v / max) * height).toFixed(1)}`)
    .join(' ');
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="company-pilot-spark">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="company-pilot-spark-svg">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span className="company-pilot-spark-label">{total} events / 14d</span>
    </div>
  );
}

interface CompanyData {
  week_start: string;
  days: string[];
  hero: {
    pilots_active: number;
    pipeline_value_eur: number;
    demo_to_pilot_pct: number;
    demos_completed_week: number;
  };
  series: Array<{ memberId: string; name: string; role: string; daily: number[] }>;
  heatmap: Array<{ memberId: string; name: string; byWeekday: number[] }>;
  pilot_activity: PilotActivity[];
}

function formatEur(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k €`;
  return `${value.toFixed(0)} €`;
}

function pilotStatusLabel(status: PilotActivity['status']): string {
  switch (status) {
    case 'healthy':
      return 'gesund';
    case 'warning':
      return 'beobachten';
    case 'stale':
      return 'Action nötig';
    default:
      return 'nicht konfiguriert';
  }
}

function personStatusLabel(status: PilotPerson['status']): string {
  switch (status) {
    case 'active':
      return 'online <24h';
    case 'recent':
      return 'zuletzt aktiv';
    case 'stale':
      return 'inaktiv';
    default:
      return 'unbekannt';
  }
}

function pilotStatusClass(status: PilotActivity['status']): string {
  return `is-${status}`;
}

function personStatusClass(status: PilotPerson['status']): string {
  return `is-${status}`;
}

export default function CompanyPageClient() {
  const { sendMessage } = useHermes();
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let lastFetchAt = 0;
    const MIN_GAP_MS = 30_000;

    async function fetchOnce() {
      const now = Date.now();
      if (now - lastFetchAt < MIN_GAP_MS) return;
      lastFetchAt = now;
      try {
        const res = await fetch('/api/metrics/company', {
          headers: { Authorization: `Bearer ${SECRET}` },
          cache: 'no-store',
        });
        const payload = res.ok ? ((await res.json()) as CompanyData) : null;
        if (!cancelled) setData(payload);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchOnce();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') fetchOnce();
    }, 60_000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(intervalId);
    };
  }, []);

  function askHermes() {
    if (!data) return;
    const top = [...data.series]
      .sort((a, b) => b.daily.reduce((x, y) => x + y, 0) - a.daily.reduce((x, y) => x + y, 0))
      .slice(0, 3)
      .map((s) => `- ${s.name}: ${s.daily.reduce((x, y) => x + y, 0)} Aktivitätspunkte (30d)`)
      .join('\n');
    const pilotRisks = data.pilot_activity
      .filter((pilot) => pilot.needs_action)
      .slice(0, 5)
      .map(
        (pilot) =>
          `- ${pilot.name}: letzter Login ${pilot.last_seen_label}, aktiv 24h=${pilot.active_24h}, aktiv 7d=${pilot.active_7d}`,
      )
      .join('\n');
    const prompt = [
      'Schau dir die Firmen-Zahlen an:',
      `- Aktive Piloten: ${data.hero.pilots_active}`,
      `- Pipeline: ${formatEur(data.hero.pipeline_value_eur)}`,
      `- Demo→Pilot: ${data.hero.demo_to_pilot_pct.toFixed(0)}%`,
      `- Demos (Woche): ${data.hero.demos_completed_week}`,
      '',
      'Team-Velocity 30d:',
      top,
      '',
      'Pilot-Risiken laut PostHog:',
      pilotRisks || '- keine akuten Stale-Piloten',
      '',
      'Was sind die 2-3 wichtigsten Hebel diese Woche?',
    ].join('\n');
    sendMessage(prompt);
  }

  return (
    <div className="company-page">
      <div className="company-head">
        <h1 className="company-title">
          Firma <span className="company-sub">— Übersicht</span>
        </h1>
        {data && (
          <button
            type="button"
            className="analytics-ask-hermes"
            onClick={askHermes}
            aria-label="Hermes über Firmen-Zahlen befragen"
          >
            <Sparkles size={13} aria-hidden /> Hermes analysieren lassen
          </button>
        )}
      </div>

      {loading && <p className="text-[13px] text-[var(--ink-3)]">Lade …</p>}

      {!loading && data && (
        <>
          <div className="company-hero">
            <div className="company-hero-tile glass">
              <span className="company-hero-label">Aktive Piloten</span>
              <span className="company-hero-value">
                {data.hero.pilots_active}
                <span className="company-hero-unit">/{Math.max(data.pilot_activity.length, 6)}</span>
              </span>
            </div>
            <div className="company-hero-tile glass">
              <span className="company-hero-label">Pipeline</span>
              <span className="company-hero-value">{formatEur(data.hero.pipeline_value_eur)}</span>
            </div>
            <div className="company-hero-tile glass">
              <span className="company-hero-label">Demo → Pilot</span>
              <span className="company-hero-value">
                {data.hero.demo_to_pilot_pct.toFixed(0)}
                <span className="company-hero-unit">%</span>
              </span>
            </div>
            <div className="company-hero-tile glass">
              <span className="company-hero-label">Demos / Woche</span>
              <span className="company-hero-value">{data.hero.demos_completed_week}</span>
            </div>
          </div>

          <section className="company-section">
            <h2 className="company-section-title">Pilot-Aktivität (PostHog)</h2>
            <p className="company-section-sub">
              Wer war wann online, wer ist seit Tagen weg, und bei wem braucht Paul eine Action.
            </p>
            {data.pilot_activity.length === 0 ? (
              <div className="company-pilot-empty glass">
                Keine Pilot-Tracking-Regeln konfiguriert. Setze `PILOT_ACTIVITY_RULES_JSON` + PostHog-Creds.
              </div>
            ) : (
              <div className="company-pilot-grid">
                {data.pilot_activity.map((pilot) => (
                  <article key={pilot.slug} className={`company-pilot-card glass ${pilotStatusClass(pilot.status)}`}>
                    <div className="company-pilot-head">
                      <div>
                        <h3 className="company-pilot-title">{pilot.name}</h3>
                        <p className="company-pilot-meta">
                          {pilot.owner ? `Owner: ${pilot.owner}` : 'Owner offen'} · {pilotStatusLabel(pilot.status)}
                        </p>
                      </div>
                      <span className={`company-pilot-badge ${pilotStatusClass(pilot.status)}`}>
                        {pilotStatusLabel(pilot.status)}
                      </span>
                    </div>

                    <div className="company-pilot-stats">
                      <div>
                        <span className="company-pilot-stat-label">Aktiv 24h</span>
                        <strong className="company-pilot-stat-value">{pilot.active_24h}</strong>
                      </div>
                      <div>
                        <span className="company-pilot-stat-label">Aktiv 7d</span>
                        <strong className="company-pilot-stat-value">{pilot.active_7d}</strong>
                      </div>
                      <div>
                        <span className="company-pilot-stat-label">Tracked Users</span>
                        <strong className="company-pilot-stat-value">{pilot.tracked_users}</strong>
                      </div>
                    </div>

                    <div className="company-pilot-lastseen">
                      <span className="company-pilot-stat-label">Letzter Login</span>
                      <strong className="company-pilot-lastseen-value">{pilot.last_seen_label}</strong>
                      <span className="company-pilot-lastseen-sub">
                        SLA-Flag ab {pilot.stale_after_hours}h ohne Aktivität
                      </span>
                    </div>

                    <ul className="company-pilot-people">
                      {pilot.people.length === 0 ? (
                        <li className="company-pilot-person is-empty">Keine Personen im Tracking gefunden</li>
                      ) : (
                        pilot.people.map((person) => (
                          <li key={person.id} className="company-pilot-person">
                            <div>
                              <div className="company-pilot-person-name">{person.name || person.email || 'Unbekannter User'}</div>
                              <div className="company-pilot-person-email">{person.email || 'ohne E-Mail'}</div>
                            </div>
                            <div className="company-pilot-person-status-wrap">
                              <span className={`company-pilot-person-status ${personStatusClass(person.status)}`}>
                                {personStatusLabel(person.status)}
                              </span>
                              <span className="company-pilot-person-lastseen">{person.last_seen_label}</span>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>

                    <Sparkline values={pilot.daily_counts_14d ?? []} />

                    {(pilot.top_events_30d?.length ?? 0) > 0 && (
                      <div className="company-pilot-events">
                        <div className="company-pilot-events-title">Top features (30d)</div>
                        <ul className="company-pilot-events-list">
                          {pilot.top_events_30d.slice(0, 5).map((row) => (
                            <li key={row.event} className="company-pilot-events-row">
                              <span className="company-pilot-events-name">{prettyEventName(row.event)}</span>
                              <span className="company-pilot-events-count">{row.count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(pilot.top_paths_30d?.length ?? 0) > 0 && (
                      <div className="company-pilot-events">
                        <div className="company-pilot-events-title">Top pages (30d)</div>
                        <ul className="company-pilot-events-list">
                          {pilot.top_paths_30d.slice(0, 4).map((row) => (
                            <li key={row.event} className="company-pilot-events-row">
                              <span className="company-pilot-events-name">{row.event}</span>
                              <span className="company-pilot-events-count">{row.count}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="company-section">
            <h2 className="company-section-title">Team-Velocity (30 Tage)</h2>
            <p className="company-section-sub">Tasks erledigt + Commits, gestapelt pro Tag</p>
            <TeamVelocityChart days={data.days} series={data.series} />
          </section>

          <section className="company-section">
            <h2 className="company-section-title">Wochentag-Heatmap</h2>
            <p className="company-section-sub">
              Durchschnittliche Aktivität pro Wochentag (letzte 30 Tage)
            </p>
            <WeekHeatmap rows={data.heatmap} />
          </section>
        </>
      )}

      {!loading && !data && (
        <p className="text-[13px] text-[var(--ink-3)]">
          Noch keine Firmen-Metriken. Der Snapshot-Cron läuft täglich 23:30 UTC.
        </p>
      )}
    </div>
  );
}
