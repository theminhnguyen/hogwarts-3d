# Hogwarts 3D — Arbeitsauftrag für Sonnet 5: Der Dunkle Lord

> **Status:** Entwurf, noch nicht umgesetzt.
> **Vorgänger:** `PLAN-EPISCHE-WELT.md` (E0–E12, komplett live), Save-Schema **v11**.
> **Verfasst von:** Opus 5, nach vollständiger Durchsicht des realen Codes (nicht aus Erinnerung).

---

## Auftrag und Zielbild

Nutzer-Vorgabe, wörtlich:

> „wenn man alles andere erreicht hat, kann man gegen Voldemord als aller letzter
> Endboss kämpfen, der nur besiegbar ist, wenn man alle buffs hat."

Daraus ergeben sich **zwei getrennte Anforderungen**, die im Design bewusst
unterschiedlich hart umgesetzt werden:

| Anforderung | Umsetzung | Härte |
|---|---|---|
| „wenn man alles andere erreicht hat" | **Zutritts-Gate** auf die Haupt-Progression (Hauspokal, Seelenlaterne, 3 Heiligtümer gefunden, 4 Siegel + Sternentor) | **hart** — ohne das öffnet sich das Tor nicht |
| „nur besiegbar, wenn man alle Buffs hat" | **Phasen-Design**: jede der 5 Kampfphasen ist ausschließlich mit einem bestimmten, dauerhaft freischaltbaren Buff lösbar | **weich** — Eintritt möglich, aber der Kampf ist ohne den jeweiligen Buff nachweislich nicht gewinnbar; der Lord verbannt dich dann höflich statt dich sterben zu lassen |

Der zentrale Design-Anspruch: **„Du brauchst alle Buffs" darf keine
Checklisten-Abfrage an der Tür sein.** Es soll sich aus der Mechanik ergeben —
der Spieler merkt in Phase 2 selbst, dass ohne Patronus nichts geht. Die Tür
sagt ihm nur *vorher*, was ihm fehlt, damit niemand blind in einen
unwinnbaren Kampf läuft.

---

## 1. Design-Leitplanken (zuerst lesen)

1. **Kein neues Kernsystem.** Alle fünf Phasen bauen ausschließlich auf
   Mechaniken auf, die real existieren und getestet sind (Eisblitz, Patronus,
   Umhang/`player.invisible`, `health.onLethalHit`, Elderstab-`dmgMul`). Wenn
   eine Phase ein neues System bräuchte, ist die Phase falsch entworfen.
2. **Kein Fortschrittsverlust, nie.** Verlieren gegen den Lord kostet nichts
   außer Zeit. Kein Item-Verlust, kein Reset, kein Gold-Malus. Der Kampf ist
   beliebig oft wiederholbar.
3. **Kein Sackgassen-Zustand.** Es darf keinen Spielstand geben, aus dem heraus
   der Kampf unmöglich wird. Insbesondere: der dunkle Pfad darf nicht sperren
   (Läuterung ist immer möglich), und der Kampf darf nicht an eine Tageszeit
   gebunden sein, die man verpassen kann.
4. **Der `friedlich`-Modus deckt auch den Lord ab** (Muster: `wilderer.js`,
   `dementor.js`, `hallows.js` — dort jeweils `system.peaceful`). Im
   friedlichen Modus richtet er keinen Schaden an, besiegen bleibt möglich.
5. **Alles Neue ist additiv im Save.** Kein bestehendes Feld ändert Bedeutung
   oder Typ. Alte Spielstände laden unverändert weiter.
6. **Deutsch.** Alle Texte, Kommentare, Commit-Messages.

---

## 2. Verifizierte Ausgangslage (Stand: Save v11)

Alles hier ist am realen Code nachgeprüft, nicht angenommen:

**Save-Schema (`src/save.js`)**
- `SAVE_VERSION = 11`, `SAVE_KEY = 'hogwarts3d-save-v1'` (Schlüssel bleibt!)
- `normalizeSave()` prüft **jedes Feld einzeln typisiert** — neue Felder müssen
  dort explizit ergänzt werden, sonst gehen sie beim Laden verloren.
