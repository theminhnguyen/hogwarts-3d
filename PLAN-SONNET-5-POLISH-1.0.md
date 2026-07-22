# Hogwarts 3D — Arbeitsauftrag für Sonnet 5: Karte des Rumtreibers & 1.0 Polish

## Auftrag und Zielbild

Setze einen fokussierten **1.0-Polish-Release** um. Das Spiel hat bereits viel
Content; dieser Release darf **keine neue Weltregion, Kreatur, Zauber,
Endgame-Quest oder Wirtschaftssystem** hinzufügen. Er soll stattdessen aus dem
vorhandenen Inhalt eine nachvollziehbare, anfängerfreundliche Reise machen.

Die vier verbindlichen Säulen sind:

1. **Karte des Rumtreibers:** Karte, Questlog und Orientierung für die bestehende Welt.
2. **Bessere Hinweise und Einstieg:** weniger Überforderung, kontextbezogene Hilfe.
3. **Sicherer Spielstand:** Export, Import, Validierung, Backup und deutliche Rückmeldung.
4. **Release-Polish:** Regressionstests für Save/Progress, Fehlerpfade, Dokumentation und ein sauberer manueller Testplan.

Arbeite in kleinen, nachvollziehbaren Commits. Nach jedem Meilenstein lokal
starten (`node dev-server.mjs`) und gegen einen neuen sowie einen fortgeschrittenen
Spielstand testen. Behalte den bestehenden Stil bei: Vanilla ES-Module, Three.js,
kein Build-Schritt, keine externen Assets und keine neue Laufzeit-Abhängigkeit.

Vor Änderungen zuerst den aktuellen `main`-Stand lesen; diese Planung beschreibt
die Struktur zum Zeitpunkt der Erstellung, nicht eine Lizenz zum Überschreiben
späterer Änderungen.

## Nicht-Ziele

- Kein Teleport/Flohpulver in diesem Release. Die Karte soll Entdecken erleichtern,
  nicht Erkundung überspringen.
- Keine Minikarte, die dauerhaft das HUD überlädt.
- Keine Telemetrie, kein Backend, kein Login und keine externe Analytics.
- Keine Änderung an Kampfbalance oder Quest-Belohnungen, außer ein echter Bug
  verhindert vorhandenen Fortschritt.
- Keine pauschalen Refactorings von Gameplay-Modulen. Neue Schnittstellen nur dort,
  wo sie für Queststatus, Save oder UI zwingend helfen.

## Bestehende Architektur berücksichtigen

- `index.html` enthält das gesamte CSS und die HUD-/Menü-Markup-Struktur.
- `src/main.js` baut die Welt schrittweise, hält aktuell `loadSave()`, `writeSave()`
  und die Persistenzverdrahtung.
- `src/hud.js` verwaltet HUD, Hinweise, Dialoge, Toasts und Spellbar.
- Progress liegt aktuell lokal unter `hogwarts3d-save-v1`, mit einer gespeicherten
  Versionszahl und vielen verschachtelten Teilzuständen (u. a. `collected`, `art`,
  `pz`, `moor`, `quests`, `heim`, `hallows`, `animagus`).
- Bestehende Systeme stellen Status über ihre Instanzen bereit. Wo der genaue Name
  vom aktuellen Branch abweicht, zuerst die tatsächliche, öffentliche API lesen;
  keine privaten Modulvariablen anzapfen.

## Meilenstein A — Datenfundament und progress-sichere Saves

### A1. Save-Code aus `main.js` herauslösen

Lege `src/save.js` an. Das Modul soll die reine, testbare Save-Logik enthalten:

- `SAVE_KEY`, `SAVE_VERSION` und einen vollständigen `DEFAULT_SAVE`.
- `normalizeSave(value)`: akzeptiert nur erwartete Primitive, Arrays und bekannte
  Objektfelder; liefert stets einen vollständigen, sicheren Save-Zustand.
- `loadSave(storage)`, `writeSave(storage, data)` und eine eindeutige
  Migrationsstrategie von alten Ständen auf die neue Version.
- `createExport(data)` und `parseImport(text)` für das Import/Export-Format.

Der Browserzugriff bleibt dünn: lokale Speicherung über einen übergebenen
`storage`-Adapter, nicht versteckt in der Normalisierungslogik. Dadurch lassen sich
die kritischen Pfade mit `node --test` prüfen.

### A2. Save-Schema erweitern

Erhöhe die gespeicherte Version nur einmal und ergänze schlanke Zustände für:

```js
tutorial: { seen: [] },
map: { discovered: [] },
ui: { mapHelpSeen: false },
```

Alte Saves müssen ohne Datenverlust funktionieren. Unbekannte zukünftige Felder
dürfen nicht zu einem Absturz führen. Der bekannte Spielstand darf nicht durch
einen neuen Save-Default zurückgesetzt werden.

