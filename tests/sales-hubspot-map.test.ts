import { describe, it, expect } from 'vitest';
import {
  mapHubspotCompany, mapHubspotContact, extractEndpoints, mapHubspotEngagement,
} from '@/lib/sales-hubspot-map';

const HS_COMPANY = {
  id: '12345',
  properties: {
    name: 'Müller GmbH', domain: 'mueller.example',
    industry: 'DENTAL', lifecyclestage: 'salesqualifiedlead', phone: '+49 30 123',
  },
};
const HS_CONTACT = {
  id: '987',
  properties: {
    firstname: 'Thomas', lastname: 'Müller', jobtitle: 'GF',
    email: 't@mueller.example', phone: null, mobilephone: '+49 171 555',
  },
};
const HS_NOTE = {
  id: '555',
  properties: {
    hs_note_body: '<p>GF erreicht, will Case Study</p>',
    hs_timestamp: '2026-06-20T10:00:00Z',
  },
};

describe('sales hubspot mapping', () => {
  it('maps a company to a sales_companies row', () => {
    const row = mapHubspotCompany(HS_COMPANY, 'paul-uuid');
    expect(row).toMatchObject({
      hubspot_company_id: '12345',
      owner_member_id: 'paul-uuid',
      name: 'Müller GmbH',
      website: 'https://mueller.example',
      status: 'salesqualifiedlead',
    });
  });

  it('maps a contact row with recording_consent true (Entscheidung 5)', () => {
    const row = mapHubspotContact(HS_CONTACT);
    expect(row).toMatchObject({
      hubspot_contact_id: '987', first_name: 'Thomas', last_name: 'Müller',
      role: 'GF', email: 't@mueller.example', recording_consent: true,
    });
  });

  it('extracts endpoints from company phone, contact phones and contact email', () => {
    const eps = extractEndpoints(HS_COMPANY, [HS_CONTACT]);
    expect(eps).toEqual([
      { channel: 'phone', value: '+49 30 123', endpoint_type: 'switchboard', contactHubspotId: null },
      { channel: 'mobile', value: '+49 171 555', endpoint_type: 'mobile', contactHubspotId: '987' },
      { channel: 'email', value: 't@mueller.example', endpoint_type: 'direct', contactHubspotId: '987' },
    ]);
  });

  it('maps a note engagement to a sales_activities row', () => {
    const row = mapHubspotEngagement('notes', HS_NOTE);
    expect(row).toMatchObject({
      activity_type: 'note',
      source_system: 'hubspot',
      provider_event_id: 'hubspot-notes-555',
      occurred_at: '2026-06-20T10:00:00Z',
    });
    expect(row.summary).toContain('GF erreicht');
    expect(row.summary).not.toContain('<p>');
  });
});
