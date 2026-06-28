import ExcelJS from 'exceljs';
import { downloadDriveFile } from '@/lib/google-drive';
import { parseEur } from '@/lib/finance-sync';
import type { PlanningCategory, PlanningData, PlanningItem } from '@/types/exist-planning';

type PlanningSource = {
  category: PlanningCategory;
  fileId: string;
  label: string;
};

type MonthColumn = {
  index: number;
  month: string;
};

type MonthAmount = {
  month: string;
  amount: number;
};

const FUNDING_START = '2026-08';
const FUNDING_END = '2027-07';
const MONTHS_TAB_NAME = 'Monatsplanung';

const PLANNING_SOURCES: readonly PlanningSource[] = [
  {
    category: 'sachmittel',
    fileId: '1XxZXNy4ZVFbGDoAkcUbwwJ2Olv_thIZm',
    label: 'Sachmittelplanung_v12.xlsx',
  },
  {
    category: 'coaching',
    fileId: '1nPXiZ9JYYjGwez-L5-OUZz3q7mNuXj4u',
    label: 'Coachingplanung_v12.xlsx',
  },
];

const SACHMITTEL_SECTIONS: Record<string, string> = {
  '1': 'KI- & Cloud-Infrastruktur',
  '2': 'Entwicklungs- & Vertriebstools',
  '3': 'Marketing & Vertrieb',
  '4': 'Hardware',
  '5': 'Schutzrechte',
};

const GERMAN_MONTHS: Record<string, string> = {
  jan: '01',
  januar: '01',
  feb: '02',
  februar: '02',
  mar: '03',
  maer: '03',
  maerz: '03',
  mär: '03',
  märz: '03',
  apr: '04',
  april: '04',
  mai: '05',
  jun: '06',
  juni: '06',
  jul: '07',
  juli: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  okt: '10',
  oktober: '10',
  nov: '11',
  november: '11',
  dez: '12',
  dezember: '12',
};

function cellText(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    if ('result' in value) {
      return cellText(value.result);
    }
    if ('text' in value && typeof value.text === 'string') {
      return value.text.trim();
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part: unknown) =>
          typeof part === 'object' && part !== null && 'text' in part ? cellText(part.text) : '',
        )
        .join('')
        .trim();
    }
  }
  return String(value).trim();
}

function normalize(value: unknown): string {
  return cellText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return year * 12 + monthNumber;
}

function isInFundingWindow(month: string): boolean {
  return monthIndex(month) >= monthIndex(FUNDING_START) && monthIndex(month) <= monthIndex(FUNDING_END);
}

function parseExcelSerialMonth(value: number): string | null {
  const date = new Date(Date.UTC(1899, 11, 30) + value * 24 * 60 * 60 * 1000);
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return isInFundingWindow(month) ? month : null;
}

function parseMonthHeader(value: unknown): string | null {
  if (value instanceof Date) {
    const month = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
    return isInFundingWindow(month) ? month : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return parseExcelSerialMonth(value);
  }

  const raw = cellText(value);
  if (!raw) {
    return null;
  }

  const iso = raw.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])\b/);
  if (iso) {
    const month = `${iso[1]}-${iso[2].padStart(2, '0')}`;
    return isInFundingWindow(month) ? month : null;
  }

  const european = raw.match(/\b(0?[1-9]|1[0-2])[-/.](20\d{2})\b/);
  if (european) {
    const month = `${european[2]}-${european[1].padStart(2, '0')}`;
    return isInFundingWindow(month) ? month : null;
  }

  const cleaned = normalize(raw).replace(/\bmaerz\b/g, 'maer');
  const namedMonth = cleaned.match(
    /\b(jan|januar|feb|februar|mar|maer|maerz|apr|april|mai|jun|juni|jul|juli|aug|august|sep|sept|september|okt|oktober|nov|november|dez|dezember)\b.*\b(20\d{2}|\d{2})\b/,
  );
  if (!namedMonth) {
    return null;
  }

  const year = namedMonth[2].length === 2 ? `20${namedMonth[2]}` : namedMonth[2];
  const monthNumber = GERMAN_MONTHS[namedMonth[1]];
  const month = `${year}-${monthNumber}`;
  return isInFundingWindow(month) ? month : null;
}

function monthColumns(row: unknown[]): MonthColumn[] {
  return row
    .map((cell, index) => {
      const month = parseMonthHeader(cell);
      return month ? { index, month } : null;
    })
    .filter((column): column is MonthColumn => column !== null);
}

function findHeaderRow(rows: unknown[][]): { index: number; months: MonthColumn[] } {
  for (const [index, row] of rows.entries()) {
    const months = monthColumns(row);
    if (months.length >= 3) {
      return { index, months };
    }
  }
  throw new Error(`Planning-XLSX enthält keine Monats-Header für ${FUNDING_START} bis ${FUNDING_END}`);
}

function findHeaderColumn(header: unknown[], names: readonly string[]): number | null {
  const normalizedNames = new Set(names.map(normalize));
  const index = header.findIndex((cell) => normalizedNames.has(normalize(cell)));
  return index === -1 ? null : index;
}

function isSubtotalRow(row: unknown[]): boolean {
  const text = row.map(cellText).join(' ');
  return /∑|summe|gesamt|subtotal/i.test(text);
}

