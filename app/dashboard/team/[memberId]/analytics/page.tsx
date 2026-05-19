'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { MetricGrid } from '@/components/analytics/MetricGrid';
import { TimeRangeSwitch, type AnalyticsRange } from '@/components/analytics/TimeRangeSwitch';
import { useHermes } from '@/components/hermes/HermesContext';

const SECRET = process.env.NEXT_PUBLIC_DASHBOARD_API_SECRET ?? '';

interface MetricsPayload {
  memberId: string;
  week_now: Record<string, { sum_value: number } | null>;
  week_prev: Record<string, { sum_value: number } | null>;
  month: Record<string, { sum_value: number } | null>;
  sparklines: Record<string, Array<{ day: string; value: number }>>;
}

interface Member {
  id: string;
  name: string;
  role: string;
}

export default function MemberAnalyticsPage() {
  const params = useParams<{ memberId: string }>();
  const memberId = params.memberId;
  const { sendMessage } = useHermes();
  const [range, setRange] = useState<AnalyticsRange>('week');
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  function buildHermesContext(): string {
    if (!data || !member) return '';
    const src = range === 'month' ? data.month : data.week_now;
    const prev = data.week_prev;
    const lines = [`Schau dir bitte ${member.name}s Zahlen ${range === 'month' ? 'diesen Monat' : 'diese Woche'} an:`];
    for (const [k, v] of Object.entries(src)) {
      if (!v) continue;
      const prevV = prev?.[k]?.sum_value ?? 0;
      lines.push(`- ${k}: ${v.sum_value} (Vorwoche ${prevV})`);
    }
    lines.push('', 'Was fällt dir auf? Welche 1-2 konkreten Hebel sollte ich diese Woche ziehen?');
    return lines.join('\n');
  }

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/metrics/${memberId}?range=${range}`, {
        headers: { Authorization: `Bearer ${SECRET}` },
        cache: 'no-store',
      }).then((r) => r.json()),
      fetch('/api/members', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([metrics, members]: [MetricsPayload, Member[]]) => {
        setData(metrics);
        setMember(members.find((m) => m.id === memberId) ?? null);
      })
      .finally(() => setLoading(false));
  }, [memberId, range]);

  return (
    <div className="analytics-page">
      <div className="analytics-head">
        <Link href={`/dashboard/team?member=${memberId}`} className="analytics-back">
          <ChevronLeft size={14} aria-hidden /> Team
        </Link>
        <h1 className="analytics-title">
          {member ? member.name : 'Member'} <span className="analytics-sub">— Analytics</span>
        </h1>
      </div>
      <div className="analytics-toolbar">
        <TimeRangeSwitch value={range} onChange={setRange} />
        {data && (
          <button
            type="button"
            className="analytics-ask-hermes"
            onClick={() => sendMessage(buildHermesContext())}
            disabled={loading}
            aria-label="Frag Hermes zu diesen Zahlen"
          >
            <Sparkles size={13} aria-hidden /> Hermes analysieren lassen
          </button>
        )}
      </div>
      {loading && <p className="text-[13px] text-[var(--ink-3)]">Lade …</p>}
      {!loading && data && <MetricGrid metrics={data} range={range} />}
      {!loading && !data && (
        <p className="text-[13px] text-[var(--ink-3)]">
          Noch keine Metriken. Der Snapshot-Cron läuft täglich 23:30 UTC.
        </p>
      )}
    </div>
  );
}