- **Kritisch:** `heim.trank` ist **ein einziges Objekt** `{ id, restT }` —
  es kann **immer nur EIN Trank gleichzeitig aktiv sein**. Ein Phasen-Design,
  das zwei Tränke gleichzeitig verlangt, ist unmöglich. Deshalb sind alle
  Pflicht-Buffs unten **dauerhafte Freischaltungen**, keine Tränke.

**Vorhandene, mechanisch nutzbare Buffs (alle dauerhaft)**

| Buff | Save-Feld / Flag | Laufzeit-Zugriff |
|---|---|---|
| Expecto Patronum | `pz.hauspokal` → Unlock | `spells.epUnlocked` |
| Eisblitz | `frostzinnen.eisblitzLearned` | `spells.eisblitzUnlocked` |
| Elderstab (Schaden ×2, CD ×0.6) | `hallows.stab` + Podest aktiv | `hallows.elderstabActive` |
| Umhang der Unsichtbarkeit | `hallows.umhang` + Podest aktiv | `player.invisible` (Taste `U`) |
| Stein der Wiederkehr (1× Wiederbelebung/Tag) | `hallows.stein` + Podest, `hallows.steinCd` | `health.onLethalHit` |
| Meister des Todes (+1 Herz, Dementoren neutral) | alle 3 Heiligtümer **ausgerüstet** | `hallows.masterOfDeath` |
| Maximale Herzen 10 | Troll, Spinnennest, Drache, Frostriese, Seeungeheuer | `health.maxHearts` |
| Begleiter (unverwundbar, Taste `G`) | `begleiter.frei` | `companion.*` |

**Boss-Vorlage: `PaleKing` in `src/hallows.js` (Zeilen 41–254)**
Das ist die beste Blaupause im Projekt für einen Zauberer-Boss und sollte
strukturell übernommen werden:
- FSM-Zustände `sealed | rising | aggro | telegraph | cooldown | bowing | gone`
- `applyHit(spellId)` mit Whitelist gültiger Spruch-IDs + `invulnT`-Fenster
- Arena-Leine (`KING_ARENA_R`) — Position wird jeden Frame zurückgeklemmt
- `_steerXZ()` statt Pathfinding, `_fireBolt()` für Projektile
- Teleport alle N Treffer + `invulnT` danach (verhindert Stunlock)

