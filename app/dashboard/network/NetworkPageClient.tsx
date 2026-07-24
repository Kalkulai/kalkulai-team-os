'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Mail, Phone } from 'lucide-react';
import type { ConnectionStrength, Contact } from '@/types/contact';

const FILTER_TAGS = [
  'investor',
  'innung',
  'meister',
  'stakeholder',
  'unternehmer',
  'freund',
  'multiplikator',
] as const;

type FilterTag = (typeof FILTER_TAGS)[number] | 'alle';
type SortMode = 'name' | 'last_contact' | 'next_action';

/** Segment badge colors mapped to theme tokens (light + dark aware). */
const SEGMENT_TAG_COLORS: Record<string, string> = {
  investor: 'var(--brand)',
  innung: 'var(--brand-2)',
  meister: 'var(--brand-3)',
  stakeholder: 'var(--brand)',
  unternehmer: 'var(--brand-3)',
  freund: 'var(--ok)',
  multiplikator: 'var(--brand-2)',
  contact: 'var(--ink-3)',
};

const CONNECTION_DOT_COLORS: Record<ConnectionStrength, string> = {
  warm: 'var(--ok)',
  cold: 'var(--ink-3)',
  unknown: 'var(--warn)',
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function connectionDotColor(strength: string): string {
  if (strength === 'warm' || strength === 'cold' || strength === 'unknown') {
    return CONNECTION_DOT_COLORS[strength];
  }
  return CONNECTION_DOT_COLORS.unknown;
}

function segmentTags(tags: string[]): string[] {
  return tags.filter((t) => t !== 'contact');
}

function sortContacts(contacts: Contact[], mode: SortMode): Contact[] {
  const sorted = [...contacts];
  switch (mode) {
    case 'last_contact':
      sorted.sort((a, b) => {
        const av = a.last_contact_date ?? '';
        const bv = b.last_contact_date ?? '';
        if (!av && !bv) return a.name.localeCompare(b.name, 'de');
        if (!av) return 1;
        if (!bv) return -1;
        return bv.localeCompare(av);
      });
      break;
    case 'next_action':
      sorted.sort((a, b) => {
        const av = a.next_action_date ?? '';
        const bv = b.next_action_date ?? '';
        if (!av && !bv) return a.name.localeCompare(b.name, 'de');
        if (!av) return 1;
        if (!bv) return -1;
        return av.localeCompare(bv);
      });
      break;
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }
  return sorted;
}

export default function NetworkPageClient() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTag>('alle');
  const [sort, setSort] = useState<SortMode>('name');

  useEffect(() => {
    let cancelled = false;
    let lastFetchAt = 0;
    const MIN_GAP_MS = 30_000;

    async function fetchOnce() {
      const now = Date.now();
      if (now - lastFetchAt < MIN_GAP_MS) return;
      lastFetchAt = now;
      try {
        const res = await fetch('/api/contacts', { cache: 'no-store' });
        const payload = res.ok ? ((await res.json()) as Contact[]) : [];
        if (!cancelled) setContacts(payload);
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

  const filtered = useMemo(() => {
    const base =
      filter === 'alle'
        ? contacts
        : contacts.filter((c) => c.tags.some((t) => t.toLowerCase() === filter));
    return sortContacts(base, sort);
  }, [contacts, filter, sort]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-[var(--ink-1)]">
          Netzwerk
        </h1>
        <span className="rounded-full border border-[var(--line-1)] bg-[var(--glass)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--ink-2)]">
          {filtered.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilter('alle')}
          className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
            filter === 'alle'
              ? 'bg-[var(--brand)] text-white'
              : 'border border-[var(--line-1)] bg-[var(--glass)] text-[var(--ink-2)] hover:text-[var(--ink-1)]'
          }`}
        >
          Alle
        </button>
        {FILTER_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setFilter(tag)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition ${
              filter === tag
                ? 'bg-[var(--brand)] text-white'
                : 'border border-[var(--line-1)] bg-[var(--glass)] text-[var(--ink-2)] hover:text-[var(--ink-1)]'
            }`}
          >
            {tag.charAt(0).toUpperCase() + tag.slice(1)}
          </button>
        ))}

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="ml-auto rounded-lg border border-[var(--line-1)] bg-[var(--glass)] px-3 py-1.5 text-[12px] text-[var(--ink-1)]"
          aria-label="Sortierung"
        >
          <option value="name">Name</option>
          <option value="last_contact">Letzter Kontakt</option>
          <option value="next_action">Nächste Aktion</option>
        </select>
      </div>

      {loading && <p className="text-[13px] text-[var(--ink-3)]">Lade …</p>}

      {!loading && filtered.length === 0 && (
        <p className="text-[13px] text-[var(--ink-3)]">Keine Kontakte gefunden.</p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((contact) => (
            <article
              key={contact.id}
              className="flex flex-col gap-3 rounded-[14px] border border-[var(--line-1)] bg-[var(--glass)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[15px] font-bold text-[var(--ink-1)]">
                      {contact.name}
                    </h2>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: connectionDotColor(contact.connection_strength) }}
                      title={contact.connection_strength}
                      aria-label={`Verbindung: ${contact.connection_strength}`}
                    />
                  </div>
                  {contact.relationship_to_kalkulai && (
                    <p className="mt-1 truncate text-[12px] text-[var(--ink-3)]">
                      {contact.relationship_to_kalkulai}
                    </p>
                  )}
                </div>
              </div>

              {segmentTags(contact.tags).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {segmentTags(contact.tags).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                      style={{ backgroundColor: SEGMENT_TAG_COLORS[tag.toLowerCase()] ?? 'var(--ink-3)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-[12px] text-[var(--ink-3)]">
                Letzter Kontakt:{' '}
                <span className="text-[var(--ink-2)]">{formatDate(contact.last_contact_date)}</span>
              </div>

              {contact.next_action && (
                <p className="text-[12px] font-medium text-[var(--brand-2)]">{contact.next_action}</p>
              )}

              <div className="mt-auto flex items-center gap-3 pt-1">
                {contact.linkedin && (
                  <a
                    href={contact.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ink-3)] transition hover:text-[var(--brand)]"
                    aria-label="LinkedIn"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
                {contact.email && (
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-[var(--ink-3)] transition hover:text-[var(--brand)]"
                    aria-label="E-Mail"
                  >
                    <Mail size={15} />
                  </a>
                )}
                {contact.phone && (
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-[var(--ink-3)] transition hover:text-[var(--brand)]"
                    aria-label="Telefon"
                  >
                    <Phone size={15} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
