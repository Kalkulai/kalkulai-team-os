# Agent Cockpit Clean Map Design

## Ziel

`/dashboard/agents` wird zu einer ruhigen Arbeitskarte fuer Leon: mehrere laufende Terminals sind gleichzeitig sichtbar, frei verschiebbar und sofort ihrem Repo, Arbeitsziel und aktuellen Task-Kontext zuordenbar.

Die Map ist kein Kanban, keine permanente Repo-Liste und kein dekorativer Graph. Sie ist ein Live-Arbeitsplatz fuer Claude, Codex, Shell und spaeter weitere Runtimes.

## Grundprinzipien

- Alles Sichtbare muss direkten Arbeitswert haben.
- Keine Linear-IDs wie `KAL-154` in der primaeren Map-UI.
- Kein permanenter Backlog, keine dauerhafte Taskliste, keine dauerhafte Sidebar.
- Keine Projekt-Knoten in V1.
- Repo-Knoten gibt es, aber nur fuer aktive oder gepinnte Repos.
- Terminal-Karten repraesentieren Arbeitsziele/Projekte oder Queues.
- Subagents sind keine Hauptterminals. Sie haengen sichtbar am Terminal, das sie deployed oder nutzt.
- Fertige Runs verschwinden nicht heimlich. `done pending` bleibt sichtbar, bis Leon entscheidet.

## Map Semantik

Die Canvas ist eine offene, freie Arbeitsflaeche. Repo-Knoten und Terminals sind frei verschiebbar.

Repo-Knoten erscheinen nur, wenn mindestens ein aktives oder gepinntes Terminal in diesem Repo arbeitet. Wenn kein aktives/gepinntes Terminal mehr daran haengt, verschwindet der Knoten aus der Live-Map.

Ein Repo-Knoten zeigt nur:

```text
Team OS · 2
Operations · 1
2nd Brain · 1
```

Keine Branches, Worktrees oder Warnsymbole im Repo-Knoten. Solche Details gehoeren in den Inspector.

Verbindungen in V1:

- Repo-Knoten -> Terminal
- Terminal -> Subagents

Keine Projekt-Knoten, keine Repo-Liste, keine kuenstlichen Abhaengigkeits-Faeden zwischen Terminals.

## Terminal Node

Das Terminal selbst bleibt neutral und minimalistisch im Mac-Terminal-Stil:

- dunkler, ruhiger Kasten
- keine Repo-Farbe als grosser Rahmen
- optional kleine Window-Dots
- Terminal-Output nimmt den Hauptplatz ein
- Agent-Typ oben rechts nur als kleines Icon oder Logo
- Statuspunkt oben rechts neben dem Agent-Icon

Auf dem Terminal sitzt oben eine farbige Repo-Rune. Diese Rune ist der eigentliche Kontextanker.

Rune-Format:

```text
{Arbeitsziel} · {Run Label}
```

Beispiele:

```text
Agent Cockpit · Map cleanup
Partnerships · Bayern prep
Reels · Obsidian triage
Queue · Gmail Kandidaten prüfen
```

Arbeitsziel-Fallback:

1. Projekt/Workstream, z.B. `Agent Cockpit`
2. Repo/Workspace, z.B. `Team OS`
3. `Run`

Run Label:

- Default wird automatisch aus Task/Agent-Kontext erzeugt.
- Stark gekuerzt.
- Keine technischen IDs.
- Im Start-Flow editierbar.
- Bleibt stabil, damit die Map nicht staendig springt.

Repo-Farbe:

- Repo-Knoten, Repo-Faden und Terminal-Rune nutzen dieselbe Farbe.
- Terminal-Koerper bleibt neutral.
- Defaults pro bekanntem Repo, spaeter konfigurierbar.

## Terminal Status

Status wird nur als dezenter Punkt oben rechts neben dem Agent-Icon angezeigt.

Statusfarben:

- gruen: `running`
- blau/hell: `review`
- gelb: `done pending` oder `needs decision`
- rot: `blocked` oder `failed`
- grau: `idle`

Kein Status-Text in der Rune. Details erscheinen im Inspector.