**Region-Streaming (`src/regions.js`)**
- `register({ key, center, wakeRadius, sleepRadius, build, deps })`
- **`sleepRadius > wakeRadius` ist Pflicht** — `register()` *wirft* sonst.
- `build()` läuft **lazy beim ersten Wecken**, nicht beim Spielstart.
- Distanz wird **jeden Frame frisch** geprüft (Stolperfalle #15) — auch ein
  Spieler, der per Besen mitten hineinfliegt, weckt die Region zuverlässig.
- Vorlage für die Registrierung: `main.js` Build-Step `'Aschenklamm (Region)'`.

**HUD**
- `hud.setBoss(frac)` zeigt die Bossbar, `hud.setBoss(null)` blendet sie aus.
- `hud.showToast(text, sekunden, prio)` — Priorität 0 = Tutorial-Ebene.
- `hud.showDialog(name, zeilen[, onClose])`.

**Tests**
`npm test` → `node --test`, aktuell **31 Tests** in `tests/save.test.mjs`,
`tests/progress.test.mjs`, `tests/health.test.mjs`. Nur importfreie/Three.js-freie
Module sind hier testbar (`save.js`, `progress.js`, `health.js`).

---

## 3. Geographie: wo der Kampf stattfindet

**Empfehlung: neue Region „Die Schattenfeste" im Nordosten, Zentrum `(250, -350)`.**

Begründung und Nachrechnung (bitte in V1 gegenprüfen, nicht blind übernehmen):

| Nachbar | Zentrum | Einfluss (r+blend) | Distanz zu (250,−350) | Frei? |
|---|---|---|---|---|
| Nebelmoor | (240, −175) | 80 | **175,3** | ✓ (80+67 = 147) |
| Frostzinnen | (0, −410) | 67 | **257,0** | ✓ |
| Steinkreis | (150, −95) | 24 | **273,9** | ✓ |
| Hügelgrab | (350, −10) | 12 | **354,4** | ✓ |
| Schloss-Plateau | (0, −20) | 130 | **413,8** | ✓ |
| Aschenklamm | (395, 110) | 67 | **482,3** | ✓ |

- Abstand vom Ursprung: `hypot(250, 350) = 430,1` — liegt im Zielband 390–430
  der bestehenden vier Regionen.
- Bergring beginnt bei 520: `430 + 67 = 497 < 520` ✓ (23 m Puffer)
- Der Nordosten ist der einzige größere freie Sektor: Ost = Aschenklamm,
  Nord = Frostzinnen, Süd = Silberhain, West = Schwarzwasser.

**Warum eine eigene Region und nicht das Schloss?**
Das Region-Muster (E4–E7) ist viermal erprobt, lazy-gebaut und kostet im
Normalbetrieb null Performance. Ein Kampf im Schlossbereich müsste dauerhaft
mitlaufen und würde mit Kollisionsgeometrie, NPCs und dem Sternentor
kollidieren — deutlich höheres Regressionsrisiko bei gleichem Spielgefühl.

**Warum Nordost und nicht „hinter dem Sternentor"?**
Ein Teleport-Portal wäre elegant, umgeht aber `regions.js` komplett und schafft
einen Zustand, in dem der Spieler an einem Ort ist, den die Karte des
Rumtreibers nicht kennt. Die Schattenfeste als **fünfte Fern-Silhouette** am
Horizont (Muster E11) ist die bessere Lösung: der Spieler *sieht* den dunklen
Turm ab der ersten Stunde und weiß, dass dort etwas wartet — klassisches
Foreshadowing statt Überraschungs-Portal.

---

## 4. Der Kampf: fünf Phasen, fünf Pflicht-Buffs

Jede Phase ist **exakt durch einen dauerhaften Buff lösbar** und ohne ihn
nachweislich nicht. Das ist der Kern des Auftrags.

### Phase 1 — „Der Schild aus schwarzem Feuer" → **Eisblitz**
Voldemort steht regungslos in einem Schild. Stupor/Incendio/Avada **verpuffen
sichtbar** (`audio.spellFizzle()`, grauer Funkenburst — Muster: NPC-Schutzliste
in `npc.js`). Nur **Eisblitz** reißt Risse hinein; 3 Treffer zersplittern ihn.

- *Ohne Eisblitz:* Der Schild bleibt. Nach 45 s Toast: „Eis frisst dieses Feuer
  — anderswo hast du das gelernt, oder eben nicht."
- *Warum fair:* Eisblitz kommt aus dem Eisaltar-Rätsel der Frostzinnen, das
  ohnehin für Siegel #2 nötig ist.

### Phase 2 — „Die Woge" → **Expecto Patronum**
Er beschwört 5 Dementoren (`dementors.summonToMal()` existiert bereits) und wird
währenddessen unverwundbar. Dementoren sind laut `dementor.js` bereits gegen
Stupor/Incendio immun — **nur Patronum vertreibt sie**. Erst wenn alle 5 weg
sind, wird der Lord wieder angreifbar.

- *Ohne Patronum:* Frost-Vignette steigt bis zum Tod. Fluchtweg bleibt offen.
- *Meister-des-Todes-Sonderfall beachten:* `dementors.masterOfDeath` lässt
  Dementoren sich normalerweise verbeugen statt anzugreifen. **Diese
  beschworenen müssen davon ausgenommen sein** — sonst entwertet der eigene
  Buff die Phase. Dafür ein Flag `summonedByLord = true` an den beschworenen
  Instanzen, das die Verbeugungs-Logik überspringt.

### Phase 3 — „Der Blick, dem nichts entgeht" → **Umhang der Unsichtbarkeit**
Der Lord dreht sich permanent zum Spieler und reflektiert jeden Spruch, der ihn
von vorn trifft, **zurück** (halber Schaden auf den Spieler). Nur wer
**unsichtbar** ist (`player.invisible`, Taste `U`), wird nicht mehr verfolgt —
dann lässt sich von hinten treffen (Winkel > 100° zur Blickrichtung).

- *Ohne Umhang:* jeder Treffer schadet nur dir selbst. Sehr schnell lesbar.
- Nutzt `player.invisible` exakt so, wie `wilderer.js`/`creatures.js` es
  bereits auswerten.

### Phase 4 — „Avada Kedavra" → **Stein der Wiederkehr**
Ein langer, unmissverständlicher Telegraph (2,5 s, grüner Lichtkegel, eigener
Sound), dann ein **nicht ausweichbarer** Fluch: `health.damage()` mit genug
Schaden, um auf 0 zu gehen. `health.onLethalHit` ist bereits der Haken, an dem
`hallows.js` die Wiederbelebung hängt (`return true` = übernommen).

- *Mit Stein (ausgerüstet, `steinCd === 0`):* du stehst wieder auf, der Lord ist
  fassungslos — dramatischster Moment des Spiels, ohne eine Zeile neuer
  Mechanik.
- *Ohne Stein:* normaler Tod → Respawn am Schloss, Kampf zurückgesetzt.
- **Wichtig:** `hallows.steinCd` ist „1× pro Spieltag". Der Kampf muss das
  respektieren und **vor** Phase 4 warnen, wenn der Stein heute schon
  verbraucht ist („Der Stein ist noch kalt — warte bis zum Morgengrauen.").

### Phase 5 — „Das Duell der Stäbe" → **Elderstab**
Letzte HP-Leiste, aber er **regeneriert 0,9 HP/s**. Ohne Elderstab liegt der
erreichbare Schaden pro Sekunde (Stupor-Cooldown ×1,0, Schaden ×1,0) rechnerisch
**unter** der Regeneration — die Bossbar kriecht sichtbar zurück nach oben. Mit
Elderstab (Schaden ×2, Cooldown ×0,6 → effektiv ×3,33 DPS) liegt er klar
darüber.

- **Balancing in V8 rechnerisch belegen**, nicht schätzen: Zielwerte im
  Abschnitt 8.
- *Warum das schön ist:* Es gibt keine Fehlermeldung. Der Spieler **sieht** an
  der Leiste, dass sein Stab nicht reicht. Das ist die eleganteste Form von
  „du brauchst den Buff".

### Nach Phase 5 — Der Abschluss
Kein Tod, sondern **Auflösung**: der Lord zerfällt zu Asche, der Himmel über der
Schattenfeste klart auf (`atmosphere`-Zone wird auf neutral gefahren), großes
Feuerwerk, Titel **„Der wahre Meister des Todes"**, +200 Gold, +40 Ruf.

### Wenn Buffs fehlen: die Verbannung
Wenn eine Phase 90 s lang keinen Fortschritt zeigt, **verbannt** der Lord den
Spieler statt ihn zu töten: Bildschirm-Weißblende, Teleport zum Schloss,
Dialog mit *konkretem* Hinweis, welcher Buff fehlt. Kein Verlust, keine
Frustration, klare Lernerfahrung.

---

## 5. Der Prüfstein am Tor (Zutritts-Gate + Checkliste)

Vor der Schattenfeste steht ein **Prüfstein**. Er hat zwei Funktionen:

**a) Hartes Gate (Progression).** Das Tor öffnet nur bei *allen*:
- `pz.hauspokal === 1` (Hauspokal)
- `moor.laterne === 1` (Seelenlaterne)
- `hallows.stab && hallows.umhang && hallows.stein` (alle 3 **gefunden**)
- `siegel.finaleWon === 1` (Sternentor durchschritten — impliziert alle 4 Siegel)

**b) Weiche Checkliste (Buffs).** Bei `E` am Prüfstein listet er **live** auf,
was für den Kampf fehlt — als lesbare Liste mit ✓/✗:

```
Der Stein prüft dich:
  ✓ Eisblitz         — der Schild fürchtet ihn
  ✓ Expecto Patronum — gegen das, was er ruft
  ✗ Umhang angelegt  — sein Blick durchbohrt dich sonst
  ✓ Stein angelegt   — er schlägt einmal tödlich zu
  ✗ Elderstab angelegt — sonst heilt er schneller als du schlägst
  ✓ 10 von 10 Herzen
```

Entscheidend: **die drei Heiligtümer müssen ausgerüstet sein, nicht nur
besessen.** `hallows.masterOfDeath` prüft genau das. Der Prüfstein soll bei
„besitze ich, aber Podest leer" explizit sagen: „Du besitzt ihn — aber er liegt
auf dem Podest in deiner Kate."

Eintritt ist trotz ✗ erlaubt (Leitplanke 3: keine Sackgasse, und manche wollen
es trotzdem versuchen).

---

## 6. Meilensteine

### V1 — Fundament: Koordinaten, Terrain, Save v12
- Koordinaten `(250, -350)` **selbst nachrechnen** gegen die realen Konstanten
  in `terrain.js` (Tabelle Abschnitt 3 als Startpunkt, nicht als Beweis).
- `terrain.js`: `export const SCHATTENFESTE = { x: 250, z: -350, r: 45, blend: 22, h: 8 }`
  — leichte Erhebung, damit der Turm trägt.
