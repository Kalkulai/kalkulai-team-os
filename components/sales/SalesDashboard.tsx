'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SalesCompanyListItem, SalesCompanyDetail, SalesEndpoint, SalesCompanyInsights, SalesActivity } from '@/types/sales';
import { ContactForm } from '@/components/sales/ContactForm';

const ACTIVITY_LABEL: Record<string, string> = {
  call: 'Call', email: 'E-Mail', note: 'Notiz', task: 'Task',
  meeting: 'Meeting', whatsapp: 'WhatsApp', transcript: 'Transkript',
};

const SIGNAL_LABEL: Record<string, string> = {
  hot: 'Hot', warm: 'Warm', cold: 'Kalt', unknown: 'Unbekannt',
};

const PILOT_LABEL: Record<string, string> = {
  active: 'Aktiver Pilot',
  committed: 'Pilot zugesagt',
};

const PILOT_CLASS: Record<string, string> = {
  active: 'pilot-active',
  committed: 'pilot-committed',
};

function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  return `vor ${days}d`;
}

// ── KI-Analyse Panel ──────────────────────────────────────────────────────────

function KIPanel({ insights }: { insights: SalesCompanyInsights | null }) {
  const signal = insights?.buying_signal ?? 'unknown';
  const hasData = insights && (
    (insights.pain_points?.length ?? 0) > 0 ||
    (insights.interests?.length ?? 0) > 0 ||
    (insights.software_used?.length ?? 0) > 0 ||
    insights.notes ||
    insights.employee_count != null
  );

  return (
    <div className="sales-ki-panel">
      <div className="sales-ki-header">
        <span className="sales-ki-title">KI-Analyse</span>
        {insights?.last_analyzed_at && (
          <span className="sales-ki-ts">Stand: {insights.last_analyzed_at.slice(0, 10)}</span>
        )}
        {signal !== 'unknown' && (
          <span className={`sales-ki-signal signal-${signal}`}>
            {signal === 'hot' ? '🔥' : signal === 'warm' ? '🌡' : '❄️'} {SIGNAL_LABEL[signal]}
          </span>
        )}
      </div>
      {!hasData ? (
        <p className="sales-ki-empty">
          {!insights
            ? 'Noch keine Analyse — Notion-Checkbox setzen um erstes Transkript zu importieren.'
            : 'Zu wenig Gesprächsdaten für eine Auswertung.'}
        </p>
      ) : (
        <div className="sales-ki-grid">
          {insights.employee_count != null && (
            <div className="sales-ki-item">
              <span className="sales-ki-label">Mitarbeiter</span>
              <strong className="sales-ki-value">{insights.employee_count}</strong>
            </div>
          )}
          {(insights.pain_points?.length ?? 0) > 0 && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Pain Points</span>
              <div className="sales-tag-row">
                {insights!.pain_points.map((s) => (
                  <span key={s} className="sales-badge tone-warn">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(insights.interests?.length ?? 0) > 0 && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Interessen</span>
              <div className="sales-tag-row">
                {insights!.interests.map((s) => (
                  <span key={s} className="sales-badge tone-brand">{s}</span>
                ))}
              </div>
            </div>
          )}
          {(insights.software_used?.length ?? 0) > 0 && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Aktuelle Software</span>
              <div className="sales-tag-row">
                {insights!.software_used.map((s) => (
                  <span key={s} className="sales-badge tone-neutral">{s}</span>
                ))}
              </div>
            </div>
          )}
          {insights.notes && (
            <div className="sales-ki-item sales-ki-full">
              <span className="sales-ki-label">Notiz</span>
              <p className="sales-ki-notes">{insights.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Transcript Modal ───────────────────────────────────────────────────────────

function TranscriptModal({ activity, onClose }: { activity: SalesActivity; onClose: () => void }) {
  const meta = activity.meta as Record<string, string>;
  const kt = meta?.key_takeaways;
  const notionUrl = meta?.notion_url;

  return (
    <div className="sales-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={activity.title}>
      <div className="sales-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sales-modal-header">
          <div>
            <span className="sales-ki-label">{activity.occurred_at.slice(0, 10)}</span>
            <h3 className="sales-modal-title">{activity.title}</h3>
          </div>
          <button
            type="button"
            className="sales-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
        <div className="sales-modal-body">
          {activity.summary && (
            <div className="sales-modal-section">
              <span className="sales-ki-label">Zusammenfassung</span>
              <p className="sales-modal-text">{activity.summary}</p>
            </div>
          )}
          {kt && (
            <div className="sales-modal-section">
              <span className="sales-ki-label">Key Takeaways</span>
              <pre className="sales-tx-pre">{kt}</pre>
            </div>
          )}
          {!activity.summary && !kt && (
            <p className="sales-muted">Keine weiteren Inhalte gespeichert.</p>
          )}
        </div>
        {notionUrl && (
          <div className="sales-modal-footer">
            <a href={notionUrl} target="_blank" rel="noreferrer" className="sales-notion-link">
              In Notion öffnen →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cold Call Session ─────────────────────────────────────────────────────────

const CALL_OUTCOMES = [
  { value: 'reached', label: 'Erreicht', cls: 'ccs-outcome-reached' },
  { value: 'voicemail', label: 'Voicemail', cls: 'ccs-outcome-voicemail' },
  { value: 'no_answer', label: 'Kein Anschluss', cls: 'ccs-outcome-miss' },
  { value: 'not_interested', label: 'Kein Interesse', cls: 'ccs-outcome-reject' },
  { value: 'appointment', label: 'Termin vereinbart', cls: 'ccs-outcome-appt' },
];

function ColdCallSession({
  queue,
  memberId,
  onClose,
}: {
  queue: SalesCompanyListItem[];
  memberId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('reached');
  const [nextStepNote, setNextStepNote] = useState('');
  const [logging, setLogging] = useState(false);
  const [stats, setStats] = useState({ reached: 0, voicemail: 0, no_answer: 0, not_interested: 0, appointment: 0, skipped: 0 });

  const current = queue[index];
  const done = !current || index >= queue.length;

  async function logAndNext() {
    if (!current || logging) return;
    setLogging(true);
    try {
      const ns =
        nextStepNote.trim() ||
        (outcome === 'appointment' ? 'Termin vorbereiten' :
         outcome === 'reached' ? 'Follow-up planen' :
         outcome === 'voicemail' || outcome === 'no_answer' ? 'Nochmal anrufen' : undefined);

      await fetch('/api/sales/activities/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: current.id,
          notes: notes || undefined,
          outcome,
          next_step: ns,
        }),
      });
      setStats((s) => ({ ...s, total: (s as Record<string, number>).total ?? 0, [outcome]: ((s as Record<string, number>)[outcome] ?? 0) + 1 }));
      advance();
    } finally {
      setLogging(false);
    }
  }

  function advance() {
    setNotes('');
    setNextStepNote('');
    setOutcome('reached');
    setIndex((i) => i + 1);
  }

  function skip() {
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    advance();
  }

  function handleClose() {
    router.refresh();
    onClose();
  }

  const total = stats.reached + stats.voicemail + stats.no_answer + stats.not_interested + stats.appointment;

  if (done) {
    return (
      <div className="ccs-overlay" role="dialog" aria-modal="true">
        <div className="ccs-modal ccs-done">
          <div className="ccs-done-icon">✓</div>
          <h2 className="ccs-done-title">Session abgeschlossen</h2>
          <div className="ccs-done-stats">
            <div className="ccs-stat"><span className="ccs-stat-num ccs-reached">{stats.reached}</span><span className="ccs-stat-lbl">Erreicht</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num ccs-appt">{stats.appointment}</span><span className="ccs-stat-lbl">Termine</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num">{stats.voicemail}</span><span className="ccs-stat-lbl">Voicemail</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num">{stats.no_answer}</span><span className="ccs-stat-lbl">Kein Anschluss</span></div>
            <div className="ccs-stat"><span className="ccs-stat-num">{stats.not_interested}</span><span className="ccs-stat-lbl">Kein Interesse</span></div>
          </div>
          <p className="ccs-done-rate">{total > 0 ? `Erreichquote: ${Math.round(((stats.reached + stats.appointment) / total) * 100)} %` : ''}</p>
          <button type="button" className="sales-btn" onClick={handleClose}>Fertig</button>
        </div>
      </div>
    );
  }

  const ins = current.insights_json;
  const signal = ins?.buying_signal;

  return (
    <div className="ccs-overlay" role="dialog" aria-modal="true">
      <div className="ccs-modal">
        {/* Progress bar */}
        <div className="ccs-topbar">
          <div className="ccs-progress-wrap">
            <div className="ccs-progress-bar" style={{ width: `${(index / queue.length) * 100}%` }} />
          </div>
          <div className="ccs-topbar-meta">
            <span className="ccs-counter">{index + 1} / {queue.length}</span>
            <div className="ccs-mini-stats">
              <span className="ccs-reached">✓ {stats.reached + stats.appointment}</span>
              <span>📞 {stats.voicemail}</span>
              <span>✗ {stats.no_answer}</span>
            </div>
            <button type="button" className="ccs-close-btn" onClick={handleClose} aria-label="Session beenden">✕</button>
          </div>
        </div>

        {/* Company info */}
        <div className="ccs-company">
          <div className="ccs-company-head">
            <h2 className="ccs-company-name">{current.name}</h2>
            {signal && signal !== 'unknown' && (
              <span className={`sales-ki-signal signal-${signal}`}>
                {signal === 'hot' ? '🔥' : signal === 'warm' ? '🌡' : '❄️'} {SIGNAL_LABEL[signal]}
              </span>
            )}
          </div>
          <p className="ccs-company-meta">
            {current.status}{current.industry ? ` · ${current.industry}` : ''}
            {current.days_since_contact !== null
              ? ` · letzter Kontakt vor ${current.days_since_contact}d`
              : ' · noch kein Kontakt'}
          </p>
          {current.next_step && (
            <div className="ccs-next-step">→ {current.next_step}</div>
          )}
          {ins && (
            <div className="ccs-insights-row">
              {ins.employee_count != null && (
                <span className="ccs-insight-chip">{ins.employee_count} MA</span>
              )}
              {(ins.software_used?.length ?? 0) > 0 && (
                <span className="ccs-insight-chip ccs-software">{ins.software_used.slice(0, 2).join(', ')}</span>
              )}
              {(ins.pain_points?.length ?? 0) > 0 && (
                <span className="ccs-insight-chip ccs-pain">{ins.pain_points[0]}</span>
              )}
            </div>
          )}
          {current.transcript_count > 0 && (
            <Link
              href={`/dashboard/sales?member=${memberId}&company=${current.id}`}
              target="_blank"
              className="ccs-open-link"
            >
              {current.transcript_count} Gespräch{current.transcript_count > 1 ? 'e' : ''} · Detail öffnen →
            </Link>
          )}
        </div>

        {/* Outcome buttons */}
        <div className="ccs-outcomes">
          {CALL_OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`ccs-outcome-btn ${o.cls}${outcome === o.value ? ' is-active' : ''}`}
              onClick={() => {
                setOutcome(o.value);
                if ((o.value === 'voicemail' || o.value === 'no_answer') && !nextStepNote) {
                  setNextStepNote('Nochmal anrufen');
                } else if (o.value === 'appointment' && !nextStepNote) {
                  setNextStepNote('Termin vorbereiten');
                } else if (nextStepNote === 'Nochmal anrufen' && o.value !== 'voicemail' && o.value !== 'no_answer') {
                  setNextStepNote('');
                }
              }}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Notes */}
        <textarea
          className="sales-input sales-textarea ccs-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Gesprächsnotizen (optional)…"
          rows={2}
        />

        {/* Next step */}
        <input
          className="sales-input ccs-nextstep"
          value={nextStepNote}
          onChange={(e) => setNextStepNote(e.target.value)}
          placeholder="Nächster Schritt…"
        />

        {/* Actions */}
        <div className="ccs-actions">
          <button type="button" className="ccs-skip-btn" onClick={skip}>
            Überspringen
          </button>
          <button
            type="button"
            className="ccs-save-btn"
            onClick={logAndNext}
            disabled={logging}
          >
            {logging ? 'Speichert…' : 'Speichern & Weiter →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pilot Pipeline ─────────────────────────────────────────────────────────────

function PilotCard({ company, memberId }: { company: SalesCompanyListItem; memberId: string }) {
  const ins = company.insights_json;
  const signal = ins?.buying_signal;
  return (
    <Link
      href={`/dashboard/sales?member=${memberId}&company=${company.id}`}
      className="pp-card"
    >
      <div className="pp-card-head">
        <strong className="pp-card-name">{company.name}</strong>
        {signal && signal !== 'unknown' && (
          <span className={`pp-signal signal-${signal}`}>
            {signal === 'hot' ? '🔥' : signal === 'warm' ? '🌡' : '❄️'}
          </span>
        )}
      </div>
      {company.industry && <span className="pp-meta">{company.industry}</span>}
      <div className="pp-badges">
        {company.transcript_count > 0 && (
          <span className="sales-tx-badge">{company.transcript_count} TX</span>
        )}
        {company.last_activity_at && (
          <span className="sales-days-badge">{daysAgo(company.last_activity_at)}</span>
        )}
      </div>
      {ins?.employee_count != null && (
        <span className="pp-employees">{ins.employee_count} Mitarbeiter</span>
      )}
      {(ins?.software_used?.length ?? 0) > 0 && (
        <span className="pp-software">{ins!.software_used.slice(0, 2).join(', ')}</span>
      )}
      {company.next_step && (
        <span className="pp-nextstep">→ {company.next_step}</span>
      )}
    </Link>
  );
}

function PilotPipeline({ companies, memberId }: { companies: SalesCompanyListItem[]; memberId: string }) {
  const active = companies.filter((c) => c.pilot_status === 'active');
  const committed = companies.filter((c) => c.pilot_status === 'committed');
  const interested = companies.filter(
    (c) =>
      !c.pilot_status &&
      c.transcript_count > 0 &&
      (c.insights_json?.buying_signal === 'hot' || c.insights_json?.buying_signal === 'warm'),
  );
  const contacted = companies.filter(
    (c) =>
      !c.pilot_status &&
      c.transcript_count > 0 &&
      (c.insights_json?.buying_signal === 'cold' || !c.insights_json?.buying_signal || c.insights_json?.buying_signal === 'unknown'),
  );

  const cols = [
    { key: 'contacted', label: 'Kontaktiert', items: contacted, cls: 'pp-col-contacted' },
    { key: 'interested', label: 'Pilot-Interessiert', items: interested, cls: 'pp-col-interested' },
    { key: 'committed', label: 'Pilot zugesagt', items: committed, cls: 'pp-col-committed' },
    { key: 'active', label: 'Aktive Pilots', items: active, cls: 'pp-col-active' },
  ];

  return (
    <div className="pp-pipeline">
      {cols.map((col) => (
        <div key={col.key} className={`pp-col ${col.cls}`}>
          <div className="pp-col-head">
            <span className="pp-col-title">{col.label}</span>
            <span className="pp-col-count">{col.items.length}</span>
          </div>
          <div className="pp-col-cards">
            {col.items.length === 0 ? (
              <p className="pp-empty">—</p>
            ) : (
              col.items.map((c) => (
                <PilotCard key={c.id} company={c} memberId={memberId} />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function SalesDashboard({
  memberId,
  companies,
  selected,
}: {
  memberId: string;
  companies: SalesCompanyListItem[];
  selected: SalesCompanyDetail | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'leads' | 'pipeline'>('leads');
  const [nextStep, setNextStep] = useState(selected?.next_step ?? '');
  const [showContactForm, setShowContactForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calling, setCalling] = useState<string | null>(null);
  const [showLogCall, setShowLogCall] = useState(false);
  const [callNotes, setCallNotes] = useState('');
  const [callOutcome, setCallOutcome] = useState('reached');
  const [callDurationMin, setCallDurationMin] = useState('');
  const [callNextStep, setCallNextStep] = useState('');
  const [loggingCall, setLoggingCall] = useState(false);
  const [activeTab, setActiveTab] = useState<'gespräche' | 'aktivitäten'>('gespräche');
  const [modalActivity, setModalActivity] = useState<SalesActivity | null>(null);
  const [showCallDropdown, setShowCallDropdown] = useState(false);
  const [showColdCall, setShowColdCall] = useState(false);

  async function logCall() {
    if (!selected || loggingCall) return;
    setLoggingCall(true);
    try {
      const ns = callNextStep.trim() ||
        (callOutcome === 'voicemail' || callOutcome === 'no_answer' ? 'Nochmal anrufen' : undefined);
      const res = await fetch('/api/sales/activities/log-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selected.id,
          notes: callNotes || undefined,
          outcome: callOutcome,
          duration_min: callDurationMin ? Number(callDurationMin) : undefined,
          next_step: ns,
        }),
      });
      const data = await res.json();
      if (!data.ok) { alert(`Fehler: ${data.error}`); return; }
      setCallNotes('');
      setCallDurationMin('');
      setCallNextStep('');
      setCallOutcome('reached');
      setShowLogCall(false);
      if (ns) setNextStep(ns);
      router.refresh();
    } finally {
      setLoggingCall(false);
    }
  }

  async function initiateCall(ep: SalesEndpoint) {
    if (!selected || calling) return;
    setCalling(ep.id);
    setShowCallDropdown(false);
    try {
      const res = await fetch('/api/sales/telephony/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointId: ep.id, companyId: selected.id }),
      });
      const data = await res.json();
      if (!data.ok) alert(`Call fehlgeschlagen: ${data.error}`);
      else router.refresh();
    } finally {
      setCalling(null);
    }
  }

  const filtered = query
    ? companies.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : companies;

  async function saveNextStep() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/sales/companies/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ next_step: nextStep || null }),
    });
    setSaving(false);
    router.refresh();
  }

  const transcripts = selected?.activities.filter((a) => a.activity_type === 'transcript') ?? [];
  const otherActivities = selected?.activities.filter((a) => a.activity_type !== 'transcript') ?? [];
  const phoneEndpoints = selected?.endpoints.filter(
    (ep) => (ep.channel === 'phone' || ep.channel === 'mobile') && !ep.do_not_call
  ) ?? [];

  // Queue for cold call session: non-pilot leads, not contacted recently, highest priority first
  const coldCallQueue = companies.filter(
    (c) => !c.pilot_status && (c.days_since_contact === null || c.days_since_contact >= 3),
  );

  const pilotCounts = {
    active: companies.filter((c) => c.pilot_status === 'active').length,
    committed: companies.filter((c) => c.pilot_status === 'committed').length,
    interested: companies.filter(
      (c) => !c.pilot_status && c.transcript_count > 0 &&
        (c.insights_json?.buying_signal === 'hot' || c.insights_json?.buying_signal === 'warm'),
    ).length,
  };

  return (
    <section className="sales-shell">
      <header>
        <p className="ovr">Sales OS</p>
        <div className="sales-top-row">
          <h1>{view === 'pipeline' ? 'Pilot-Pipeline' : 'Leads'}</h1>
          <div className="sales-top-actions">
            <div className="sales-pipeline-summary">
              <span className="sales-badge pilot-active">{pilotCounts.active} Pilots</span>
              {pilotCounts.committed > 0 && (
                <span className="sales-badge pilot-committed">{pilotCounts.committed} zugesagt</span>
              )}
              {pilotCounts.interested > 0 && (
                <span className="sales-badge tone-brand">{pilotCounts.interested} interessiert</span>
              )}
            </div>
            <button
              type="button"
              className={`sales-btn${view === 'pipeline' ? ' sales-btn-active' : ''}`}
              onClick={() => setView((v) => v === 'pipeline' ? 'leads' : 'pipeline')}
            >
              {view === 'pipeline' ? '← Leads' : 'Pipeline'}
            </button>
          </div>
        </div>
      </header>

      {/* Pipeline View */}
      {view === 'pipeline' && (
        <PilotPipeline companies={companies} memberId={memberId} />
      )}

      {/* Leads View */}
      {view === 'leads' && (
        <div className="sales-grid">

          {/* ── Lead List ─────────────────────────────────────────────────────── */}
          <div className="sales-list">
            <div className="sales-list-toolbar">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Suchen…"
                className="sales-search"
              />
              <button
                type="button"
                className="sales-btn sales-kaltakquise-btn"
                onClick={() => setShowColdCall(true)}
                title={`${coldCallQueue.length} Leads in der Queue`}
              >
                Kaltakquise
              </button>
            </div>
            {filtered.length === 0 && <p className="sales-muted">Keine Leads gefunden.</p>}
            {filtered.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/sales?member=${memberId}&company=${c.id}`}
                className={`sales-lead-card${selected?.id === c.id ? ' is-active' : ''}${c.priority_score >= 4 ? ' is-urgent' : ''}`}
              >
                <div className="sales-lead-top">
                  <strong>{c.name}</strong>
                  <div className="sales-lead-badges">
                    {c.pilot_status && (
                      <span className={`sales-pilot-badge ${PILOT_CLASS[c.pilot_status]}`}>
                        {c.pilot_status === 'active' ? '✓ Pilot' : 'Zugesagt'}
                      </span>
                    )}
                    {!c.pilot_status && c.insights_json?.buying_signal && c.insights_json.buying_signal !== 'unknown' && (
                      <span className={`sales-signal-badge signal-${c.insights_json.buying_signal}`}>
                        {c.insights_json.buying_signal === 'hot' ? '🔥' : c.insights_json.buying_signal === 'warm' ? '🌡' : ''}
                        {SIGNAL_LABEL[c.insights_json.buying_signal]}
                      </span>
                    )}
                    {c.transcript_count > 0 && (
                      <span className="sales-tx-badge" title={`${c.transcript_count} Gespräch${c.transcript_count > 1 ? 'e' : ''}`}>
                        {c.transcript_count} TX
                      </span>
                    )}
                    {c.days_since_contact !== null && (
                      <span className={`sales-days-badge${c.days_since_contact >= 14 ? ' tone-warn' : ''}`}>
                        {c.days_since_contact === 0 ? 'heute' : `${c.days_since_contact}d`}
                      </span>
                    )}
                  </div>
                </div>
                <span className="sales-lead-meta">
                  {c.status}
                  {c.industry ? ` · ${c.industry}` : ''}
                  {c.contact_count > 0 ? ` · ${c.contact_count} Kontakt${c.contact_count > 1 ? 'e' : ''}` : ''}
                  {c.insights_json?.employee_count != null ? ` · ${c.insights_json.employee_count} MA` : ''}
                </span>
                {c.last_activity_at && (
                  <span className="meta">
                    {ACTIVITY_LABEL[c.last_activity_type ?? ''] ?? c.last_activity_type} {daysAgo(c.last_activity_at)}
                  </span>
                )}
                {c.next_step && <span className="meta next-step">→ {c.next_step}</span>}
              </Link>
            ))}
          </div>

          {/* ── Detail Panel ──────────────────────────────────────────────────── */}
          <div>
            {!selected ? (
              <p className="sales-muted">Lead auswählen.</p>
            ) : (
              <div className="sales-detail">

                {/* Company header */}
                <div className="sales-detail-header">
                  <div>
                    <div className="sales-company-name-row">
                      <h2>{selected.name}</h2>
                      {selected.pilot_status && (
                        <span className={`sales-pilot-badge sales-pilot-badge-lg ${PILOT_CLASS[selected.pilot_status]}`}>
                          {PILOT_LABEL[selected.pilot_status]}
                        </span>
                      )}
                    </div>
                    <p>
                      {selected.status}
                      {selected.website ? (
                        <> · <a href={selected.website} target="_blank" rel="noreferrer">{selected.website}</a></>
                      ) : null}
                    </p>
                  </div>
                  <div className="sales-header-actions">
                    {phoneEndpoints.length > 0 && (
                      <div className="sales-call-wrap">
                        <button
                          type="button"
                          className="sales-btn sales-call-btn-primary"
                          onClick={() =>
                            phoneEndpoints.length === 1
                              ? initiateCall(phoneEndpoints[0])
                              : setShowCallDropdown((v) => !v)
                          }
                          disabled={calling !== null}
                        >
                          {calling ? 'Verbinde…' : 'Anrufen'}
                        </button>
                        {showCallDropdown && phoneEndpoints.length > 1 && (
                          <div className="sales-call-dropdown">
                            {phoneEndpoints.map((ep) => (
                              <button
                                key={ep.id}
                                type="button"
                                className="sales-call-dropdown-item"
                                onClick={() => initiateCall(ep)}
                              >
                                <span className="sales-badge tone-neutral">{ep.channel}</span>
                                <span>{ep.value}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      className="sales-btn sales-log-call-toggle"
                      onClick={() => setShowLogCall((v) => !v)}
                    >
                      {showLogCall ? 'Abbrechen' : 'Call loggen'}
                    </button>
                  </div>
                </div>

                {/* Call log form */}
                {showLogCall && (
                  <section className="sales-section sales-log-call-form">
                    <h3 className="ovr">Call loggen</h3>
                    <div className="sales-log-call-grid">
                      <select
                        className="sales-input"
                        value={callOutcome}
                        onChange={(e) => {
                          setCallOutcome(e.target.value);
                          if (e.target.value === 'voicemail' || e.target.value === 'no_answer') {
                            if (!callNextStep) setCallNextStep('Nochmal anrufen');
                          } else if (callNextStep === 'Nochmal anrufen') {
                            setCallNextStep('');
                          }
                        }}
                      >
                        <option value="reached">Erreicht</option>
                        <option value="voicemail">Voicemail</option>
                        <option value="no_answer">Kein Anschluss</option>
                        <option value="busy">Besetzt</option>
                        <option value="not_interested">Kein Interesse</option>
                        <option value="appointment">Termin vereinbart</option>
                      </select>
                      <input
                        type="number"
                        className="sales-input sales-input-duration"
                        placeholder="Dauer (Min)"
                        value={callDurationMin}
                        onChange={(e) => setCallDurationMin(e.target.value)}
                        min={1}
                      />
                    </div>
                    <textarea
                      className="sales-input sales-textarea"
                      placeholder="Notizen…"
                      value={callNotes}
                      onChange={(e) => setCallNotes(e.target.value)}
                      rows={3}
                    />
                    <div className="sales-row">
                      <input
                        className="sales-input"
                        placeholder="Nächster Schritt (optional)"
                        value={callNextStep}
                        onChange={(e) => setCallNextStep(e.target.value)}
                      />
                      <button
                        type="button"
                        className="sales-btn"
                        onClick={logCall}
                        disabled={loggingCall}
                      >
                        {loggingCall ? 'Speichert…' : 'Speichern'}
                      </button>
                    </div>
                  </section>
                )}

                {/* KI-Analyse — always prominent at top */}
                <KIPanel insights={selected.insights_json ?? null} />

                {/* Next Step + Contacts — two-column */}
                <div className="sales-detail-cols">
                  <section className="sales-section">
                    <h3 className="ovr">Nächster Schritt</h3>
                    <div className="sales-row">
                      <input
                        value={nextStep}
                        onChange={(e) => setNextStep(e.target.value)}
                        placeholder="z. B. Freitag 10:00 Rückruf"
                        className="sales-input"
                      />
                      <button type="button" onClick={saveNextStep} disabled={saving} className="sales-btn">
                        {saving ? '…' : 'OK'}
                      </button>
                    </div>
                  </section>

                  <section className="sales-section">
                    <div className="sales-section-head">
                      <h3 className="ovr">Kontakte</h3>
                      <button
                        type="button"
                        onClick={() => setShowContactForm((v) => !v)}
                        className="sales-btn sales-btn-sm"
                      >
                        + Kontakt
                      </button>
                    </div>
                    {showContactForm && (
                      <ContactForm
                        companyId={selected.id}
                        onDone={() => {
                          setShowContactForm(false);
                          router.refresh();
                        }}
                      />
                    )}
                    {selected.contacts.map((ct) => (
                      <div key={ct.id} className="sales-contact">
                        <span>{ct.first_name} {ct.last_name}</span>
                        {ct.role ? <span className="role"> · {ct.role}</span> : null}
                        {ct.email ? <span className="role"> · {ct.email}</span> : null}
                        {!ct.recording_consent && (
                          <span className="sales-badge tone-warn">kein Consent</span>
                        )}
                      </div>
                    ))}
                    {selected.contacts.length === 0 && <p className="sales-muted">—</p>}
                  </section>
                </div>

                {/* Endpoints (compact — call button moved to header) */}
                {selected.endpoints.length > 0 && (
                  <section className="sales-section">
                    <h3 className="ovr">Endpoints</h3>
                    {selected.endpoints.map((ep) => (
                      <div key={ep.id} className="sales-endpoint-row">
                        <span className="sales-badge tone-neutral">{ep.channel}</span>
                        <span>{ep.value}</span>
                        <span className="meta">{ep.endpoint_type} · {ep.validity_status}</span>
                        {ep.do_not_call && <span className="sales-badge tone-danger">DNC</span>}
                      </div>
                    ))}
                  </section>
                )}

                {/* Tabs */}
                <div className="sales-tabs">
                  <button
                    type="button"
                    className={`sales-tab${activeTab === 'gespräche' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('gespräche')}
                  >
                    Gespräche{transcripts.length > 0 ? ` (${transcripts.length})` : ''}
                  </button>
                  <button
                    type="button"
                    className={`sales-tab${activeTab === 'aktivitäten' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('aktivitäten')}
                  >
                    Aktivitäten{otherActivities.length > 0 ? ` (${otherActivities.length})` : ''}
                  </button>
                </div>

                {/* Tab: Gespräche */}
                {activeTab === 'gespräche' && (
                  transcripts.length === 0 ? (
                    <p className="sales-muted">Noch keine Gespräche. Notion-Checkbox setzen um Transkript zu importieren.</p>
                  ) : (
                    <ol className="sales-timeline">
                      {transcripts.map((a) => {
                        const kt = (a.meta as Record<string, string>)?.key_takeaways;
                        const preview = a.summary ?? kt ?? '';
                        return (
                          <li
                            key={a.id}
                            className="sales-transcript-card"
                            onClick={() => setModalActivity(a)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => e.key === 'Enter' && setModalActivity(a)}
                          >
                            <div className="sales-tx-header">
                              <span className="meta">{a.occurred_at.slice(0, 10)}</span>
                              <span className="title">{a.title}</span>
                              <span className="sales-tx-toggle">→</span>
                            </div>
                            {preview && (
                              <p className="summary sales-tx-preview">{preview.slice(0, 220)}{preview.length > 220 ? '…' : ''}</p>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  )
                )}

                {/* Tab: Aktivitäten */}
                {activeTab === 'aktivitäten' && (
                  <ol className="sales-timeline">
                    {otherActivities.map((a) => (
                      <li key={a.id}>
                        <div className="meta">
                          {a.occurred_at.slice(0, 10)} · {ACTIVITY_LABEL[a.activity_type] ?? a.activity_type}
                        </div>
                        <div className="title">{a.title}</div>
                        {a.summary && <p className="summary">{a.summary}</p>}
                      </li>
                    ))}
                    {otherActivities.length === 0 && <p className="sales-muted">—</p>}
                  </ol>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      {/* Cold Call Session Modal */}
      {showColdCall && (
        <ColdCallSession
          queue={coldCallQueue}
          memberId={memberId}
          onClose={() => setShowColdCall(false)}
        />
      )}

      {/* Transcript popup modal */}
      {modalActivity && (
        <TranscriptModal
          activity={modalActivity}
          onClose={() => setModalActivity(null)}
        />
      )}
    </section>
  );
}
