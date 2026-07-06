'use client';

import { useState } from 'react';

export function ContactForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', role: '', email: '' });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    await fetch(`/api/sales/companies/${companyId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onDone();
  }

  return (
    <div className="sales-contact-form">
      <div className="sales-contact-form-grid">
        <input
          className="sales-input"
          placeholder="Vorname"
          value={form.first_name}
          onChange={(e) => setForm({ ...form, first_name: e.target.value })}
        />
        <input
          className="sales-input"
          placeholder="Nachname"
          value={form.last_name}
          onChange={(e) => setForm({ ...form, last_name: e.target.value })}
        />
      </div>
      <input
        className="sales-input"
        placeholder="Rolle (z. B. Geschäftsführer)"
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value })}
      />
      <input
        className="sales-input"
        placeholder="E-Mail"
        type="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <button
        type="button"
        onClick={submit}
        disabled={saving || (!form.first_name && !form.last_name)}
        className="sales-btn"
      >
        {saving ? 'Speichert…' : 'Kontakt anlegen'}
      </button>
    </div>
  );
}