- `props.js`: Vegetations-Ausschluss für die Zone (Muster: die vier E4–E7-Zonen).
- `save.js`: `SAVE_VERSION = 12`, neues Feld:
  ```js
  lord: { torOffen: 0, phaseMax: 0, besiegt: 0, versuche: 0 },
  ```
  plus `normalizeSave()`-Zweig mit **einzelner Typprüfung je Unterfeld**.
- `tests/save.test.mjs`: neuer Test „normalizeSave ergänzt `lord` bei einem
  alten Save ohne dieses Feld (v12)" — exakt im Stil der v7–v11-Tests.
- **Abnahme:** `npm test` grün (32+), alter v11-Save lädt unverändert.

### V2 — `src/schattenfeste.js`: Region, Turm, Arena, Prüfstein
- Region-Registrierung in `main.js` (Muster: `'Aschenklamm (Region)'`),
  `wakeRadius: 90`, `sleepRadius: 130`.
- `atmosphere.registerZone({ ... color: 0x2a0d3a, fogFarMul: 0.62, ambientMul: 0.75, soundId: 'schattenfeste' })`
  — düsterster Ort im Spiel.
- Geometrie: ein zerfallener schwarzer Turm (`GeoBatch`, gemergt), ein Ring aus
  gebrochenen Säulen als Arena (Radius **16 m**), verkohlter Boden.