### A3. Export/Import mit Fehlerschutz

Erweitere das Pausenmenü um:

- `Spielstand exportieren` — erstellt eine lokal herunterladbare JSON-Datei,
  beispielsweise `hogwarts-3d-save-YYYY-MM-DD.json`.
- `Spielstand importieren` — Dateiauswahl über ein verstecktes
  `<input type="file" accept="application/json,.json">`.
- Vor dem Überschreiben: verständlicher Bestätigungsdialog mit Hinweis, dass der
  aktuelle Fortschritt ersetzt wird. Direkt vorher eine lokale Sicherung unter
  einem separaten Backup-Key anlegen.
- Nach einem erfolgreichen Import: Erfolgsmeldung und kontrollierter Reload.
- Bei ungültigem, zu großem oder unpassendem Format: nichts schreiben, klare
  Fehlermeldung, kein Stacktrace und kein stiller Reset.

Exportformat:

```json
{
  "format": "hogwarts3d-save",
  "version": 6,
  "exportedAt": "ISO-8601",
  "data": { "...": "normalisierter Spielstand" }
}
```

`version` muss aus der zentralen Konstante kommen. Begrenze die Importgröße
defensiv (z. B. 250 KB; der konkrete Grenzwert darf angepasst werden, solange er
deutlich über realen Saves liegt). Niemals dynamischen Importinhalt via
`innerHTML` ausgeben; für Dateinamen, Meldungen und Vorschauen `textContent`
verwenden.

### A4. Reset absichern

Der bestehende Fortschritts-Reset muss ebenfalls eine eindeutige Bestätigung
erfordern. Bei Bestätigung vorher denselben lokalen Backup-Mechanismus verwenden.
Die UI darf nicht suggerieren, dass ein Zurücksetzen rückgängig gemacht werden
kann, wenn nur der eine lokale Backup-Key vorhanden ist.

## Meilenstein B — Karte des Rumtreibers und Questlog

### B1. Eigenes, kleines UI-System

Lege `src/marauders-map.js` (oder einen gleich klaren Namen) an. Es erhält keine
Three.js-Szene und baut keine Spielwelt neu; es ist ein UI-/Progress-System.

Öffnen/schließen:

- Taste `J` im Spiel und im Pausenmenü ein Button `Karte & Aufgaben`.
- `Esc` schließt zuerst die Karte, bevor das Pausenmenü geöffnet wird.
- Während Karte oder Import-Dialog offen ist: keine Bewegungs-, Zauber- oder
  Kameraeingaben an das Spiel weiterreichen.
- Im Startmenü erscheint `J` nur in „Weitere Steuerung“, nicht in der kurzen
  Anfängersteuerung.

Darstellung:

- Vollbild-Overlay im bestehenden Parchment-/Gold-/Georgia-Stil.
- Linke Seite: aktive Hauptaufgabe, optional darunter bis zu zwei Nebenaufgaben.
- Mitte: stilisierte, CSS-gezeichnete Übersicht der Welt. Keine externen Bilder,
  keine Canvas-Textur nötig. Ein einfacher Umriss, Landmarken und ein
  Spieler-Marker reichen.
- Rechte Seite: kurze Legende und „Als Nächstes“-Hinweis.
- Kein permanentes Tracking und keine exakten Meterwerte für alle Geheimnisse.

### B2. Entdeckungsprinzip

Definiere eine zentrale Liste von Landmarken mit stabilen IDs, Namen, Welt-
Koordinaten, optionaler Kurzbeschreibung und Sichtbarkeitsregel. Mindestens:

- Schloss / Innenhof
- Großer Saal
- See / Bootshaus
- Quidditch-Feld
- Eulenbrück
- Steinkreis
- Astronomieturm
- Nebelmoor
- Wispernde Kate

Beim ersten Betreten eines moderaten Radius wird die Landmarke als entdeckt in
`save.map.discovered` gespeichert. Bereits beim ersten Start sind Schloss und
der erste naheliegende Orientierungsort sichtbar. Nicht entdeckte Orte bleiben
als unbenannte Tintenflecken oder fehlen — keine Spoilerkarte.

Zeige nur die aktuelle Hauptaufgabe als dezente Zielmarke, falls deren Zielort
inhaltlich bekannt sein darf. Das Ziel bleibt eine Richtung, kein GPS-Pfeil.

### B3. Objective Resolver statt verstreuter Texte

Lege eine kleine, möglichst reine Fortschrittsfunktion an, z. B.
`src/progress.js`. Sie erhält einen normalisierten Save plus die minimal nötigen
öffentlichen Laufzeitwerte und gibt ein Datenobjekt zurück:

