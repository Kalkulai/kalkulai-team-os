import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

const downloadDriveFileMock = vi.fn();

vi.mock('@/lib/google-drive', () => ({
  downloadDriveFile: (...args: unknown[]) => downloadDriveFileMock(...args),
}));

import { loadPlanningData } from '@/lib/exist-planning-data';

async function workbookBuffer(rows: unknown[][], sheetName = 'Monatsplanung'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRows(rows);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

beforeEach(() => {
  downloadDriveFileMock.mockReset();
});

describe('loadPlanningData', () => {
  it('lädt die Drive-XLSX-Dateien und normalisiert echte Positionszeilen zu PlanningItems', async () => {
    const sachmittelWorkbook = await workbookBuffer([
      ['Sachmittelplanung v12'],
      ['Nr.', 'Anbieter', 'Beschreibung', 'Aug 2026', 'Sep 2026', 'Okt 2026', 'Nov 2026'],
      ['1', 'KI- & Cloud-Infrastruktur', '', '', '', '', ''],
      ['1.1', 'Hetzner', 'GPU-Server', '1.000,00 €', '1.000,00 €', '', ''],
      ['1.2', 'OpenAI', 'API-Credits', '500', '', '750', '750'],
      ['∑', '', 'Zwischensumme', '1.500', '1.000', '750', '750'],
      ['4', 'Hardware', '', '', '', '', ''],
      ['4.1', 'Apple', 'MacBook Pro', '8.000,00 €', '', '', ''],
    ]);
    const coachingWorkbook = await workbookBuffer([
      ['Coachingplanung v12'],
      ['Nr.', 'Anbieter', 'Beschreibung', 'Aug 2026', 'Sep 2026', 'Okt 2026', 'Nov 2026'],
      ['1', 'Go-to-Market Coaching', '', '', '', '', ''],
      ['1.1', 'Coach GmbH', 'Positionierung', '', '', '2.500,00 €', '2.500,00 €'],
      ['∑', '', 'Summe', '', '', '2.500', '2.500'],
    ]);

    downloadDriveFileMock.mockImplementation((fileId: string) => {
      if (fileId === '1XxZXNy4ZVFbGDoAkcUbwwJ2Olv_thIZm') {
        return Promise.resolve(sachmittelWorkbook);
      }
      if (fileId === '1nPXiZ9JYYjGwez-L5-OUZz3q7mNuXj4u') {
        return Promise.resolve(coachingWorkbook);
      }
      return Promise.reject(new Error(`unexpected file ${fileId}`));
    });

    const data = await loadPlanningData();

    expect(downloadDriveFileMock).toHaveBeenCalledWith('1XxZXNy4ZVFbGDoAkcUbwwJ2Olv_thIZm');
    expect(downloadDriveFileMock).toHaveBeenCalledWith('1nPXiZ9JYYjGwez-L5-OUZz3q7mNuXj4u');
    expect(data).toEqual({
      funding_start: '2026-08',
      funding_end: '2027-07',
      items: [
        {
          id: 'sachmittel-1-1-gpu-server',
          name: '1.1 GPU-Server',
          category: 'sachmittel',
          start: '2026-08',
          end: '2026-09',
          amount_eur_total: 2000,
          description: 'KI- & Cloud-Infrastruktur · Hetzner · GPU-Server',
        },
        {
          id: 'sachmittel-1-2-api-credits',
          name: '1.2 API-Credits',
          category: 'sachmittel',
          start: '2026-08',
          end: '2026-08',
          amount_eur_total: 500,
          description: 'KI- & Cloud-Infrastruktur · OpenAI · API-Credits',
        },
        {
          id: 'sachmittel-1-2-api-credits-2',
          name: '1.2 API-Credits',
          category: 'sachmittel',
          start: '2026-10',
          end: '2026-11',
          amount_eur_total: 1500,
          description: 'KI- & Cloud-Infrastruktur · OpenAI · API-Credits',
        },
        {
          id: 'sachmittel-4-1-macbook-pro',
          name: '4.1 MacBook Pro',
          category: 'sachmittel',
          start: '2026-08',
          end: '2026-08',
          amount_eur_total: 8000,
          description: 'Hardware · Apple · MacBook Pro',
        },
        {
          id: 'coaching-1-1-positionierung',
          name: '1.1 Positionierung',
          category: 'coaching',
          start: '2026-10',
          end: '2026-11',
          amount_eur_total: 5000,
          description: 'Go-to-Market Coaching · Coach GmbH · Positionierung',
        },
      ],
    });
  });

  it('wirft klar, wenn der Tab Monatsplanung fehlt', async () => {
    downloadDriveFileMock.mockResolvedValue(await workbookBuffer([['Nr.', 'Anbieter']], 'Tabelle1'));

    await expect(loadPlanningData()).rejects.toThrow(/Tab "Monatsplanung"/);
  });
});
