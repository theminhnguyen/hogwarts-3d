# Plan „Qualität 1.0" — Regressionsschutz & Konsistenz

**Stand:** 2026-08-06 · **Umsetzung:** Sonnet 5 · **Vorgänger:** PLAN-SONNET-5-POLISH-1.0.md

---

## 0. Warum dieser Plan

Am 2026-08-06 wurden in einer einzigen Sitzung **6 echte Bugs** gefunden — alle
durch zufälliges Spielen des Nutzers, keiner durch einen Test. Die Analyse
zeigt ein klares Muster:

| Bug | Datei | Bugklasse |
|---|---|---|
| J-Karte zeigte veralteten Fortschritt | main.js `persist()` | Live-Objekt vs. localStorage divergiert |
| Schwarzwasser ohne sichtbares Wasser | terrain.js `buildWater()` | Parametrisierte Funktion ignoriert ihren Parameter |
| Stein der Wiederkehr reagiert stumm | interact.js | Gesperrtes Ziel ohne Rückmeldung |
| Fero-Handelsstand unauffindbar | npc.js | Platzierung ohne Sichtprüfung |
| Duell/Lager nie „erledigt" | marauders-map.js | Status-Funktion hart auf `'offen'` verdrahtet |
| Duell-Siege nie gespeichert | wilderer.js | Session-Variable ohne Save-Brücke |

**Gemeinsamer Nenner:** 5 der 6 lagen in Modulen mit **null Testabdeckung**.
Getestet sind aktuell 3 von 12 testbaren Modulen (save.js, progress.js,
health.js). Ungetestet, obwohl ohne Three.js-Abhängigkeit und damit sofort
testbar: `interact.js`, `economy.js`, `flight.js`, `noise.js`, `tutorial.js`,
`i18n.js`, `marauders-map.js` (dessen reine Datenteile).

Dieser Plan schließt nicht einzelne Bugs, sondern **die Lücken, durch die sie
gekommen sind**.

---

## Etappe A — Regressionsschutz für die gefundenen Bugklassen

> Ziel: Jeder der 6 Bugs von heute wäre durch einen Test aufgefallen. Kein
> Bug dieser Klasse darf unbemerkt zurückkehren.

### A1 · `tests/i18n.test.mjs` (NEU) — Übersetzungs-Parität automatisieren
Der DE/EN-Paritätscheck wird bisher **von Hand im Browser** gefahren (jedes
Mal ein `fetch` + Regex über den Quelltext). Das gehört in die Suite.

**Achtung — die bekannte Falle:** `i18n.js` greift beim Modul-Laden auf
`localStorage` zu, das unter `node --test` fehlt (siehe Kommentarblock in
`progress.js`). Deshalb **nicht importieren**, sondern die Datei als Text
lesen und parsen — exakt das Verfahren, das im Browser schon funktioniert:

```js
const src = await readFile(new URL('../src/i18n.js', import.meta.url), 'utf8');
const deStart = src.indexOf('\n  de: {');   // zeilenverankert!
const enStart = src.indexOf('\n  en: {');   // naives indexOf('de: {') trifft falsch
const KEY_RE = /^\s{4}'([a-zA-Z0-9_.]+)':/gm;
```

Zu prüfen:
- [x] DE- und EN-Block haben **identische Schlüsselmengen** (keine Waisen)
- [x] Kein Schlüssel doppelt innerhalb eines Blocks
- [x] Jeder `{platzhalter}` im DE-Text existiert auch im EN-Text (und umgekehrt)
      — ein fehlender Platzhalter zeigt im Spiel rohen Text wie `{n}`
- [x] Kein EN-Wert enthält Umlaute/ß (Heuristik für vergessene Übersetzung),
      mit expliziter Ausnahmeliste für Eigennamen (Aschenschwinge, Rimefell …)
      — Ausnahmeliste blieb leer, aktuell kein EN-Wert mit Umlaut/ß.

**Erledigt:** `tests/i18n.test.mjs`, 7 Tests, Commit `95e1f44`.

### A2 · `tests/interact.test.mjs` (NEU) — Interakt-Registry
`interact.js` hat 51 Zeilen, 40 Registrierungen im Spiel und **null Tests** —
obwohl die Datei die zentrale „Taste E"-Logik trägt.

- [x] Getter für `x`/`z` werden **nicht** beim Registrieren eingefroren
      (Property-Descriptor-Kopie, siehe Kommentar in `register()`) — bewegliche
      NPCs hängen daran
- [x] `enabled: false` + `lockedPrompt` → Hinweis wird gezeigt, **aber
      `current` bleibt `null`** (Taste E darf nichts auslösen — Kernzusage des
      Features vom 2026-08-06)
- [x] `enabled: false` ohne `lockedPrompt` → gar keine Anzeige
- [x] Nächstes Ziel gewinnt bei mehreren in Reichweite
- [x] Ziel außer Reichweite → `hideInteractPrompt()`