```js
{
  chapter: "Der Hauspokal",
  primary: { id, title, description, landmarkId, completed },
  secondary: [{ id, title, description, landmarkId }],
  nextHint: "..."
}
```

Die Priorität muss die bestehende Progression respektieren, statt neue Gates zu
erfinden:

1. Hauspokal: fehlende Schnätze / Artefakte / Rätsel verständlich bündeln.
2. Nach dem Hauspokal: Nebelmoor und Seelenlichter.
3. Danach: vorhandene Endgame-Pfade (z. B. Heiligtümer/Animagus) nur dann
   nennen, wenn ihre echte Freischaltbedingung im Save erfüllt ist.
4. Laufende NPC-Nebenquests, soweit ihr Status aus dem bestehenden Quest-Save
   zuverlässig bestimmt werden kann.

Wenn eine Nebenquest technisch nicht zuverlässig ableitbar ist, sie nicht raten
oder hart codieren. Stattdessen zunächst nur die verlässlich berechenbaren
Hauptstränge integrieren und eine klare TODO-/API-Notiz hinterlassen.

Der Resolver darf keine Spielzustände ändern und keine Texte per DOM schreiben.
Er wird sowohl von Karte als auch von Hinweisen verwendet; damit gibt es für
„Was als Nächstes?“ nur eine Quelle der Wahrheit.

## Meilenstein C — Bessere Hinweise und Einstieg

### C1. Startmenü entschlacken

Für einen neuen Spielstand zeigt der Startscreen nur:

- `WASD` — bewegen
- Maus — umsehen
- Linksklick — Zauber wirken
- `E` — interagieren
- einen dezenten Hinweis auf `J` für Karte/Aufgaben nach Spielstart

Alle anderen Steuerungen kommen in eine aufklappbare Sektion „Weitere
Steuerung“ bzw. ins Pausenmenü. Gesperrte Endgame-Funktionen dürfen nicht die
erste Lernoberfläche dominieren. Bestehende Komfortoptionen (Ton, Grafik,
friedlicher Modus, Musik, Tierform) bleiben erreichbar, aber visuell nachrangig.

Für bestehende/fortgeschrittene Saves darf ein kompakter Fortschrittsstatus im
Menü stehen; er darf aber nicht wieder die lange Steuerungsliste zurückbringen.

### C2. Kontext-Hinweise statt Toast-Spam

Lege `src/tutorial.js` an oder kapsle den Mechanismus gleichwertig. Nutze
`tutorial.seen`, damit ein Hinweis nach einem Reload nicht wiederholt wird.

Verbindliche Hinweise:

- Nach Start: „Sieh dich um und folge dem goldenen Hinweis.“
- Bei einem Interaktionspunkt in Reichweite: einmalig `E` erklären.
- Beim ersten Zauberziel: Zauber auswählen/Linksklick kurz erklären.
- Beim ersten Fund: `J` für Karte & Aufgaben erklären.
- Bei einem aktiven Hauptziel ohne Fortschritt über eine sinnvolle Zeitspanne:
  sanfter Hinweis aus `progress.nextHint`, mit Cooldown.
- Bei niedrigem Leben: Hinweis auf eine vorhandene Heiloption, aber nur wenn
  sie dem Spieler bereits bekannt bzw. sinnvoll erreichbar ist.

Regeln:

- Maximal ein erklärender Hinweis gleichzeitig.
- Ereigniskritische Meldungen (Tod, Questabschluss, Fehlermeldung) haben
  Vorrang vor Tutorialtext.
- Ein Hinweis darf den Spieler nicht beim Zielen, Dialog oder Kampf blockieren.
- Keine unaufgeforderten Hinweise für noch nicht freigeschaltete Systeme.

Wenn `Hud` dafür eine Toast-Queue oder Prioritäten braucht, implementiere sie
klein und rückwärtskompatibel. Bestehende Aufrufe von `showToast()` müssen
weiter funktionieren.

## Meilenstein D — 1.0 Release-Polish

### D1. Lade- und Fehlerpfad

Die bestehende schrittweise Welt-Erzeugung bekommt einen benutzerfreundlichen
Fehlerpfad: Schlägt ein Build-Schritt fehl, bleibt kein endloses „Die Welt wird
erschaffen …“ stehen. Zeige eine kurze, nicht technische Nachricht und einen
Button zum Neuladen. Den technischen Fehler nur in der Konsole ausgeben.

### D2. Tests ohne neue Dependencies

Füge ein minimales `package.json` mit mindestens diesem Script hinzu:

```json
{ "scripts": { "test": "node --test" } }
```

Keine Testbibliothek installieren. Schreibe mit `node:test` und `node:assert`
mindestens Tests für:

- vollständigen aktuellen Spielstand → Normalisierung bewahrt alle bekannten
  Felder;
