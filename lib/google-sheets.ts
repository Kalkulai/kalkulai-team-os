// Google-Sheets-Zugriff per Service-Account, gekapselt über Named Ranges.
// - loadSheetMap(): liest + validiert die Sheet-Map-Config (Boundary-Validierung).
// - readNamedRange/writeNamedRange: lesen/schreiben eine benannte Range direkt.
// Keine Mutation, keine geschluckten API-Fehler. Echte Sheet-IDs/Range-Namen
// kommen aus config/finance-sheet-map.json (Platzhalter bis vom User gefüllt).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import {
  JWT,
  OAuth2Client,
  ExternalAccountClient,
  type BaseExternalAccountClient,
} from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

export type FieldKind = 'input' | 'output';

export interface FieldSpec {
  sheet: string;
  namedRange: string;
  kind: FieldKind;
}

export interface SheetMap {
  sheets: Record<string, string>;
  fields: Record<string, FieldSpec>;
}

const SHEET_MAP_PATH = path.join(process.cwd(), 'config', 'finance-sheet-map.json');

const READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/** Schmaler Record-Type-Guard ohne `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFieldKind(value: unknown): value is FieldKind {
  return value === 'input' || value === 'output';
}

/**
 * Liest + validiert config/finance-sheet-map.json (Boundary-Validierung).
 * Wirft bei kaputter Config einen klaren Error. Reine Validierung, keine Mutation.
 */