**Erledigt:** `tests/interact.test.mjs`, 9 Tests, Commit `c632d4a`.

### A3 · `tests/marauders-map.test.mjs` (NEU) — Karten-Datenlogik
Der „Duell/Lager nie erledigt"-Bug wäre hier aufgefallen. Nur die **reinen
Datenteile** testen (`LANDMARKS`, `ALMANAC`, `TITLES`, `landmarkTrackerInfo`)
— DOM-Rendering bleibt außen vor.

**Wichtig:** `marauders-map.js` importiert `i18n.js` (localStorage-Problem,
s. o.). Entweder die Datenarrays in ein importfreies Modul auslagern **oder**
im Test vor dem Import ein `globalThis.localStorage`-Stub setzen. Sonnet 5
soll die Stub-Variante wählen — kein Refactoring nur für den Test.

- [x] **Jeder** `ALMANAC`-Eintrag erreicht `'fertig'` bei passendem Save
      (Regression zum hartverdrahteten `status: () => 'offen'`)
- [x] Jeder Eintrag mit `'gesperrt'` erreicht auch `'offen'` und `'fertig'`
- [x] Alle von `status()`/`hint()` gelesenen Save-Pfade existieren in
      `DEFAULT_SAVE` (fängt Tippfehler wie `s.wild.duellSieg`)
- [x] `landmarkTrackerInfo()`: unbekannte ID → `null`; bekannte → korrekte
      Distanz gegen von Hand gerechneten Wert
- [x] Jede `landmarkId` in `progress.js` existiert in `LANDMARKS`
      (sonst zeigt der neue Kompass ins Leere)

**Erledigt:** `tests/marauders-map.test.mjs`, 11 Tests, Commit `f6c435a`.
`TITLES`/`ALMANAC` dafür in `marauders-map.js` exportiert (waren nur
modul-lokal) — reine Sichtbarkeits-Änderung, kein Verhaltensunterschied.
Stub-Variante gewählt (`globalThis.localStorage` vor dynamischem Import).