- alter/unvollständiger Spielstand → sichere Defaults, keine Ausnahme;
- kaputtes JSON/ungültiges Importformat → sauberer Fehler, kein Schreibzugriff;
- Export → Import → Normalisierung erhält Fortschritt;
- neue Felder `tutorial`/`map` werden bei alten Saves korrekt ergänzt;
- Objective Resolver für mindestens: frischer Save, Hauspokal-Progress,
  Hauspokal gewonnen/Moor, späterer Progress.

### D3. Manueller Release-Check

Lege `TESTPLAN-1.0.md` im Repository an. Er muss kurz und ausführbar sein:

1. Neuer Spielstand: Startmenü, Start, erste Interaktion, erster Hinweis,
   Karte öffnen/schließen.
2. Alt-/Midgame-Save: Migration, Karte ohne Spoiler, vorhandene Queststände.
3. Endgame-Save: keine regressiven Locks bei Zaubern, Mounts, Begleitern,
   Animagus oder Heiligtümern.
4. Export → frischen Browser-/Profilzustand → Import → alle repräsentativen
   Werte vorhanden.
5. Ungültige Datei und Reset-Abbruch verändern keinen Save.
6. Desktop-Größen 1280×720 und 1920×1080: Karte, Menü und HUD überlappen nicht.
7. Keine neuen Konsolenfehler beim Laden, Öffnen der Karte, Export/Import oder
   Zurücksetzen.

### D4. README aktualisieren

Ergänze knapp, ohne die Featureliste weiter aufzublähen:

- ein Abschnitt „Orientierung“ mit `J` und Karte/Aufgaben;
- ein Abschnitt „Spielstand sichern“ mit Export/Import und dem Hinweis, dass
  Browserdaten lokal sind;
- die beiden neuen Entwicklungsbefehle: lokaler Server und `npm test`.

## Vorgeschlagene Dateischnitte

| Datei | Zweck |
| --- | --- |
| `src/save.js` | Defaults, Migration, Normalisierung, Import/Export-Parser |
| `src/progress.js` | Reiner Resolver für Kapitel, Aufgaben und nächsten Hinweis |
| `src/marauders-map.js` | Karte/Questlog-Overlay, Landmarken, Entdeckungslogik |
| `src/tutorial.js` | Einmalige, priorisierte Kontext-Hinweise |
| `src/main.js` | Dünne Verdrahtung, Persistenz, Lifecycle und Eingabe-Gates |
| `src/hud.js` | Nur falls Toast-Priorität/Queue oder UI-Helfer nötig sind |
| `index.html` | CSS und Markup für Overlay, kurze Steuerung, Save-Aktionen |
| `tests/*.test.mjs` | Node-Standardtests für Save und Progress |
| `package.json`, `TESTPLAN-1.0.md`, `README.md` | Testscript und Release-Dokumentation |

Wenn vorhandene Namen/Dateigrenzen im aktuellen Branch nicht passen, den
Gedanken der Trennung beibehalten, aber nicht künstlich umbenennen.

## Qualitäts- und Abnahmekriterien

Der Release ist erst fertig, wenn alle Aussagen zutreffen:

- Ein Neuling sieht beim Start höchstens die vier Grundaktionen und kann die
  erste sinnvolle Aufgabe ohne README finden.
- `J` öffnet eine lesbare Karte mit aktuellem Ziel und ohne alle Geheimnisse zu
  verraten; Landmarken werden nach Besuch persistent entdeckt.
- Karte, Dialog, Pausenmenü und Import überschneiden sich nicht und lassen keine
  Spielfeldeingaben durch.
- Hinweise sind nützlich, einmalig und überlagern wichtige Gameplay-Meldungen
  nicht.
- Ein Export lässt sich in einem frischen lokalen Browserzustand importieren;
  der Fortschritt kommt vollständig zurück.
- Kaputte Importdateien, abgebrochener Import und abgebrochener Reset verändern
  den Spielstand nicht.
- Alte lokale Saves starten ohne Fehler und erhalten die neuen Defaults.
- `npm test` läuft erfolgreich; der manuelle Testplan ist vollständig
  durchgespielt.
- Keine externen Assets, keine neue Runtime-Abhängigkeit und keine neuen
  Konsolenfehler.

## Abschlussbericht von Sonnet 5

Am Ende liefern:

1. kurze Zusammenfassung nach Meilenstein A–D;
2. Liste der geänderten Dateien mit Begründung;
3. ausgeführte automatisierte und manuelle Tests samt Ergebnis;
4. bekannte Restpunkte — nur echte, begründete Einschränkungen, keine vagen
   „könnte man später“-Listen;
5. keine neuen Gameplay-Ideen außerhalb dieses Scopes implementieren.