export function loadSheetMap(): SheetMap {
  let raw: string;
  try {
    raw = readFileSync(SHEET_MAP_PATH, 'utf8');
  } catch (cause) {
    throw new Error(`Sheet-Map konnte nicht gelesen werden: ${SHEET_MAP_PATH}`, { cause });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Sheet-Map ist kein gültiges JSON: ${SHEET_MAP_PATH}`, { cause });
  }

  return validateSheetMap(parsed);
}

/**
 * Validiert eine bereits geparste Sheet-Map-Struktur und gibt eine getypte,
 * neu zusammengesetzte SheetMap zurück (kein In-Place-Mutieren der Eingabe).
 */
export function validateSheetMap(parsed: unknown): SheetMap {
  if (!isRecord(parsed)) {
    throw new Error('Sheet-Map muss ein Objekt sein');
  }

  const { sheets, fields } = parsed;

  if (!isRecord(sheets)) {
    throw new Error('Sheet-Map: "sheets" muss ein Objekt sein');
  }
  const sheetKeys = Object.keys(sheets);
  if (sheetKeys.length === 0) {
    throw new Error('Sheet-Map: "sheets" darf nicht leer sein');
  }
  for (const key of sheetKeys) {
    if (typeof sheets[key] !== 'string' || sheets[key] === '') {
      throw new Error(`Sheet-Map: sheets["${key}"] muss ein nicht-leerer String sein`);
    }
  }

  if (!isRecord(fields)) {
    throw new Error('Sheet-Map: "fields" muss ein Objekt sein');
  }

  // Validierte Kopien aufbauen — keine Referenz auf die Eingabe behalten.
  const validatedSheets: Record<string, string> = {};
  for (const key of sheetKeys) {
    validatedSheets[key] = sheets[key] as string;
  }

  const validatedFields: Record<string, FieldSpec> = {};
  for (const fieldName of Object.keys(fields)) {
    const spec = fields[fieldName];
    if (!isRecord(spec)) {
      throw new Error(`Sheet-Map: fields["${fieldName}"] muss ein Objekt sein`);
    }
    if (typeof spec.sheet !== 'string' || spec.sheet === '') {
      throw new Error(`Sheet-Map: fields["${fieldName}"].sheet fehlt oder ist leer`);
    }
    if (typeof spec.namedRange !== 'string' || spec.namedRange === '') {
      throw new Error(`Sheet-Map: fields["${fieldName}"].namedRange fehlt oder ist leer`);
    }
    if (!isFieldKind(spec.kind)) {
      throw new Error(
        `Sheet-Map: fields["${fieldName}"].kind muss "input" oder "output" sein (Ist: ${String(spec.kind)})`,
      );
    }
    if (!(spec.sheet in validatedSheets)) {
      throw new Error(
        `Sheet-Map: fields["${fieldName}"].sheet="${spec.sheet}" existiert nicht in "sheets"`,
      );
    }
    validatedFields[fieldName] = {
      sheet: spec.sheet,
      namedRange: spec.namedRange,
      kind: spec.kind,
    };
  }

  return { sheets: validatedSheets, fields: validatedFields };
}

const STS_TOKEN_URL = 'https://sts.googleapis.com/v1/token';
// Vercel-OIDC liefert ein signiertes JWT — der von GCP-WIF-OIDC-Providern erwartete Subject-Token-Typ.
const WIF_SUBJECT_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:jwt';

/**
 * Baut einen Google-Auth-Client für den gewünschten Scope. Drei Modi, in dieser
 * Reihenfolge geprüft (erster konfigurierter gewinnt):
 *
 *  1. OAuth2-Refresh-Token (einfachster Weg) — greift als Google-User zu, dessen
 *     Refresh-Token in GOOGLE_FINANCE_REFRESH_TOKEN steht (Scope: spreadsheets).
 *     Reuse des bestehenden Google-OAuth-Clients (GOOGLE_CLIENT_ID/SECRET). Kein
 *     Service-Account, kein Sheet-Sharing mit Roboter (User hat eh Zugriff).
 *  2. Keyless via Workload Identity Federation — Vercel-OIDC-Token wird via STS
 *     gegen einen impersonierten `finance-bot`-Token getauscht. Kein Key.
 *  3. Service-Account-JSON-Key (lokal/Fallback) — falls GOOGLE_SERVICE_ACCOUNT_JSON gesetzt.
 *
 * Wirft einen klaren Error, wenn keiner der Wege konfiguriert ist.
 *
 * Hinweis: Bei OAuth2 bestimmen die beim Consent gewährten Scopes den Zugriff —
 * der `scope`-Parameter steuert nur JWT/WIF (Service-Account-Impersonation).
 */
function buildAuth(scope: string): JWT | OAuth2Client | BaseExternalAccountClient {
  // 1) OAuth2-Refresh-Token — bevorzugt, weil am einfachsten einzurichten.
  const oauthClientId = process.env.GOOGLE_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_FINANCE_REFRESH_TOKEN;
  if (oauthClientId && oauthClientSecret && refreshToken) {
    const client = new OAuth2Client({
      clientId: oauthClientId,
      clientSecret: oauthClientSecret,
    });
    // Access-Token wird vom Client bei Bedarf automatisch via Refresh-Token erneuert.
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  // 2) Keyless WIF — sobald die WIF-Env-Vars stehen. Env-Namen +
  //    Audience-Aufbau folgen exakt dem offiziellen Vercel-GCP-OIDC-Muster.
  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID;
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID;
  const saEmail = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  if (projectNumber && poolId && providerId && saEmail) {
    const client = ExternalAccountClient.fromJSON({
      type: 'external_account',
      audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
      subject_token_type: WIF_SUBJECT_TOKEN_TYPE,
      token_url: STS_TOKEN_URL,
      service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:generateAccessToken`,
      // Vercel-Helper: liefert das kurzlebige OIDC-Token (Env in Prod, API in Dev).
      // Wrappen, weil der Supplier einen context-Param erwartet, getVercelOidcToken aber options.
      subject_token_supplier: { getSubjectToken: (): Promise<string> => getVercelOidcToken() },
    });
    if (!client) {
      throw new Error('WIF-Konfiguration ungültig: ExternalAccountClient konnte nicht erstellt werden');
    }
    client.scopes = [scope];
    return client;
  }

  // 3) Service-Account-JSON-Key (lokal/Fallback).
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (rawJson) {
    let credentials: unknown;
    try {
      credentials = JSON.parse(rawJson);
    } catch (cause) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ist kein gültiges JSON', { cause });
    }

    if (!isRecord(credentials)) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON muss ein JSON-Objekt sein');
    }
    const { client_email, private_key } = credentials;
    if (typeof client_email !== 'string' || typeof private_key !== 'string') {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON braucht "client_email" und "private_key" als Strings',
      );
    }

    return new google.auth.JWT({
      email: client_email,
      key: private_key,
      scopes: [scope],
    });
  }

  throw new Error(
    'Keine Google-Credentials konfiguriert: setze einen der drei Wege — ' +
      'GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_FINANCE_REFRESH_TOKEN (OAuth, einfachster), ' +
      'die WIF-Vars (GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID, ' +
      'GCP_SERVICE_ACCOUNT_EMAIL — keyless), oder GOOGLE_SERVICE_ACCOUNT_JSON (Key, lokal).',
  );
}

/**
 * Liest eine benannte Range aus einem Sheet. Gibt die Werte als string[][] zurück
 * (leeres Array, wenn die Range leer ist). Sheets-API-Fehler werden propagiert.
 */
export async function readNamedRange(
  sheetId: string,
  namedRange: string,
): Promise<string[][]> {
  const auth = buildAuth(READONLY_SCOPE);
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: namedRange,
  });

  const values = res.data.values;
  if (!values) {
    return [];
  }
  // Zellen defensiv zu Strings normalisieren — keine `any`-Durchreichung.
  return values.map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

/**
 * Schreibt Werte in eine benannte Range (valueInputOption RAW).
 * Adressiert ausschließlich die übergebene Range. Fehler werden propagiert.
 */
export async function writeNamedRange(
  sheetId: string,
  namedRange: string,
  value: (string | number)[][],
): Promise<void> {
  const auth = buildAuth(WRITE_SCOPE);
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: namedRange,
    valueInputOption: 'RAW',
    requestBody: { values: value },
  });
}
