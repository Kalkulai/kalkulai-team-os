'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Database, Inbox, Mail, MousePointerClick, Reply, SearchCheck, Users } from 'lucide-react';
import { buildCampaignTrackingSnapshot, type CampaignDetail, type CampaignSummary, type CampaignTrackingSnapshot } from '@/lib/campaigns';

type Filter = 'all' | 'needs-leon' | 'needs-paul' | 'replies' | 'followups' | 'blocked';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Alle' },
  { id: 'needs-leon', label: 'Needs Leon' },
  { id: 'needs-paul', label: 'Needs Paul' },
  { id: 'replies', label: 'Replies' },
  { id: 'followups', label: 'Follow-ups due' },
  { id: 'blocked', label: 'Blocked' },
];

export function CampaignDashboard({
  campaigns,
  details,
}: {
  campaigns: CampaignSummary[];
  details: CampaignDetail[];
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const detailById = useMemo(() => new Map(details.map((detail) => [detail.id, detail])), [details]);
  const tracking = useMemo(() => buildCampaignTrackingSnapshot(campaigns, details), [campaigns, details]);
  const visible = campaigns.filter((campaign) => matchesFilter(campaign, filter));

  const totals = campaigns.reduce(
    (acc, campaign) => ({
      sent: acc.sent + campaign.stats.sent,
      replies: acc.replies + campaign.stats.replies,
      followups: acc.followups + campaign.stats.followupsDue,
      blocked: acc.blocked + campaign.stats.blocked,
    }),
    { sent: 0, replies: 0, followups: 0, blocked: 0 },
  );

  return (
    <section className="campaign-shell">
      <header className="campaign-hero glass">
        <div>
          <p className="ovr">GTM Campaigns</p>
          <h1>Kampagnensteuerung</h1>
          <p>Partnerschaften und Handwerker-Outreach an einem Ort, mit Aufgabenrouting statt Auto-Send.</p>
        </div>
        <div className="campaign-kpi-grid">
          <Metric icon={Mail} label="Sent" value={totals.sent} />
          <Metric icon={Reply} label="Replies" value={totals.replies} />
          <Metric icon={Bell} label="Follow-ups" value={totals.followups} tone={totals.followups > 0 ? 'warn' : undefined} />
          <Metric icon={AlertCircle} label="Blocked" value={totals.blocked} tone={totals.blocked > 0 ? 'danger' : undefined} />
        </div>
      </header>

      <CampaignDataStatus snapshot={tracking} />

      <div className="campaign-filterbar">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? 'is-active' : undefined}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="campaign-list">
        {visible.map((campaign) => (
          <details key={campaign.id} className="campaign-card glass" open>
            <summary>
              <div>
                <span className={`campaign-type tone-${campaign.type}`}>{campaign.type}</span>
                <h2>{campaign.name}</h2>
                <p>{campaign.leadCount} Leads · {campaign.status}</p>
              </div>
              <div className="campaign-card-metrics">
                <Metric label="Sent" value={campaign.stats.sent} />
                <Metric label="Reply-rate" value={formatRate(campaign.stats.replyRate)} />
                <Metric label="Open-rate" value={campaign.stats.openRate === null ? 'not tracked' : formatRate(campaign.stats.openRate)} />
                <Metric label="Due" value={campaign.stats.followupsDue} tone={campaign.stats.followupsDue > 0 ? 'warn' : undefined} />
              </div>
            </summary>
            <LeadTable detail={detailById.get(campaign.id)} />
          </details>
        ))}
        {visible.length === 0 && (
          <div className="campaign-empty glass">
            <Inbox size={22} aria-hidden />
            <h2>Keine Kampagnen in diesem Filter</h2>
            <p>Sobald der Sync oder Seed Leads liefert, erscheinen sie hier mit Timeline und naechster Aktion.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CampaignDataStatus({ snapshot }: { snapshot: CampaignTrackingSnapshot }) {
  return (
    <section className="campaign-data-status glass" aria-label="Kampagnen-Datenstand">
      <div className="campaign-data-main">
        <p className="ovr">Datenstand</p>
        <h2>{snapshot.sourceLabel}</h2>
        <span>{snapshot.campaignCount} Kampagnen · {snapshot.leadCount} Leads · {snapshot.noteEvents} Notes</span>
      </div>
      <div className="campaign-data-metrics">
        <Metric icon={Database} label="Provider events" value={snapshot.providerEvents} />
        <Metric icon={Bell} label="Due" value={snapshot.followupsDue} tone={snapshot.followupsDue > 0 ? 'warn' : undefined} />
        <Metric icon={SearchCheck} label="Preflight" value={snapshot.needsPreflight} tone={snapshot.needsPreflight > 0 ? 'warn' : undefined} />
      </div>
      <div className="campaign-data-lists">
        <StatusList title="Tracked" items={snapshot.tracked} />
        <StatusList title="Not tracked" items={snapshot.notTracked.length > 0 ? snapshot.notTracked : ['complete']} muted={snapshot.notTracked.length === 0} />
      </div>
    </section>
  );
}

function StatusList({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className={muted ? 'is-muted' : undefined}>
      <span>{title}</span>
      <strong>{items.join(' · ')}</strong>
    </div>
  );
}

function LeadTable({ detail }: { detail: CampaignDetail | undefined }) {
  if (!detail || detail.leads.length === 0) {
    return <p className="campaign-muted">Noch keine Leads in dieser Kampagne.</p>;
  }

  return (
    <div className="campaign-lead-table">
      {detail.leads.map((lead) => (
        <details key={lead.id} className="campaign-lead-row">
          <summary>
            <div>
              <strong>{lead.display_name || lead.company_name || lead.email || lead.id}</strong>
              <span>{lead.email || lead.source || 'ohne Kontaktpfad'}</span>
            </div>
            <Stage stage={lead.stage} />
            <span className="campaign-next">{lead.next_action || 'Keine Aktion gesetzt'}</span>
          </summary>
          <div className="campaign-timeline">
            {lead.events.map((event) => (
              <article key={`${lead.id}-${event.event_type}-${event.occurred_at ?? event.external_id ?? event.summary}`}>
                <EventIcon type={event.event_type} />
                <div>
                  <strong>{event.summary || event.event_type}</strong>
                  <span>{formatDate(event.occurred_at)} · {event.source || 'Team-OS'}</span>
                </div>
              </article>
            ))}
            {lead.events.length === 0 && <p className="campaign-muted">Noch keine Timeline-Events.</p>}
          </div>
        </details>
      ))}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon?: typeof Mail;
  label: string;
  value: number | string;
  tone?: 'warn' | 'danger';
}) {
  return (
    <div className={`campaign-metric ${tone ? `tone-${tone}` : ''}`}>
      {Icon && <Icon size={14} aria-hidden />}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Stage({ stage }: { stage: string }) {
  return <span className={`campaign-stage tone-${stage}`}>{stage.replaceAll('_', ' ')}</span>;
}

function EventIcon({ type }: { type: string }) {
  if (type === 'replied') return <Reply size={14} aria-hidden />;
  if (type === 'opened') return <MousePointerClick size={14} aria-hidden />;
  if (type === 'sent') return <Mail size={14} aria-hidden />;
  if (type === 'meeting_booked') return <CheckCircle2 size={14} aria-hidden />;
  return <Users size={14} aria-hidden />;
}

function matchesFilter(campaign: CampaignSummary, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'needs-leon') return campaign.type === 'partnerships' && (campaign.stats.replies > 0 || campaign.stats.followupsDue > 0);
  if (filter === 'needs-paul') return campaign.type === 'handwerker' && (campaign.stats.replies > 0 || campaign.stats.followupsDue > 0);
  if (filter === 'replies') return campaign.stats.replies > 0;
  if (filter === 'followups') return campaign.stats.followupsDue > 0;
  return campaign.stats.blocked > 0;
}

function formatRate(value: number | null) {
  return value === null ? '0%' : `${value}%`;
}

function formatDate(value?: string | null) {
  if (!value) return 'ohne Datum';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ohne Datum';
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