function findPositionCode(row: unknown[]): string | null {
  for (const cell of row) {
    const match = cellText(cell).match(/^\s*(\d+\.\d+)\s*$/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function sectionHeading(row: unknown[]): string | null {
  if (isSubtotalRow(row)) {
    return null;
  }

  const firstText = cellText(row.find((cell) => cellText(cell) !== ''));
  if (!firstText || /^\d+\.\d+$/.test(firstText)) {
    return null;
  }

  const sectionNumberOnly = firstText.match(/^\d+\.?$/);
  if (sectionNumberOnly) {
    const rest = row.slice(1).map(cellText).find(Boolean);
    return rest ?? null;
  }

  const prefixed = firstText.match(/^\d+\.?\s+(.+)$/);
  if (prefixed) {
    return prefixed[1].trim();
  }

  return firstText;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0 ? value : null;
  }
  const raw = cellText(value);
  if (!raw) {
    return null;
  }
  const amount = parseEur(raw);
  return amount === 0 ? null : amount;
}

function splitContiguous(entries: MonthAmount[]): MonthAmount[][] {
  const groups: MonthAmount[][] = [];
  let current: MonthAmount[] = [];
  let previousIndex = -1;

  for (const entry of entries) {
    const entryIndex = monthIndex(entry.month);
    if (current.length === 0 || entryIndex === previousIndex + 1) {
      current.push(entry);
    } else {
      groups.push(current);
      current = [entry];
    }
    previousIndex = entryIndex;
  }

  if (current.length > 0) {
    groups.push(current);
  }
  return groups;
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'item';
}

function compactParts(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const compacted: string[] = [];
  for (const part of parts) {
    const text = part?.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    compacted.push(text);
  }
  return compacted.join(' · ');
}

function sectionForPosition(
  category: PlanningCategory,
  positionCode: string,
  currentSection: string | null,
): string | undefined {
  const sectionNumber = positionCode.split('.')[0];
  if (category === 'sachmittel') {
    return SACHMITTEL_SECTIONS[sectionNumber] ?? currentSection ?? undefined;
  }
  return currentSection ?? `Abschnitt ${sectionNumber}`;
}

function parseRows(category: PlanningCategory, rows: unknown[][]): PlanningItem[] {
  const { index: headerIndex, months } = findHeaderRow(rows);
  const header = rows[headerIndex];
  const providerColumn = findHeaderColumn(header, ['Anbieter', 'Dienstleister', 'Partner']);
  const descriptionColumn = findHeaderColumn(header, [
    'Beschreibung',
    'Bezeichnung',
    'Position',
    'Leistung',
    'Massnahme',
    'Maßnahme',
  ]);
  const baseIdCounts = new Map<string, number>();
  const items: PlanningItem[] = [];
  let currentSection: string | null = null;

  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => cellText(cell) === '') || isSubtotalRow(row)) {
      continue;
    }

    const positionCode = findPositionCode(row);
    if (!positionCode) {
      currentSection = sectionHeading(row) ?? currentSection;
      continue;
    }

    const description =
      descriptionColumn === null ? undefined : cellText(row[descriptionColumn]) || undefined;
    const provider = providerColumn === null ? undefined : cellText(row[providerColumn]) || undefined;
    const nameBase = description ?? provider ?? positionCode;
    const name = `${positionCode} ${nameBase}`;
    const section = sectionForPosition(category, positionCode, currentSection);

    const amounts = months
      .map((column) => {
        const amount = parseAmount(row[column.index]);
        return amount === null ? null : { month: column.month, amount };
      })
      .filter((entry): entry is MonthAmount => entry !== null);

    if (amounts.length === 0) {
      continue;
    }

    const baseId = `${category}-${slugify(positionCode)}-${slugify(nameBase)}`;
    const descriptionText = compactParts([section, provider, description]);

    for (const group of splitContiguous(amounts)) {
      const count = (baseIdCounts.get(baseId) ?? 0) + 1;
      baseIdCounts.set(baseId, count);
      const total = group.reduce((sum, entry) => sum + entry.amount, 0);
      const item: PlanningItem = {
        id: count === 1 ? baseId : `${baseId}-${count}`,
        name,
        category,
        start: group[0].month,
        end: group[group.length - 1].month,
        amount_eur_total: Math.round(total * 100) / 100,
      };
      if (descriptionText) {
        item.description = descriptionText;
      }
      items.push(item);
    }
  }

  return items;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

async function rowsFromWorkbook(buffer: Buffer, sourceLabel: string): Promise<unknown[][]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    toArrayBuffer(buffer) as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheet = workbook.getWorksheet(MONTHS_TAB_NAME);
  if (!sheet) {
    throw new Error(`${sourceLabel}: Tab "${MONTHS_TAB_NAME}" fehlt`);
  }

  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      values.push(row.getCell(column).value);
    }
    rows.push(values);
  });
  return rows;
}

async function loadSource(source: PlanningSource): Promise<PlanningItem[]> {
  const buffer = await downloadDriveFile(source.fileId);
  const rows = await rowsFromWorkbook(buffer, source.label);
  return parseRows(source.category, rows);
}

export async function loadPlanningData(): Promise<PlanningData> {
  const [sachmittelItems, coachingItems] = await Promise.all(PLANNING_SOURCES.map(loadSource));

  return {
    items: [...sachmittelItems, ...coachingItems],
    funding_start: FUNDING_START,
    funding_end: FUNDING_END,
  };
}