- Prüfstein am Zugang mit `interact.register()` + Checklisten-Dialog (Abschnitt 5).
- Arena-Zugang per `addBoxBlocker()`, der bei erfülltem Gate `disabled = true`
  gesetzt wird. **Achtung Stolperfalle:** genau hier gab es beim Aschenklamm-Tor
  schon einmal eine unsichtbare Wand (Commit „Bugfix: unsichtbare Wand am
  Aschenklamm-Tor") — Blocker beim Öffnen **wirklich** deaktivieren und im
  Browser durchlaufen.
- **Noch kein Boss.** Abnahme: Region weckt/schläft korrekt, Prüfstein listet
  richtig, Tor öffnet nur bei erfülltem Gate, 60 fps.

### V3 — `src/voldemort.js`: Boss-Gerüst + Phase 1 & 2
- Klasse `DunklerLord` nach dem `PaleKing`-Muster (Abschnitt 2): FSM,
  `applyHit()`, Arena-Leine, `_steerXZ()`, `_fireBolt()`.
- Modell: `buildFigure()` aus `npc.js` als Basis (`hooded: true`, sehr dunkle
  Robe), skaliert 1,25×, schwebend, rote Augen-Sprites (Muster: `PaleKing`).
- Phase 1 (Schild/Eisblitz) und Phase 2 (Dementoren/Patronus) vollständig.
- `hud.setBoss()` an die Gesamt-HP koppeln.
- **`.awake`-Guard nicht vergessen** — siehe Stolperfalle 4 unten.
- Abnahme: Phase 1→2 im Browser durchspielbar, beide ohne den jeweiligen Buff
  nachweislich blockiert.

### V4 — Phasen 3, 4, 5
- Phase 3: Blickrichtungs-Reflexion + `player.invisible`-Ausnahme.
- Phase 4: Avada-Telegraph + `health.onLethalHit`-Zusammenspiel; `steinCd`-Warnung.
- Phase 5: HP-Regeneration + Elderstab-Rechnung.
- Verbannungs-Logik (90 s ohne Fortschritt) inkl. Teleport + Hinweis-Dialog.
- Abnahme: alle 5 Phasen mit vollem Buff-Satz durchspielbar; jede Phase einzeln
  ohne ihren Buff als blockiert verifiziert.

### V5 — Audio, FX, Vignette
- `audio.js`: `lordLaugh()`, `lordShieldCrack()`, `lordAvadaCharge()`,
  `lordDefeat()` — alles prozedural über WebAudio wie der Rest.
- `index.html`/`hud.js`: `--lord`-Vignette (tiefviolett, pulsiert im Takt der
  Phase). Muster: bestehende `--frost`/`--cold`/`--moor`-Vignetten.
- Abnahme: keine Konsolen-Fehler, Vignette blendet sauber ein/aus.

### V6 — Verdrahtung, Fortschritt, Titel, Karte
- `main.js`: Build-Step, `frame()`-Update, `persist()`, `performReset()`
  (**`save.lord` mit zurücksetzen!**), `__game.lord`-Debug-Handle.
- `progress.js`: neues Kapitel **„Der Dunkle Lord"** — greift erst, wenn das
  Gate erfüllt und `lord.besiegt !== 1` ist. Höchste Priorität, noch vor den
  Heiligtümern. `tests/progress.test.mjs` entsprechend erweitern.
- `marauders-map.js`: Landmarke „Die Schattenfeste" + **13. Titel** „Der wahre
  Meister des Todes" (`earned: (s) => s.lord.besiegt === 1`).
- Abnahme: `npm test` grün, Karte zeigt Landmarke + Titel korrekt.

### V7 — Foreshadowing (das, was den Strang trägt)
- `textures.js`/`ambient.js`: **fünfte Fern-Silhouette** — ein schwarzer,
  gezackter Turm im Nordosten (Muster: die vier E11-Silhouetten).
- `npc.js`: 2–3 neue Gerüchte im `GERUECHTE`-Pool, gestaffelt:
  - immer aktiv: „Im Nordosten steht ein Turm, den keiner gebaut hat."
  - ab Sternentor: „Seit das Sternentor offen ist, brennt im Nordosten ein
    grünes Licht."
- `npc.js`: Schlossgeist-Zweig mit **höchster** Priorität, sobald das Gate
  erfüllt ist — er warnt namentlich und nennt die fehlenden Buffs.
- Abnahme: Silhouette sichtbar, Gerüchte erscheinen zum richtigen Zeitpunkt.

### V8 — Balancing, Tests, Doku, Deploy
- Balancing-Pass gegen die Zielwerte in Abschnitt 8 — **nachgerechnet, nicht
  geschätzt** (den DPS-Vergleich Elderstab/Regeneration schriftlich belegen).
- Performance an 3 neuen Spots (Turm außen, Arena, Turmspitze im Flug): ≥ 55 fps.
- `README.md`, `TESTPLAN-1.0.md` erweitern; Titel-Zählung „12" → „13" korrigieren
  (steht aktuell in `README.md` Abschnitt „Orientierung").
- Voller Durchlauf-Test: alter v11-Save → laden → Gate prüfen → Kampf gewinnen.
- Commit, Push, Deploy-Verifikation, Memory-Update.

---

## 7. Save-Schema v12 (additiv)

```js
// PLAN-DER-DUNKLE-LORD.md (v12): der letzte Endboss in der Schattenfeste.
// torOffen wird EINMAL gesetzt, sobald das Progressions-Gate erfüllt war —
// bewusst persistent statt jedes Mal neu berechnet, damit ein späterer
// Balancing-Eingriff am Gate niemandem sein bereits geöffnetes Tor wegnimmt.
// phaseMax merkt die höchste je erreichte Phase (nur für den Prüfstein-Text
// "du kamst schon bis Phase 3" — keine Spielmechanik, kein Fortschritt im
// Kampf selbst: jeder Versuch startet bei Phase 1).
// versuche ist reine Statistik für den Abschluss-Dialog.
lord: { torOffen: 0, phaseMax: 0, besiegt: 0, versuche: 0 },
```

`normalizeSave()`-Ergänzung im Stil der bestehenden Zweige:

```js
lord: {
  torOffen: num(obj(raw.lord).torOffen, 0),
  phaseMax: num(obj(raw.lord).phaseMax, 0),
  besiegt: num(obj(raw.lord).besiegt, 0),
  versuche: num(obj(raw.lord).versuche, 0),
},
```

---

## 8. Balancing-Zielwerte

Diese Zahlen sind **Vorschläge zum Nachrechnen**, keine Vorgaben:

| Größe | Vorschlag | Begründung |
|---|---|---|
| Arena-Radius | 16 m | zwischen Hügelgrab (14) und Aschenklamm-Bossraum |
| Phase 1: Eisblitz-Treffer | 3 | kurz, dient dem Lerneffekt |
| Phase 2: Dementoren | 5 | genau ein Patronus-Zyklus pro 1–2 Dementoren |
| Phase 3: Rückwurf-Schaden | 0,5 Herz | spürbar, nicht tödlich |
| Phase 4: Telegraph | 2,5 s | deutlich länger als jeder andere Boss (1,1–1,3 s) |
| Phase 5: HP | 60 | — |
| Phase 5: Regeneration | **1,5 HP/s** | **Kernwert**, siehe Rechnung unten |
| Verbannung nach | 90 s ohne Phasenfortschritt | großzügig |
| Belohnung | +200 Gold, +40 Ruf, Titel | größter Einzelbetrag im Spiel |

### Die DPS-Rechnung — der wichtigste Wert des Plans

Verifizierte Basiswerte aus `spells.js` `TUNING`:
`stupor: { dmg: 1, cooldown: 0.45 }` · Elderstab: `dmgMul ×2`, `cooldownMul ×0.6`

| | Schaden | Cooldown | Theoretisches Maximum |
|---|---|---|---|
| ohne Elderstab | 1 | 0,45 s | **2,22 HP/s** |
| mit Elderstab | 2 | 0,27 s | **7,41 HP/s** |

Das Verhältnis ist **fix 3,33×**, unabhängig von der Trefferquote. Die
Regeneration muss also so liegen, dass sie bei realistischer Trefferquote
*über* dem Wert ohne Stab und *unter* dem mit Stab liegt.

Bei einer geschätzten Trefferquote von **~70 %** gegen einen teleportierenden
Boss: ohne Stab ≈ **1,55 HP/s**, mit Stab ≈ **5,19 HP/s**.
Mit Regeneration **1,5 HP/s**:
- ohne Elderstab: Netto ≈ **+0,05 HP/s** → die Leiste steht praktisch still,
  der Spieler *sieht* sofort, dass etwas fehlt (genau der gewünschte Effekt)
- mit Elderstab: Netto ≈ **3,69 HP/s** → Phase 5 dauert ~16 s ✓

**In V8 zwingend am realen Verhalten gegenprüfen** (die 70 % sind eine
Schätzung, kein Messwert) und die tatsächliche Rechnung im Commit
dokumentieren. Falls die reale Trefferquote deutlich höher liegt, muss die
Regeneration mitwandern — der Zielkorridor ist:
`DPS_ohne < Regeneration < DPS_mit`.

---

## 9. Stolperfallen (aus echten Bugs dieser Codebasis)

1. **`upgradeMaxHearts()` immer RELATIV aufrufen** (`health.maxHearts + 1`), nie
   absolut. Absolute Zielwerte verpuffen still am `n <= maxHearts`-Guard, sobald
   der Spieler die Regionen in anderer Reihenfolge gespielt hat. Das war ein
   echter Bug (Commit `fc1688b`) — falls der Lord ein Herz-Upgrade gibt, gilt es
   auch hier.
2. **`normalizeSave()` verliert alles, was nicht explizit gelistet ist.** Neues
   Save-Feld ⇒ Zweig ergänzen ⇒ Test dazu. Sonst ist der Fortschritt nach einem
   Reload weg.
3. **`performReset()` muss `save.lord` mit zurücksetzen.** Modul-Level-Zustand,
   der den Reset überlebt, war schon zweimal ein Bug (zuletzt `SPELL_ORDER`,
   Commit `fc1688b`).
4. **Bossbar nur bei wacher Region.** `regions.js` ruft `handle.update()` bei
   schlafenden Regionen nicht auf — der FSM friert im letzten Zustand ein. Ein
   `main.js`-Lesezugriff auf `region.handle.lord.state` **ohne**
   `region.awake`-Prüfung lässt die Bossbar quer über die halbe Karte stehen.
   Exakt dieser Bug existierte für Drache und Frostriese (Commit `fc1688b`).
   ```js
   const lord = schattenfesteRegion.awake ? schattenfesteRegion.handle?.lord : null;
   ```
5. **`sleepRadius > wakeRadius`**, sonst wirft `regions.register()` beim Start.
6. **Blocker beim Toröffnen wirklich deaktivieren** (`blocker.disabled = true`)
   und im Browser hindurchlaufen — siehe „unsichtbare Wand am Aschenklamm-Tor".
7. **`fx.firework()`/`fx.burst()` erwarten `THREE.Vector3`**, kein `{x,y,z}` —
   sie rufen intern `pos.clone()` auf und werfen sonst (dokumentiert in
   `finale.js`).
8. **Ziel-Trefferhöhe:** Bolzen fliegen auf Augenhöhe (`player.pos.y + ~1,7`).
   Ein Ziel auf `y + 0` wird **nie** getroffen (`FIGURE_HIT_Y = 1.3` in `npc.js`).
9. **`peaceful` durchreichen** (Leitplanke 4) — sonst schadet der Lord auch im
   friedlichen Modus.
10. **Testumgebungs-Eigenheit:** Direkte Property-Mutationen per
    `javascript_tool` (z. B. `player.pos.set(...)`) werden vom nächsten echten
    Animationsframe manchmal nicht übernommen. Beim Verifizieren die passende
    `update()`-Methode einmal manuell aufrufen, dann stimmt der Zustand sofort.

---

## 10. Offene Entscheidungen (vor V3 klären, falls gewünscht)

1. **Dunkler Pfad — eigenes Ende?** Naheliegend: Wer auf dem dunklen Pfad steht,
   bekommt von Voldemort ein Angebot statt eines Kampfes („Tritt an meine
   Seite"). Annehmen = alternatives Ende + eigener Titel; Ablehnen = normaler
   Kampf, aber er ist wütender (Phase 5 mit mehr HP). **Reizvoll, aber
   Zusatzaufwand** — bewusst als optional markiert, nicht in V1–V8 eingeplant.
2. **Herz-Upgrade als Belohnung?** Würde `maxHearts` auf 11 heben. Da danach
   inhaltlich nichts mehr kommt, eher Titel + Gold/Ruf als Belohnung. Vorschlag:
   **kein** Herz-Upgrade.
3. **Wiederholbarkeit nach dem Sieg?** Vorschlag: ja, der Kampf bleibt
   wiederholbar (`besiegt` bleibt 1, Belohnung gibt es nur einmal) — kostet
   nichts und erlaubt es, den Kampf noch einmal zu erleben.

---

## 11. Abschlussbericht (am Ende von V8 liefern)

Wie schon bei `ABSCHLUSSBERICHT.md`:
- Tabelle V1–V8 mit Commit-Hashes
- Neue/geänderte Dateien mit Begründung
- **Die belegte DPS-Rechnung** für Phase 5
- Testergebnisse: `npm test` + Browser-Durchlauf je Phase mit und ohne den
  jeweiligen Pflicht-Buff
- Performance-Tabelle der 3 neuen Spots
- Ehrliche Restpunkte
