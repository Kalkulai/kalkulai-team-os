'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { TeamVelocityChart } from '@/components/analytics/TeamVelocityChart';
import { WeekHeatmap } from '@/components/analytics/WeekHeatmap';
import { useHermes } from '@/components/hermes/HermesContext';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

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
}

function formatEur(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k €`;
  return `${value.toFixed(0)} €`;
}

export default function CompanyPage() {
  const { sendMessage } = useHermes();
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/metrics/company', {
      headers: { Authorization: `Bearer ${SECRET}` },
      cache: 'no-store',
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: CompanyData | null) => setData(payload))
      .finally(() => setLoading(false));
  }, []);

  function askHermes() {
    if (!data) return;
    const top = [...data.series]
      .sort((a, b) => b.daily.reduce((x, y) => x + y, 0) - a.daily.reduce((x, y) => x + y, 0))
      .slice(0, 3)
      .map((s) => `- ${s.name}: ${s.daily.reduce((x, y) => x + y, 0)} Aktivitätspunkte (30d)`)
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
                <span className="company-hero-unit">/5</span>
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
