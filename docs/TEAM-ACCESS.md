# Team-Access — Onboarding für Felix & Paul

**Was ist das hier:** Das interne KalkulAI-Dashboard ist ab sofort hinter einem geteilten Team-Passwort. Diese Doku erklärt, wie Felix & Paul (und alle künftigen Team-Member) reinkommen, und wie Leon das Passwort verwaltet.

---

## TL;DR — der schnelle Weg rein

1. Browser öffnen → **https://kalkulai-team-os.vercel.app**
2. Du landest automatisch auf einer Login-Seite.
3. **Passwort eingeben** (das Leon dir per Signal/Telegram geschickt hat).
4. **Anmelden** → du bist drin, bleibst **30 Tage** angemeldet.

Wenn du dich für **Felix** oder **Paul** ausgeben willst (KPIs/Branches/Tasks pro Person), klick oben rechts auf den **Avatar-Dropdown** und wähl deinen Namen.

---

## Aktueller Stand (Mai 2026)

**Felix & Paul:**
- ✅ Telegram-`chat_id` ist eingetragen
- ✅ Linear-User-ID + GitHub-Username + Notion-User-ID sind eingetragen
- ❌ Google Calendar noch nicht verbunden ← **das musst du noch machen**
- ❌ (nur Paul) HubSpot-Owner-ID fehlt ← optional, nur für Sales-Call-Tracking aus dem CRM

**Cron-Status:**
- Das automatische 06:00-Telegram-Briefing ist **aktuell nicht aktiviert** (`vercel.json` hat `"crons": []`). Wird mit dem Hermes-Setup nachgezogen. Bis dahin: Telegram bleibt stumm, das Dashboard aber live.

---

## Was du als Felix oder Paul jetzt konkret tun musst

### 1. Google Calendar verbinden (5 min)
- Auf https://kalkulai-team-os.vercel.app einloggen (Passwort von Leon).
- Oben rechts auf deinen Avatar → "Settings" wählen (oder direkt: `/settings`).
- Im Block **"Google Calendar"** → **"Mit Google Calendar verbinden"** klicken.
- Mit **deiner @kalkulai.de Mail** anmelden (NICHT private Mail), Zugriff bestätigen.
- Effekt: Deine Termine erscheinen jetzt im Dashboard. Wenn der 06:00-Cron später aktiviert wird, kommen sie auch ins Telegram-Briefing.

### 2. (nur Paul) HubSpot-Owner-ID an Leon geben — optional
- Sales-Calls aus HubSpot werden nur aggregiert wenn `hubspot_owner_id` gesetzt ist.
- Sag Leon deine HubSpot-User-ID (HubSpot → Settings → My Account → User-ID).
- Er trägt sie in die `team_members`-Tabelle.

---

## Falls du eine neue Person bist (nicht Felix oder Paul)

Dann fehlt dir initial alles. Onboarding-Reihenfolge:
1. Leon bittet dich, dem Bot https://t.me/Kalkulai_team_os_bot ein `/start` zu schicken → er trägt deine `chat_id` ein.
2. Leon trägt deine Linear-User-ID, GitHub-Handle, Notion-User-ID nach.
3. Du loggst dich am Dashboard mit dem Team-Passwort ein.
4. Du verbindest deinen Google Calendar (siehe oben).

---

## Wenn was nicht funktioniert

| Symptom | Lösung |
|---|---|
| **"Falsches Passwort"** | Mit Leon abklären — das Passwort kann sich geändert haben (siehe unten "Passwort rotieren"). |
| **Login-Seite kommt ständig wieder** | Cookies in deinem Browser sind blockiert. Browser-Einstellungen → Cookies für `kalkulai-team-os.vercel.app` erlauben. |
| **"Keine Teammitglieder konfiguriert"** | DB-Setup-Problem auf Leons Seite, ihm Bescheid sagen. |
| **Dashboard zeigt 0/0 KPIs** | Du hast noch keine KPIs angelegt. Setze sie in `/settings` → "KPIs und Projekte". |
| **Tasks fehlen** | Linear-User-ID nicht zugeordnet. Leon prüfen lassen ob du in der DB mit `linear_user_id` korrekt eingetragen bist. |
| **Termine fehlen trotz Google-Verbindung** | Calendar OAuth-Flow nochmal durchlaufen (`/settings` → "Anderen Account verbinden"). |
| **Branches/Commits zeigen mich nicht** | Dein GitHub-Username muss in der DB stimmen (Felix: `fmag0009`, Paul: `paul-kai`, Leon: `lp-kai`). |

