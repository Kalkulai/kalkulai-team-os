'use client';

import { useState } from 'react';

export function ContactForm({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', role: '', email: '', phone: '', phone_type: 'mobile' as 'phone' | 'mobile' });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await fetch(`/api/sales/companies/${companyId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: form.first_name, last_name: form.last_name, role: form.role, email: form.email }),
    });
    if (res.ok && form.phone.trim()) {
      const contact = await res.json() as { id: string };
      await fetch(`/api/sales/companies/${companyId}/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: form.phone_type, value: form.phone.trim(), contact_id: contact.id }),
      });
    }
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
      <div className="sales-contact-form-grid">
        <input
          className="sales-input"
          placeholder="Telefon"
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <select
          className="sales-input"
          value={form.phone_type}
          onChange={(e) => setForm({ ...form, phone_type: e.target.value as 'phone' | 'mobile' })}
        >
          <option value="mobile">Mobil</option>
          <option value="phone">Festnetz</option>
        </select>
      </div>
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
