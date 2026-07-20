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
  active: 'Pilot',
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

  return (
    <section className="sales-shell">
      <header>
        <p className="ovr">Sales OS</p>
        <h1>Leads</h1>
      </header>

      <div className="sales-grid">

        {/* ── Lead List ─────────────────────────────────────────────────────── */}
        <div className="sales-list">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen…"
            className="sales-search"
          />
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
              </span>
              {c.pilot_status && (
                <span className={`sales-pilot-badge ${PILOT_CLASS[c.pilot_status]}`}>
                  {PILOT_LABEL[c.pilot_status]}
                </span>
              )}
              {c.insights_json?.buying_signal && c.insights_json.buying_signal !== 'unknown' && (
                <span className={`sales-signal-badge signal-${c.insights_json.buying_signal}`}>
                  {SIGNAL_LABEL[c.insights_json.buying_signal]}
                </span>
              )}
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