## Subagents

Subagents werden nicht im Terminal angezeigt. Sie erscheinen als kleine Figuren/Punkte unterhalb des Terminals.

Regeln:

- Keine Subagents = nichts anzeigen.
- Subagents sind keine Buttons.
- Sie bewegen sich visuell mit dem Terminal.
- Kleine Faeden verbinden Terminal und Subagents.
- Inspector listet Subagents detaillierter auf.

Subagent-Minimaldaten:

- Name oder kurzer Alias, falls vorhanden
- Status: active, idle, blocked, done
- Runtime/Typ nur falls sinnvoll

## Inspector

Klick auf ein Terminal oeffnet rechts einen schmalen Inspector. Klick auf leere Canvas schliesst ihn. Klick auf ein anderes Terminal wechselt den Inspector.

Der Inspector ist minimalistisch wie Codex, aber auf Team-OS-Workflows zugeschnitten.

Reihenfolge:

1. Fortschritt
2. Danach / Follow-up
3. Änderungen
4. Umgebung
5. Subagents
6. Abschlusskarte, falls relevant

### Fortschritt

Oben steht der Agent-Plan dieser Session:

```text
✓ Runner archiviert Done-Sessions
● Terminal-Map aufräumen
○ Subagents unten anbinden
○ Browser-QA durchführen
```

Darunter steht maximal die naechste Projekt-/Follow-up-Task:

```text
Danach
Start-Modal vereinfachen
```

Keine riesige Projektliste im Inspector.

### Änderungen

Kompakt:

```text
+275  -9
8 Dateien geändert
```

Kein voller Diff in V1.

### Umgebung

Zeigt technische Sicherheitsinfos:

```text
Repo: Team OS
Branch: codex/agent-map
Worktree: C:\Kalkulai\worktrees\team-os-agent-map
```

Wenn mehrere aktive Terminals im gleichen Repo und gleichen Worktree/Branch laufen, wird das Risiko hier angezeigt, nicht auf der Map.

### Subagents

Liste der Subagents dieser Session:

```text
Hilbert   active
Raman     idle
Fermat    blocked
```

Wenn keine Subagents existieren, wird die Section ausgeblendet.

## Start Run

Der globale `Start Run` Button oeffnet zuerst ein kleines Popover mit zwei Optionen:

```text
Aus Task starten
Quick Terminal
```

Kein Split-Screen.

### Aus Task starten

Gefuehrter Flow:

- Task/Projekt waehlen
- Runtime waehlen
- Repo/Worktree bestaetigen
- Run Label editieren
- Start

Task-Auswahl:

- Suche oben
- Gruppen nach Dashboard-Logik:
  - Empfohlen
  - Heute / Überfällig
  - Hohe Priorität
  - Projektsequenzen
- Sortierung nach Prioritaet, Faelligkeit, `Needs Leon`, laufenden Sessions.
- Tasks in Projekten werden unter ihrem Projekt gruppiert.
- Projekte sind einklappbar.

Man kann entweder eine einzelne Task starten oder ein ganzes Projekt starten.

### Projekt Run

Ein Projekt-Run arbeitet Task fuer Task im selben Terminalkontext.

Nach erledigtem Step:

- Low-risk: Agent darf zur naechsten Task springen.
- Riskant/unklar/entscheidungsbeduerftig: Agent stoppt und fragt Leon.

Riskant ist unter anderem:

- Auth, Security, DB, Migrations
- externe Kommunikation
- groessere UI-Entscheidungen ohne Freigabe
- gleicher Repo + gleicher Worktree/Branch wie ein anderer aktiver Run
- unklare Anforderungen

### Quick Terminal

Minimaler Flow:

- Runtime
- Repo/Worktree
- optional Label
- Start

Das Terminal kann spaeter an Tasks oder Projekte angeheftet werden.

## Queue Runs

Ein Quick Terminal kann zur Arbeits-Queue werden.

Tasks koennen per Drag & Drop oder ueber `Add to existing Run` in ein laufendes Terminal gelegt werden.

Queue-Regeln:

- Ein Run hat ein primaeres Repo/Workspace.
- Nicht-code/Ops/Research/Sales-Tasks duerfen gemischt werden.
- Code-Tasks mit anderem Repo brauchen eigenen Run oder expliziten Worktree-Wechsel.
- Repo-fremde Code-Tasks duerfen nicht still in die Queue gemischt werden.

Queue-Rune:

```text
Queue · aktueller Task
```

Wenn keine aktuelle Task gesetzt ist:

```text
Queue · leer
```

Agenten duerfen im Terminal per Prompt aufgefordert werden, Tasks anzugehen. Wenn ein Agent eine Task erkennt, zeigt der Inspector einen Vorschlag:

- `An Run anheften`
- `In Queue legen`
- `Ignorieren`

## Task Tracking Lifecycle

Agenten duerfen Task-Tracking aktiv steuern:

- Task an Run pinnen
- Task auf `in_progress` setzen
- Task auf `review` setzen
- Task auf `blocked/needs_leon` setzen
- Task als `done` vorschlagen

`done` wird nicht still bestaetigt.

Wenn ein Agent eine Task fertig meldet, zeigt der Inspector eine Abschlusskarte:

- Was wurde gemacht?
- Welche Dateien/Changes?
- Welche Tests/Checks?
- Gibt es Folgeaufgaben?

Aktionen:

- `Done bestätigen`
- `Review nötig`
- `Weiterarbeiten`
- `Blockiert`

Nach `Done bestätigen`:

Wenn es eine naechste Queue-/Projekt-Task gibt:

```text
Task erledigt.
Als nächstes:
[Weiter mit nächster Task] [Neue Task hinzufügen] [Session schließen]
```

Wenn keine naechste Task existiert:

```text
Task erledigt.
Was jetzt?
[Neue Task hinzufügen] [Session schließen] [Terminal offen lassen]
```

Wenn der Agent eine Folgeaufgabe gefunden hat:

```text
Neue Folgeaufgabe erkannt:
"Start-Modal Run Label editierbar machen"
[Zur Queue hinzufügen] [Als Task erstellen] [Ignorieren]
```

`done pending` Runs bleiben sichtbar, bis Leon entscheidet. Kein Auto-Archiv in V1.

## Nicht-Ziele V1

- Kein Kanban als Haupt-UX.
- Keine permanente Liste aller Repos.
- Keine Projekt-Knoten.
- Keine sichtbaren Linear-IDs in der Haupt-Map.
- Keine Fake-Erkennung interner Claude/Codex-Subagents.
- Keine Remote-Runner/Paperclip-Integration.
- Kein voller Diff-Viewer im Inspector.
- Kein automatisches Schliessen von `done pending` Runs.

## Umsetzungsphasen

### Phase 3.1: Graph ViewModel bereinigen

- Repo-Knoten nur fuer aktive/gepinnte Repos.
- Terminal-Nodes als Arbeitsziel-Objekte.
- Keine Projekt-Knoten.
- `run_label`, `work_goal`, `repo_key`, `pinned`, `queue`, `subagents` ins ViewModel.

### Phase 3.2: Terminal Node Redesign

- neutraler Mac-Terminal-Stil
- aufgesetzte Repo-Rune
- Agent-Icon oben rechts
- Statuspunkt
- keine IDs
- Subagent-Figuren unterhalb

### Phase 3.3: Inspector Redesign

- Codex-artige schmale Seitenflaeche
- Agent-Plan
- naechste Follow-up Task
- Changes
- Umgebung
- Subagents
- Abschlusskarte

### Phase 3.4: Start Run und Queue

- `Start Run` Popover: `Aus Task starten`, `Quick Terminal`
- Task-Start-Modal nach Dashboard-Sortierung
- Quick Terminal Mini-Flow
- Tasks zu bestehendem Run hinzufuegen
- Queue-Lifecycle

### Phase 3.5: Task Tracking Abschlussloop

- Agent kann Status setzen/vorschlagen
- `done pending`
- Inspector-Actions
- Session weiterfuehren oder schliessen