### A4 · `tests/save.test.mjs` erweitern — Reset-Vollständigkeit
Der `duellSiege`-Fund („neues Feld im Save, aber nicht im Reset") ist eine
Bugklasse, kein Einzelfall.

- [x] Neuer Test: `DEFAULT_SAVE` und `normalizeSave({})` haben **identische
      Schlüsselmengen auf allen Ebenen** (rekursiv) — schlägt fehl, sobald ein
      Feld in nur einem der beiden ergänzt wird

**Erledigt:** Commit `da33155`. `npm test` nach A1-A4: 65 Tests (Ziel
~60+ erreicht).

---

## Etappe B — Hinweise für gesperrte Interaktionen vervollständigen

Am 2026-08-06 wurde `lockedPrompt` eingeführt und an **7 von 40**
Registrierungen angebracht. Der Rest schweigt weiterhin.

**Ohne jeden Hinweis (29 Registrierungen):**
`npc.js` (10) · `silberhain.js` (5) · `home.js` (3) · `wilderer.js` (3) ·
`broom.js` (2) · `mount.js` (2) · `schwarzwasser.js` (2) ·
`frostzinnen.js` (1) · `schattenfeste.js` (1)

- [x] **B1** Alle 29 durchgehen; `lockedPrompt` **nur dort**, wo das Objekt
      sichtbar ist und die Bedingung nicht selbsterklärend. Kein Hinweis, wo
      das Ziel ohnehin unsichtbar ist (dann sieht der Spieler nichts, was
      reagieren könnte) — lieber weniger als Prompt-Rauschen.
      → Ergebnis: nur 4 von 29 brauchten wirklich einen Hinweis (npc.js
      Leuchtkraut + Katze Musch, wilderer.js Anführer-Truhe + Lager-Käfig).
      Rest: permanent verfügbar, beim Sperren unsichtbar, oder selbsterklärend
      durch sichtbare Animation (Flucht/Duell/Zähm-Ritual).
- [x] **B2** Je Hinweis DE+EN in `i18n.js`; Etappe A1 prüft die Parität dann
      automatisch mit.
- [x] **B3** Browser-Stichprobe an 3 Stellen: Hinweis erscheint, Taste E löst
      nichts aus.

**Erledigt:** Commit `0353806`.

---

## Etappe C — Audit auf wiederkehrende Bugmuster

> Nicht raten, sondern gezielt nach genau den Mustern suchen, die heute je
> einen echten Bug produziert haben.

- [x] **C1 · Parameter-Ignorier-Muster** (wie `buildWater(center)` →
      `LAKE.x`): Alle Funktionen mit optionalen Positions-/Zonen-Parametern
      durchsehen, ob der Parameter im Rumpf **durchgängig** benutzt wird und
      nicht stellenweise die importierte Default-Konstante.
      Kandidaten: `terrain.js`, `geo.js`, `props.js`, `ambient.js`, `fauna.js`
      (dort gibt es laut Aufgabenhistorie ein „Leash-Zentrum parametrisieren").
      → Automatisierter Scan (Positions-Parameter nie im Funktionsrumpf
      referenziert): keine Treffer. `buildWater()` und `leashClamp()`
      stichprobenartig verifiziert: sauber.

- [x] **C2 · Session-Variable ohne Save-Brücke** (wie `winStreak`): Jede
      modul-lokale `let`-Zählvariable prüfen — gehört sie in den Save? Wenn
      ja: Feld + `normalizeSave` + `persist()` + `performReset()` + Test.
      Wenn bewusst nur Session: **Kommentar mit Begründung** (Muster: `following`
      in companion.js, `dailyPicked` in wilderer.js).
      → `following` (companion.js) und `winStreak` (wilderer.js) waren
      unkommentiert, aber korrekt Session-only — Begründung ergänzt.

- [x] **C3 · Hartverdrahtete Statusfunktionen**: Grep nach
      `status: () =>`, `earned: () =>`, `hint: () =>` **ohne** Parameter — eine
      Statusfunktion, die den Save nicht liest, kann sich nie ändern.
      → Keine Treffer mehr.

- [x] **C4 · Gespiegelte Konstanten**: `progress.js` (SCHNATZ_TOTAL &Co.) und
      `marauders-map.js` (LANDMARKS-Koordinaten) spiegeln Werte von Hand aus
      anderen Modulen. **Am 2026-08-06 stichprobenartig geprüft: alle korrekt.**
      Aufgabe hier: einen Test ergänzen, der die Zahlen gegen die echten Quellen
      prüft, wo das ohne Three.js-Import geht (SPOTS.length, ARTIFACT_ORDER).
      → `tests/mirrored-constants.test.mjs` (NEU), 4 Tests: SCHNATZ_/
      ARTIFACT_/LICHTER_/KRAEUTER_TOTAL gegen collectibles.js/puzzles.js/
      moor.js/npc.js, per Text-Parsing (kein Three.js-Import). Alle 4 stimmten.

- [x] **C5 · Live-Save-Divergenz**: `persist()` spiegelt seit dem Fix ins
      Live-Objekt zurück. Prüfen, ob es **weitere** Stellen gibt, die
      `writeSave()` direkt aufrufen und dabei das Live-`save` umgehen
      (Import/Backup-Pfade in `main.js` ~Zeile 1044/1062 — dort ist es
      korrekt, weil danach neu geladen wird; **verifizieren, nicht annehmen**).
      → Verifiziert: beide Stellen unkritisch, weil unmittelbar
      `window.location.reload()` folgt. Mit Begründung kommentiert.

**Erledigt:** Commit `0983272`.

---

## Etappe D — Abschluss

- [x] **D1** `npm test` grün (aktuell 37 Tests; Ziel nach A1–A4: ~60+)
      → 69 Tests, alle grün (nach C4 nochmal +4 gegenüber A-Ziel).
- [x] **D2** `TESTPLAN-1.0.md` um die neuen Testdateien ergänzt
- [x] **D3** `README.md`: Abschnitt „Tests" auf den neuen Stand gebracht
- [x] **D4** Ein voller Browser-Durchlauf: Spielstart → J-Karte → Kompass-
      Verfolgung → Reset → Neuladen. Keine Konsolenfehler.
      → Dabei echten Bug gefunden und sofort gefixt: `restore()` in
      `marauders-map.js` setzte `trackedLandmarkId` beim Reset nicht zurück.
- [x] **D5** Commit + Push je Etappe (nicht alles in einem)
      → 8 Commits: A1 einzeln, dann A2/A3/A4/B/C/D je eigener Commit.

**Erledigt:** Commit `eeb4ccc`. Damit ist der gesamte Qualitätsplan
(Etappen A–D) abgeschlossen.

---

## Arbeitsregeln für Sonnet 5

1. **Reihenfolge A → B → C → D.** Etappe A zuerst, weil ihre Tests die
   Änderungen aus B und C absichern.
2. **Kein Import von `i18n.js` in `progress.js`** — der Grund steht im
   Kommentarblock dieser Datei (localStorage fehlt unter `node --test`).
   Gleiches gilt für neue Testdateien: Text lesen statt importieren, oder
   `globalThis.localStorage` stubben.
3. **Vor jedem `import { t }` in eine neue Datei:** `grep -n "\bt\b"` und
   prüfen, ob eine lokale Variable `t` heißt (das hat in `broom.js`
   `endRace()` schon einmal zugeschlagen — `const t = race.t`).
4. **Nach jeder Etappe:** `node --check` auf alle geänderten Dateien,
   `npm test`, Browser-Stichprobe, dann committen und pushen.
5. **Bei Unklarheit fragen** statt Annahmen treffen — besonders, wenn ein
   Testfall aufdeckt, dass sich echtes Spielverhalten ändern müsste.
