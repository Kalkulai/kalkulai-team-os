'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SalesCompany, SalesCompanyDetail } from '@/types/sales';
import { ContactForm } from '@/components/sales/ContactForm';

export function SalesDashboard({
  memberId,
  companies,
  selected,
}: {
  memberId: string;
  companies: SalesCompany[];
  selected: SalesCompanyDetail | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [nextStep, setNextStep] = useState(selected?.next_step ?? '');
  const [showContactForm, setShowContactForm] = useState(false);
  const [saving, setSaving] = useState(false);

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

  return (
    <section className="sales-shell">
      <header>
        <p className="ovr">Sales OS</p>
        <h1>Leads</h1>
      </header>

      <div className="sales-grid">
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
              className={`sales-lead-card${selected?.id === c.id ? ' is-active' : ''}`}
            >
              <strong>{c.name}</strong>
              <span>
                {c.status}
                {c.industry ? ` · ${c.industry}` : ''}
              </span>
            </Link>
          ))}
        </div>

        <div>
          {!selected ? (
            <p className="sales-muted">Lead auswählen.</p>
          ) : (
            <div className="sales-detail">
              <div className="sales-detail-header">
                <h2>{selected.name}</h2>
                <p>
                  {selected.status}
                  {selected.website ? (
                    <>
                      {' · '}
                      <a href={selected.website} target="_blank" rel="noreferrer">
                        {selected.website}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>

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
                    {saving ? 'Speichert…' : 'Speichern'}
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
                    <span>
                      {ct.first_name} {ct.last_name}
                    </span>
                    {ct.role ? <span className="role"> · {ct.role}</span> : null}
                    {ct.email ? <span className="role"> · {ct.email}</span> : null}
                    {!ct.recording_consent && (
                      <span className="sales-badge tone-warn">kein Recording-Consent</span>
                    )}
                  </div>
                ))}
                {selected.contacts.length === 0 && <p className="sales-muted">—</p>}
              </section>

              <section className="sales-section">
                <h3 className="ovr">Endpoints</h3>
                {selected.endpoints.map((ep) => (
                  <div key={ep.id} className="sales-endpoint-row">
                    <span className="sales-badge tone-neutral">{ep.channel}</span>
                    <span>{ep.value}</span>
                    <span className="meta">
                      {ep.endpoint_type} · {ep.validity_status}
                    </span>
                    {ep.do_not_call && <span className="sales-badge tone-danger">do not call</span>}
                  </div>
                ))}
                {selected.endpoints.length === 0 && <p className="sales-muted">—</p>}
              </section>

              <section className="sales-section">
                <h3 className="ovr">Timeline</h3>
                <ol className="sales-timeline">
                  {selected.activities.map((a) => (
                    <li key={a.id}>
                      <div className="meta">
                        {a.occurred_at.slice(0, 10)} · {a.activity_type}
                      </div>
                      <div className="title">{a.title}</div>
                      {a.summary && <p className="summary">{a.summary}</p>}
                    </li>
                  ))}
                  {selected.activities.length === 0 && <p className="sales-muted">—</p>}
                </ol>
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