---

## Wenn Hermes (oder Claude Code) das Dashboard schreibt

Das ist nicht für dich relevant als Felix/Paul — Hermes nutzt einen separaten Server-Bearer-Token (`DASHBOARD_API_SECRET`) und kommt ohne Browser-Login durch. Wenn du KPIs/Projekte siehst, die du nicht selbst angelegt hast, ist das Hermes oder Leon.

Details für AI-Agenten: siehe `docs/AI-OPERATIONS.md`.

---

## Für Leon — Passwort verwalten

### Passwort ändern

1. Neues Passwort generieren:
   ```bash
   node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))"
   ```
2. In **drei** Stellen aktualisieren:
   - `.env.local` (lokal für `npm run dev`):
     ```
     TEAM_OS_ACCESS_PASSWORD=<neuer-wert>
     ```
   - Vercel-Project → Settings → Environment Variables → `TEAM_OS_ACCESS_PASSWORD` editieren → Save.
   - **Re-Deploy triggern** (Vercel-UI "Redeploy" oder `git commit --allow-empty -m "rotate access password" && git push`).
3. Neues Passwort an Felix + Paul senden (Signal/Telegram).
4. Bestehende Sessions bleiben gültig (30 Tage) — wenn du alle sofort rauswerfen willst, siehe nächster Abschnitt.

### Alle Sessions invalidieren (Notfall)

Wenn das Passwort geleakt ist und du **alle bestehenden Cookies sofort ungültig machen** willst:

1. **HMAC-Secret rotieren**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. In `.env.local` + Vercel-Env: `TEAM_OS_AUTH_SECRET=<neuer-wert>` setzen + Re-Deploy.
3. Alle bestehenden Cookies werden bei der nächsten Request mit `verifyAuthCookie` als "Signatur ungültig" abgelehnt — Browser landet auf `/login`.

### Neue Person ans Team adden

Aktuell ist Auth ein **gemeinsames Passwort**, keine User-Accounts. Wenn jemand Neues Zugang bekommen soll:
- Sag ihr das Passwort weiter.
- DB-Eintrag in `team_members` für die Person hinzufügen (sonst zeigt das Dashboard sie nicht als auswählbaren Member im Dropdown).
- Optional: Linear-User-ID, GitHub-Username, Telegram-Chat-ID, HubSpot-Owner-ID nachtragen.

### Person rauswerfen (Person verlässt das Team)

1. DB-Eintrag in `team_members` löschen (oder `role=null` setzen damit Linear/GitHub-Filter nicht mehr matched).
2. Passwort rotieren (siehe oben), damit die Person mit dem alten Passwort nicht mehr reinkommt.

---

## Architektur (für später, falls jemand verstehen will wie's funktioniert)

- **Middleware**: `middleware.ts` (Edge-Runtime) prüft auf jedem Request ein signiertes Cookie `team-os-auth`. Ohne Cookie → Redirect auf `/login`.
- **Cookie-Format**: `<exp_unix>.<hmac_base64url>` — HMAC-SHA-256 mit `TEAM_OS_AUTH_SECRET`. Edge-kompatibel via `crypto.subtle`.
- **Public-Routen** (keine Auth nötig): `/login`, `/api/auth/*`, `/api/oauth/google/*` (Browser-Redirect von Google), `/api/webhooks/*` (HMAC-secured), `/api/members` (für den Login-Page-Dropdown).
- **API-Routen** (`/api/*` außer public): durchlassen wenn **Bearer-Token ODER Cookie** — Hermes nutzt Bearer, Browser nutzt Cookie.
- **Quellcode**: `lib/auth-cookie.ts` (sign/verify), `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/login/page.tsx`.
- **Tests**: `tests/auth-cookie.test.ts` (11 Tests, HMAC + Tampering + Expiry + Wrong-Password).
