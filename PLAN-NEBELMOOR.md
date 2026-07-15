# 🌫️ Nebelmoor-Update: Dementoren, Expecto Patronum & die Seelenlichter

> **Implementierungsplan** für Hogwarts 3D — geschrieben von Fable, umzusetzen mit Sonnet.
> Stand: 2026-07-14. Basis: `main` **inklusive** des Fable-Audit-Commits
> „Treffer-Anker" (hitY-Fix in creatures.js/spells.js — Dementoren brauchen
> von Anfang an einen korrekten `hitY`, siehe Abschnitt 12.8).
>
> **Lies dieses Dokument komplett, bevor du die erste Zeile schreibst.**
> Abschnitt 0 (Arbeitsumgebung) und Abschnitt 12 (Stolperfallen) sind mit den
> Lehren aus ALLEN sieben Magie-Phasen + Bonus aktualisiert — sie ersparen
> dir dieselben Fehler ein zweites Mal.
>
> **KORREKTUR nach N1 (2026-07-14):** Die in diesem Dokument ursprünglich
> geplante Moor-Position (215,-150) kollidierte mit dem Terrain-Hügel-
> Shaping des Steinkreises (STONES-Radius reicht bis 62.4m, Zentren waren
> nur 85m auseinander — exakt die Falle aus Abschnitt 0.3/12.3). Das
> tatsächlich gebaute Zentrum ist **`MOOR = { x: 240, z: -175, r: 55,
> blend: 25, h: 1.6 }`** (`terrain.js`). ALLE Koordinaten weiter unten in
> diesem Dokument (Dementor-Spawns, Seelenlichter, Warnschild-Position),
> die relativ zu (215,-150) beschrieben waren, sind in den jeweiligen
> Abschnitten bereits auf das neue Zentrum umgerechnet — nicht die alten
> Rohwerte verwenden, falls du eine ältere Version dieses Plans im Kopf hast.

---

## Vision in einem Satz

Nordöstlich des Steinkreises, wo die Wege enden, liegt ein totes Moor unter
ewigem Nebel: Dort schweben Dementoren, denen Stupor und Incendio nichts
anhaben können — nur wer den Hauspokal gewonnen hat, beherrscht **Expecto
Patronum** und kann den silbernen Hirsch durch ihre Reihen schicken, fünf
verlorene Seelenlichter bergen und in der Krypta die **Silberne Seelenlaterne**
erringen, die das Moor für immer erhellt.

**Spielgefühl-Ziele:**
- Das Moor ist der erste Ort, an dem sich der Spieler wirklich **unterlegen**
  fühlt: Zauber verpuffen, der Bildschirm friert zu, die Herzen schwinden —
  Umkehren ist eine legitime Entscheidung.
- Expecto Patronum ist die **Belohnung für den Hauspokal**: Der Hirsch aus dem
  Finale wird vom Deko-Moment zum mächtigsten Werkzeug des Spiels.
- Die Seelenlichter erzeugen eine **Risiko-Spirale**: Jedes getragene Licht
  macht die Dementoren aggressiver — wer gierig alle fünf auf einmal trägt,
  spielt mit dem Feuer.
- Die Laterne ist eine **permanente Weltveränderung**: Das Moor wird heller,
  die Dementoren zahmer — sichtbarer Fortschritt statt abstrakter Zähler.

---

## 0) Arbeitsumgebung & Erste Schritte (WICHTIG — zuerst tun!)

Das Projekt liegt kanonisch in `~/Downloads/outputs/hogwarts-3d/`.
GitHub: `theminhnguyen/hogwarts-3d`, live auf https://theminhnguyen.github.io/hogwarts-3d/.

1. **Preview-Setup.** Der Preview-Launcher liest NICHT aus ~/Downloads:
   - Spiegel ins eigene Session-Scratchpad:
     `rsync -a --delete --exclude .git ~/Downloads/outputs/hogwarts-3d/ "$SCRATCHPAD/hogwarts-3d/"`
   - `~/Downloads/outputs/.claude/launch.json`: den `hogwarts`-Eintrag auf den
     NEUEN Scratchpad-Pfad umbiegen (Pfad ändert sich pro Session!).
   - **Nach jedem Edit in Downloads: rsync erneut**, dann Preview-Tab neu laden.
2. **Testen:** `window.__game` (start, teleport, step(n), castAt(yaw,pitch),
   gott()). **rAF friert in inaktiven Tabs ein** → NIEMALS auf echte Zeit
   warten, IMMER `__game.step(n)` simulieren.
3. **Koordinaten-Verifikation VOR dem Bauen:** Alle Koordinaten in diesem Plan
   sind gegen `terrain.js` gerechnet, aber NICHT gegen jedes Deko-Objekt.
   Bevor du die Moor-Zone baust: einen Explore-Agent über `castle.js`,
   `structures.js`, `props.js`, `creatures.js`, `collectibles.js` schicken
   und prüfen, was im Rechteck x∈[160,275], z∈[-210,-95] existiert
   (bekannt: Steinkreis-Hügel bei (150,-95) mit Geist-Spawn — Abstand zum
   Moor-Zentrum ~85m, sollte nicht kollidieren). In Phase 5 des Magie-Updates
   mussten ZWEI Rätsel-Standorte verschoben werden, weil der Plan gegen die
   echte Geometrie nicht geprüft war.
4. **Committen:** direkt auf `main`, deutsche Commit-Messages, `git push`,
   danach `gh api repos/theminhnguyen/hogwarts-3d/pages/builds/latest` bis
   `status: "built"`. Nach jeder Phase Memory (`hogwarts-3d-project`) updaten.

---

## 1) Neue Dateien & Architektur-Überblick

```
src/
├── moor.js       NEU  – Zone: Terrain-Deko, tote Bäume, Gräber, Nebel, Krypta, Schild
├── dementor.js   NEU  – Dementor-Klasse + Frost-Logik (eigene Datei, creatures.js
│                        ist mit ~950 Zeilen voll — NICHT weiter aufblähen)
├── patronus.js   NEU  – buildPatronusModel(glowTex) als geteilter Helfer:
│                        puzzles.js (Finale-Ambient) UND spells.js (Charge)
│                        nutzen dasselbe Modell — aus puzzles.js EXTRAHIEREN
└── (bestehend)   terrain.js, props.js, spells.js, wand.js, hud.js, audio.js,
                  main.js, health.js … werden erweitert
```

**Datenfluss pro Frame** (Erweiterung von `frame(dt)` — Reihenfolge wichtig):
```
player.update(dt)
wand.update(…)                        // unverändert
spells.update(…)                      // + Patronus-Charge-Update
creatures.update(…)                   // unverändert
dementors.update(dt, player, spells)  // NACH spells (liest Charge-Position)
moor.update(dt, player, skyState)     // Nebel-Drift, Ambient-Gain, Zähler-HUD
puzzles.update(…)                     // unverändert
…
```

**Grundsätze** (unverändert gültig):
- Kein einziges externes Asset — alles Primitiven + tint() + Canvas.
- Alles Bewegliche gepoolt; Geometrien/Materialien einmal pro Gattung
  (Ausnahme: pro Objekt animierte opacity → `material.clone()`).
- Punktlicht-Budget: max. 3 Zauber-Lichter + 1 Stabspitze bleibt hart.
  Das Moor bekommt KEINE eigenen Punktlichter (Nebel + Sprites reichen);
  einzig die Krypta-Fackel nach der Öffnung (1 Licht, wie Grotte).

---

## 2) Die Zone: Das Nebelmoor (`terrain.js` + `props.js` + `src/moor.js`)

### 2.1 Terrain (terrain.js)

```js
export const MOOR = { x: 240, z: -175, r: 55, blend: 25, h: 1.6 };
```
- In `terrainHeight()` NACH der See-Senke einfügen: Senke auf `h = 1.6`
  (über WATER_LEVEL 0.4 — matschig, aber begehbar, kein Schwimmen):
  ```js
  {
    const d = Math.sqrt((x - MOOR.x) ** 2 + (z - MOOR.z) ** 2);
    const m = 1 - smoothstep(MOOR.r, MOOR.r + MOOR.blend, d);
    h = lerp(h, MOOR.h + fbm(x * 0.08, z * 0.08, 2) * 0.5, m); // leicht buckelig
  }
  ```
- **[UMGESETZT, korrigiert]** Ursprünglich war (215,-150) geplant — das lag
  nur 85m vom Steinkreis-Zentrum entfernt, dessen Terrain-Hügel-Shaping
  aber bis r×2.6=62.4m reicht (STONES aus terrain.js). Mit (240,-175) liegt
  der nächste Moor-Rand (117.8−55=62.8) knapp hinter dem Ende des
  Steinkreis-Einflusses — keine Überlappung mehr. Zentrum d0≈297 vom
  Weltursprung, äußerster Kernrand ≈352 — knapp jenseits des Bergring-
  Starts (330), aber nur als minimaler Zipfel am äußersten Punkt (m≈0.07),
  liest sich wie ein natürlicher Übergang zum Gebirge.
- **Neuer Weg** in `PATHS`: `[[140, -98], [190, -140], [240, -175]]`
  (zweigt am Steinkreis-Rundwegende ab, endet an der Krypta).

### 2.2 Vegetations-Ausschluss (props.js)

In `spotFree()` UND im Gras-Loop UND im Felsen-Loop ergänzen:
```js
if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) return false; // bzw. continue
```
Sonst stehen fröhliche grüne Bäume im Todesmoor. Glühwürmchen (fireflies)
dürfen bleiben — nachts im Moor wirken sie sogar wie Irrlichter.

### 2.3 Moor-Deko (src/moor.js, ~40 tote Bäume + 14 Gräber + Nebel)

- **Tote Bäume** (instanziert, wie buildChunkedInstances-Muster): kahler
  Stamm `CylinderGeometry(0.12, 0.3, 4.5, 6)` + 3–4 kahle Äste
  (dünne, gekippte Zylinder), Farbe `0x3a3630`, jitter(0.15) für Knorrigkeit.
  Eigene kleine Instanz-Gruppe (ein Mesh reicht bei 40 Stück auch gemergt),
  Kreis-Blocker r 0.4 je Baum.
- **Gräber:** 14 windschiefe Steinplatten `BoxGeometry(0.7, 1.1, 0.15)`,
  rotZ ±0.25 zufällig, Farbe `0x6e6a60`, halb eingesunken (y −0.2).
  Gemergt über GeoBatch → `mats.stone`. Je Kreis-Blocker r 0.4.
- **Bodennebel:** 12 große Sprites (makeCloudTexture wiederverwenden!),
  Farbe `0x9aa4b0`, opacity 0.22, Scale 40–70×12, y = Boden+2, driften
  langsam im Kreis (wie Wolken, aber cx/cz = MOOR-Zentrum, r 15–45).
  → `moor.update()` bewegt sie. Bei Laterne (Abschnitt 5): opacity ×0.6.
- **Warnschild** am Moor-Eingang `(195, -143)` (Zwei-Pfosten-Muster aus
  puzzles.js kopieren, am Wegknick knapp vorm Moor-Kernrand). Proximity-
  Toast (einmalig):
  „*Hier endet der Schutz des Schlosses. Was hier friert, friert von innen.*"
- **Die Krypta** im Zentrum `(240, -175)`: statt eines blickdichten
  Vollquaders eine NISCHE (Rückwand + 2 Seitenwände, Eingang nach Westen —
  das bewährte Grotten-Muster aus puzzles.js R1, nur größer, ~5.6m breit,
  3.4m hoch), davor zwei schiefe Säulen. Verschlossen durch eine Torplatte
  (dasselbe Schiebeplatten-Muster: Mesh + addBoxBlocker,
  Blocker-Referenz behalten, `disabled` beim Öffnen). Innen: Truhe
  (Truhen-Muster aus puzzles.js `_makeChestLid` — als Vorlage kopieren oder
  besser: die Truhen-Logik aus puzzles.js in einen kleinen geteilten Helfer
  ziehen, wenn es sauber geht) + 1 Fackel-Licht (erst nach Öffnung an).
- **Dauer-Dämmerung:** Das Moor manipuliert NICHT sky.js (zu invasiv).
  Stattdessen: `moor.insideFactor(playerPos)` (0..1 smoothstep über den
  Rand) → main.js blendet damit eine leichte Abdunklung + Entsättigung über
  die bestehende Vignette (`--moor` CSS-Var, analog `--cold`) und moor.js
  dimmt die Nebel-Sprites tagsüber NICHT (immer trüb).

---

## 3) Dementoren (`src/dementor.js`)

### 3.1 Look (~110 Dreiecke, deutlich größer & kaputter als Schattengeister)

- Umhang: `ConeGeometry(0.65, 2.6, 9, 4, true)` + jitter(0.2), unten
  **zerfetzt**: 5–6 hängende Stoffstreifen (schmale, lange Boxen/Planes,
  DoubleSide, an der Saumkante, leicht pendelnd via rotation.x = sin).
  Material `MeshLambertMaterial({ color: 0x0d0f16, transparent, opacity 0.92,
  flatShading, DoubleSide })` — **pro Dementor clonen** (Fade-Animationen!).
- Kapuze: tiefe Kugel, KEINE Augen (Dementoren sind blind — der Unterschied
  zu den Schattengeistern mit ihren Glüh-Augen ist Absicht und liest sich
  sofort). Stattdessen: schwarzes „Nichts" unter der Kapuze (kleine Kugel
  `MeshBasicMaterial 0x000000` — Schwarz ohne Licht wirkt wie ein Loch).
- Zwei Skeletthände: je 1 gestreckte, gebogene Mini-Box-Kette (3 Glieder),
  Farbe `0x8a8578`, vor dem Körper schwebend.
- Kalter Boden-Glow (glowTex, `0x3a4a6a`, opacity 0.2, Scale 3.5).
- Schweben 1.2–1.8 m über Boden (höher als Geister — sie THRONEN).
- **`radius: 0.7, hitY: 1.3`** — auch wenn sie immun sind, braucht das
  Verpuffen-Feedback (3.4) einen korrekten Treffer-Anker!

### 3.2 Spawns & Leine

5 Dementoren: `(215,-155), (265,-160), (270,-200), (230,-210), (205,-187)`.
**Harte Leine:** Sie verlassen NIEMALS `dist(MOOR) > MOOR.r + 8` — beim
Erreichen der Leine drehen sie ab (state zurück auf drift), egal wie nah der
Spieler ist. Der Rest der Welt bleibt von diesem Update unberührt — das ist
das wichtigste Sicherheitsversprechen des ganzen Plans.

### 3.3 FSM & die Kälte

Aktiv **Tag UND Nacht** (das Moor ist immer trüb — sie brauchen kein
Nacht-Gate wie die Geister).

- `drift`: langsames Patrouillieren um den Spawn (speed 1.0, r 12,
  Lissajous wie Geister).
- → `aggro` wenn Spieler < `aggroRange` (22 + 4 pro getragenem Seelenlicht,
  ×0.5 mit Laterne): direkter Drift auf den Spieler, **speed 5.0** —
  schneller als Gehen (6.4×0.75 Frost-Slow = 4.8), langsamer als Sprint.
  Der Spieler MUSS sprinten. Genau diese Panik wollen wir.
- **Frost-Aura** (r 10): `--frost` (0..1) baut sich über 4 s auf
  (HUD-Vignette: eisblaue Ränder + weiße Frost-Textur-Andeutung via
  CSS-Gradient, KEINE Canvas-Textur nötig), Abbau 0.5/s außerhalb.
  Ab frost > 0.5: Bewegung ×0.75 (neues Feld `player.slowFactor`, default 1,
  in player.js bei der Speed-Berechnung multiplizieren — 3-Zeilen-Änderung).
  Zusätzlich: `health.damage(0.5, null)` alle 2 s solange in der Aura
  (die vorhandenen i-Frames 0.8s stören den 2s-Takt nicht).
- **Kontakt** (< 1.3): `damage(1, dir)` + Shake 0.4 + Dementor teleportiert
  6 m zurück (Geist-Muster — kein Dauerschaden-Stunlock).
- `repelled` (nur durch Patronus, Abschnitt 4): Flucht speed 9 Richtung
  Spawn, 30 s lang kein Aggro möglich, Umhang duckt sich (scale.y 0.8).
- **Kein Tod, kein HP.** `applyHit()` existiert, macht aber nur Feedback
  (3.4). `alive` bleibt immer true (damit spells.js sie weiter als Ziel
  prüft), aber `hp: Infinity`.

### 3.4 Immunitäts-Feedback (wichtig fürs Lernen!)

Stupor/Incendio-Treffer: Bolzen despawnt mit **grauem, kraftlosem Puff**
(fx.burst, `0x555b66`, 6 Partikel, speed 1.5 — sichtbar schwächer als jeder
normale Einschlag) + dumpfer Fehlton (audio: kurzer 110-Hz-Sinus-Plopp).
Beim ERSTEN Immun-Treffer der Session: Toast
„*Deine Zauber verpuffen an der Kälte … es braucht etwas Helleres.*" (4 s).
Das ist der Hinweis-Pfeil Richtung Hauspokal/Patronus.

### 3.5 Atem-Sound

`audio.setDementorBreath(proximity 0..1)` — EIN globales Node-Set (Muster:
setGhostDrone): tiefes Bandpass-Rauschen ~180 Hz mit langsamem An-/Abschwellen
(LFO 0.4 Hz, wie rasselndes Ein-/Ausatmen), gain ∝ Nähe des nächsten
Dementors. dementor.js meldet die Distanz wie creatures.js es mit
`_nearestGhostDist` vormacht.

---

## 4) Expecto Patronum (`spells.js` + `wand.js` + `src/patronus.js`)

### 4.1 Freischaltung

- Bedingung: **Hauspokal gewonnen** (`puzzles.finaleWon`).
- Beim Finale-Trigger: nach der Fanfare (+2 s Verzögerung, damit die Toasts
  nicht kollidieren) → Toast „*🦌 Du spürst eine neue Kraft … EXPECTO
  PATRONUM! (Taste 5)*" (6 s) + Spellbar wird neu gebaut (jetzt 5 Chips).
- Bei geladenem Alt-Save mit `pz.hauspokal: 1`: sofort freigeschaltet,
  ohne Toast-Zeremonie.
- Vorher: Chip existiert NICHT (SPELL_ORDER dynamisch: `spells.epUnlocked`
  steuert, ob buildSpellbar 4 oder 5 Chips baut; Taste 5 und Mausrad
  überspringen den Slot solange). KEIN grauer Sperr-Chip — die Überraschung
  ist schöner.

### 4.2 SPELLS-Eintrag (wand.js)

```js
patronum: { name: 'Expecto Patronum', emoji: '🦌', color: 0xcfe8ff, cooldown: 8 },
```
Cast-Animation: der normale Cast-Flick, aber Glow-Sprite ×3.5 statt ×2.2 und
Spitzenlicht blitzt weiß-silbern (0xcfe8ff) mit Intensität 12.

### 4.3 Der Charge (spells.js)

`patronus.js` exportiert `buildPatronusModel(glowTex)` → gibt die Gruppe
(Körper/Kopf/Geweih/Beine/Glow) + `legs`-Array zurück. **puzzles.js auf
diesen Helfer umbauen** (Finale-Patronus identisch, nur die Acht-Kurve und
das Nacht-Gate bleiben in puzzles.js). Nicht kopieren — extrahieren.

Cast mit patronum:
1. Kamera-Blickrichtung XZ-projiziert (y ignorieren — der Hirsch läuft am
   Boden, `terrainHeight` folgt er wie der Finale-Patronus).
2. Hirsch materialisiert 2 m vor dem Spieler (Auffade 0.2 s), galoppiert
   26 m geradeaus über 2.8 s (Gallop-Bob + Beinrotation wie im Finale),
   Funkenspur (fx.trail, 0xcfe8ff, 2/Frame), dann Ausfade 0.4 s.
3. Pro Frame: jeder Dementor mit `dist(hirsch) < 10` → `repelled`
   (+ fx.burst weiß am Dementor + audio.starLock-artiger heller Klang).
4. Während des Charges: `--frost` baut sich mit 0.5/s ab (der Hirsch wärmt).
5. Es existiert IMMER nur ein Charge-Hirsch (erneuter Cast vor Ablauf wird
   vom Cooldown 8 s verhindert — reicht als Schutz).
6. Der Charge funktioniert überall (auch außerhalb des Moors — er ist dann
   einfach nur schön; die Geister aus Phase 3 IGNORIEREN ihn bewusst, Lumos
   bleibt deren Konter — keine Mechanik-Vermischung).

### 4.4 Sound

`audio.patronusCast()`: aufsteigender heller Dreiklang (784/1046/1568 Hz,
Dreieck, 0.15 s versetzt) + weiches Rausch-Schimmern (Highpass 4 kHz, 1.2 s
Fade). Beim Repel je Dementor ein kurzer Glockenton (starLock-Rezept, tiefer:
Start 400→900 Hz).

---

## 5) Die Seelenlichter & die Krypta (`src/moor.js`)

### 5.1 Fünf Seelenlichter

Positionen (im Moor verteilt, alle < r 50 vom Zentrum):
`(210,-150), (275,-165), (263,-210), (215,-205), (247,-143)`.

- Look: Irrlicht — glowTex-Sprite `0x9fd8ff`, Scale 0.9, pulsierend
  (Schnatz-Bobbing-Muster), + 3 Mini-Motten-Sprites drumherum
  (bedMotes-Muster aus puzzles.js).
- **Pickup:** Proximity < 2 m (Schnatz-Muster). Kein Zauber nötig.
- **Getragen:** Die Lichter kreisen sichtbar um den Spieler (Orbit r 1.2,
  y +1.8, versetzt um 2π/n) — man SIEHT, wie viel man riskiert.
  HUD unter dem Artefakt-Zähler: „🏮 n / 5" (nur sichtbar, wenn n > 0 oder
  Spieler im Moor).
- **Risiko-Spirale:** Dementoren-aggroRange +4 pro getragenem Licht (3.3).
- **Bei Respawn (Tod):** getragene Lichter fallen an ihre URSPRUNGS-Spots
  zurück (nicht verloren, aber der Weg war umsonst — fair und schmerzhaft).
  Beim Spielneustart (Reload) ebenfalls: nur ABGELIEFERTE Lichter sind
  persistiert.

### 5.2 Abgabe & Krypta-Öffnung

- Abgabe-Zone: 3 m vor dem Krypta-Tor. Getragene Lichter fliegen einzeln
  in eine Wandnische (Bogen-Animation, sprite_pos-Muster aus puzzles.js),
  je ein Glas-Klang (1568-Hz-Ping). Zähler an der Krypta: 5 kleine
  Nischen-Glows, die dauerhaft leuchten (opacity 0.15 → 0.9).
- Bei 5/5: Rumpeln (audio.puzzleRumble(2.5)), Torplatte gleitet zur Seite
  (Grotten-Muster: 2.5 s, Blocker `disabled` DANACH), Fackel innen an,
  Truhe sichtbar.
- Truhe öffnet per Proximity (Troll-Truhen-Muster) → **„Silberne
  Seelenlaterne"** fliegt zum Spieler (Artefakt-Bogenflug-Muster).

### 5.3 Die Laterne (permanenter Effekt)

- Dementoren: aggroRange ×0.5, Frost-Aufbau ×0.5.
- Moor: Nebel-Sprites opacity ×0.6, `--moor`-Abdunklung ×0.5 — man sieht
  den Unterschied SOFORT beim nächsten Besuch.
- Menü: Statuszeile „🏮 Seelenlaterne geborgen" (unter der Hauspokal-Zeile,
  gleiches CSS-Muster).
- HUD: der 🏮-Zähler verschwindet, stattdessen hängt ein kleines statisches
  Laternen-Icon neben dem Artefakt-Zähler. Kein neues Artefakt (die 4
  bleiben die 4) — die Laterne ist eine eigene Trophäe.

### 5.4 Save v3 (main.js)

```js
{ v: 3, …alles aus v2…,
  moor: { lichter: ['l1','l3'], laterne: 0|1 } }   // nur ABGELIEFERTE Lichter
```
- Migration: v2-Save (oder älter) → `moor: { lichter: [], laterne: 0 }`.
  NIE crashen bei fehlenden Feldern (`?? default`).
- `moor.restore(state)` setzt ALLES synchron: Lichter an Spots/in Nischen,
  Tor offen/zu (+Blocker), Truhe, Laterneneffekte — Save-Reload und
  Reset-Button nutzen dieselbe Funktion (bewährtes puzzles.restore-Muster).
- Reset-Button: `moor.restore({})` ergänzen.

---

## 6) HUD & UI (index.html + hud.js)

- `#vignette` bekommt `--frost` (eisblau-weißer Rand-Schleier, deckender
  als --cold, bei frost > 0.7 zusätzlich leichte Gesamt-Abdunklung) und
  `--moor` (leichte Trübung/Entsättigung im Moor). Beide reine CSS-Layer
  über CSS-Variablen — Muster von --cold kopieren.
- `#soullights` („🏮 n / 5", unter #artifacts, gleiche Optik).
- `hud.setFrost(frac)`, `hud.setMoor(frac)`, `hud.setSoulLights(n, total|null)`.
- Menü: „🏮 Seelenlaterne geborgen" (hidden-Klasse, wie hauspokal-status).
- Steuerungs-Grid: Zeile „5" → „Expecto Patronum (nach dem Hauspokal)".

---

## 7) Audio-Rezepte (audio.js — alles prozedural)

| Sound | Rezept |
|---|---|
| Dementor-Atem | EIN Node-Set: Bandpass-Noise 180 Hz Q1.2, LFO 0.4 Hz auf Gain (Rassel-Atmen), gain ∝ Nähe |
| Zauber verpufft | 110-Hz-Sinus-Plopp, 0.15 s, leise (kraftlos!) |
| Patronus-Cast | Dreiklang 784/1046/1568 Dreieck + Highpass-4kHz-Schimmer 1.2 s |
| Dementor-Repel | starLock-Variante 400→900 Hz |
| Seelenlicht-Pickup | Glas-Ping 1568 Hz + Oktave, kurz |
| Licht-Abgabe | Ping + kleiner Hall (2. Ping leiser, 90 ms versetzt) |
| Krypta-Tor | vorhandenes puzzleRumble(2.5) |
| Moor-Ambient | windGain-Ziel im Moor +0.04 und windFilter.frequency auf 220 Hz absenken (heulender) — in moor.update() über insideFactor lerpen |

---

## 8) main.js-Integration (Checkliste)

- [ ] Imports + buildSteps: `['Nebelmoor', …]` NACH structures (braucht
      terrain), `['Dementoren', …]` NACH health+creatures.
- [ ] frame(): Reihenfolge aus Abschnitt 1; `hud.setFrost/setMoor` +
      `player.slowFactor` setzen (aus dementors.frostFactor).
- [ ] Save v3 laden/migrieren/schreiben; Reset-Button + moor.restore({}).
- [ ] `__game` erweitern: `dementors, moor` + `ep: () => {…}` (EP sofort
      freischalten, Testkomfort).
- [ ] Finale-Hook: in puzzles.onFinale zusätzlich `spells.unlockPatronum()`.

---

## 9) Phasenplan mit Definition-of-Done

> Nach JEDER Phase: rsync → Reload → step()-Tests → Screenshot → FPS-Check
> (die 5 bekannten Spots + NEU: Moor-Mitte (240,-175)) → Commit → Push →
> Pages-Build prüfen → Memory updaten.

**Phase N1 — Das Moor (Zone, ~1 Session)**
- terrain.js (MOOR + Weg), props.js (Ausschlüsse), moor.js (Deko, Nebel,
  Schild, Krypta ZU, Ambient-Blend), HUD --moor.
- ✅ DoD: Zone begehbar & unheimlich; keine grünen Bäume/Gras im Moor; Weg
  führt hin; Krypta verschlossen (Blocker wirkt); 60 FPS in Moor-Mitte.

**Phase N2 — Dementoren**
- dementor.js komplett (Look, FSM, Leine, Frost/Drain/Slow, Kontakt,
  Immunitäts-Feedback + Hinweis-Toast), --frost-Vignette, Atem-Sound,
  player.slowFactor.
- ✅ DoD: Moor ist ohne Patronus gefährlich, aber flüchtbar (Sprint);
  Dementoren überschreiten NIE die Leine (step()-Test: Spieler am Rand
  kiten → Dementor dreht ab); Stupor/Incendio verpuffen sichtbar.

**Phase N3 — Expecto Patronum**
- patronus.js-Extraktion (puzzles.js umgebaut, Finale-Regression testen!),
  Unlock-Flow (Finale-Hook + Alt-Save), 5. Chip, Charge + Repel, Sounds.
- ✅ DoD: Hirsch galoppiert durchs Moor und vertreibt sichtbar Dementoren
  (30 s Ruhe); Finale-Patronus unverändert; Alt-Save mit Hauspokal hat den
  Chip sofort; ohne Hauspokal existiert kein 5. Chip.

**Phase N4 — Seelenlichter, Krypta & Laterne**
- Pickup + Orbit-Visuals + Aggro-Bonus, Abgabe-Nischen, Tor-Öffnung, Truhe,
  Laterneneffekte, Save v3 + Migration + Reset, Menü-Zeile.
- ✅ DoD: kompletter Quest-Loop end-to-end; Tod mit getragenen Lichtern
  wirft sie an die Spots zurück; Reload restauriert Tor/Nischen/Laterne
  exakt; Reset macht alles zu; Laterne halbiert Aggro spürbar.

**Phase N5 — Balancing, Polish & Deploy**
- Balancing-Tabelle (Abschnitt 11) gegen echtes Spielgefühl; Toast-Texte;
  README (Moor/Dementoren/EP/Laterne + Taste 5); Performance-Pass
  (Moor-Spot!); finaler Deploy + Memory-Abschluss.
- ✅ DoD: 100%-Durchlauf (Hauspokal → EP → Laterne) per step()-Skript grün;
  alle 6 Benchmark-Spots ≥ 55 FPS.

---

## 10) Automatisierte Abnahme-Tests (Muster)

```js
const g = window.__game;
g.start(); g.gott(); g.ep();                    // EP freischalten (Test-Hook)

// Frost & Drain:
g.gott = null; g.health.invincible = false;
g.teleport(240, -175, 0); g.step(300);          // 5s in der Moor-Mitte
assert(getComputedStyle(vignette).getPropertyValue('--frost') > 0.5);
assert(g.health.hearts < 5);

// Immunität:
const d = g.dementors.list[0];
/* castAt auf d.pos.y + d.hitY zielen */         // hitY! (Abschnitt 12.8)
assert(d.alive && dToastZeigteHinweis);

// Repel:
g.wand.selectSpell('patronum'); g.spells.cooldowns.patronum = 0;
g.castAt(/* Richtung Dementor */); g.step(180);
assert(d.state === 'repelled' && dist(d, spawn) < 5);

// Leine:
d.pos.set(MOOR.x + MOOR.r + 20, …);             // von Hand rausziehen
g.step(60); assert(dist(d, MOOR) < MOOR.r + 8); // zurückgeleint

// Laterne-Loop: alle 5 Lichter per Teleport einsammeln, abgeben,
// assert(moor.laterneCollected && tor offen && save.moor.laterne === 1)
```
Und wie immer: mindestens EIN echter Durchlauf von Hand mit Screenshots
(Moor bei Tag, Dementor-Aggro mit Frost-Vignette, Patronus-Charge,
Krypta offen, Menü mit Laternen-Zeile).

---

## 11) Balancing-Tabelle (Startwerte — HIER ändern, nicht im Code verstreuen)

Alle Werte als `const TUNING = {…}` oben in dementor.js/moor.js:

| Wert | Start |
|---|---|
| Dementor: drift / chase / Anzahl | 1.0 / 5.0 m/s / 5 |
| Dementor: aggroRange / +je Licht / Laterne | 22 m / +4 / ×0.5 |
| Frost: Aufbau / Abbau / Slow ab / Slow-Faktor | 4 s bis 1.0 / 0.5/s / 0.5 / ×0.75 |
| Aura-Drain / Takt | 0.5 ♥ / 2 s |
| Kontakt: Schaden / Rückstoß-Teleport | 1 ♥ / 6 m |
| Repel: Radius um Hirsch / Dauer | 10 m / 30 s |
| EP: Cooldown / Charge-Länge / -Dauer | 8 s / 26 m / 2.8 s |
| Leine | MOOR.r + 8 |
| Seelenlicht: Pickup-Radius / Abgabe-Zone | 2 m / 3 m |

---

## 12) ⚠️ Stolperfallen — die gesammelten Lehren aus 8 Phasen (NICHT neu entdecken!)

1. **rAF friert** in inaktiven Preview-Tabs ein → Tests IMMER über
   `__game.step(n)`; nie auf echte Sekunden warten.
2. **Preview dient aus dem Scratchpad** → nach jedem Edit rsync, sonst
   testest du alten Code. launch.json-Pfad ist pro Session neu.
3. **Plan-Koordinaten ≠ echte Geometrie.** In Phase 5 mussten Feuerschalen
   UND Druckplatten verschoben werden (Viadukt schmaler als gedacht,
   Astronomieturm im Weg). → Vor JEDEM Bauen die Zielzone per Explore-Agent
   gegen castle/structures/props/creatures/collectibles prüfen.
4. **Ziel-Registry vs. Blocker:** `pointBlocked()` läuft in spells.update()
   VOR der Ziel-Registry (mit `continue`). Ein Ziel < ~1.6 m neben einem
   eigenen Blocker wird frame-abhängig zufällig „verschluckt" (Phase-6-Bug
   bei den Runen-Steinen). Ziele immer mit Abstand > Blocker-Radius + 1
   Frame-Schritt (0.8 m) registrieren.
5. **FSM-Falle Nr. 1 der ganzen Session (3× aufgetreten!):** Ein blindes
   `if (state === 'dead') return;` am Anfang von update() frisst alles, was
   NACH dem Tod noch laufen muss (Geist-Sterbeanimation Phase 3, Troll-Truhe
   Bonus). → Bei jedem Endzustand explizit fragen: „Was muss hier trotzdem
   noch laufen?" (Truhen, Ringe ausfaden, Interaktionen). Für Dementoren:
   `repelled` ist KEIN Endzustand — Timer muss weiterlaufen.
6. **Zustands-Abschlüsse nie hinter Distanz-Culling:** Sterbe-/Timer-Enden
   müssen VOR dem Culling-Early-Return abgearbeitet werden; nur laufendes
   Verhalten darf einfrieren.
7. **Sprites in opaker Geometrie:** Additives Blending ändert NICHT den
   Tiefentest — Sprite-Anker müssen AUSSERHALB des umschließenden Meshes
   liegen (Geister-Augen-Bug Phase 3). Relevant für Nischen-Glows/Hände.
8. **Treffer-Anker ≠ Fußpunkt (Fable-Audit-Fund):** spells.js prüft die
   Kreatur-Kollision gegen `c.pos.y + (c.hitY || 0)`. Kreaturen, deren pos
   der Fußpunkt ist, BRAUCHEN `hitY` auf die visuelle Mitte (Geist 0.9,
   Troll 1.8, Dementor 1.3) — sonst verfehlen Schüsse auf Torso/Kopf.
   Und: Test-Skripte müssen auf `pos.y + hitY` zielen, nicht auf den Anker —
   sonst testet man die Implementierung statt das Spielgefühl.
9. **Teleport landet in Objekten:** `resolveBlockers()` schiebt den Spieler
   beim nächsten update() bis zu mehrere Meter weg → in Tests Position NACH
   `player.update(0)` neu lesen, bevor Yaw/Pitch gerechnet wird.
10. **Feder-Physik hinkt bewegten Zielen nach** (Leviosa-Lehre): nach
    Bewegung ~1 s stillhalten lassen, bevor man Positionen asserted.
11. **yaw=0 blickt nach −z (Norden).** Ziel mit größerem z ⇒ yaw=π. Bei
    „unsichtbaren" Objekten erst NDC-Projektion prüfen, dann an Geometrie
    zweifeln.
12. **Geteilte Materialien clonen**, wenn opacity/color PRO Objekt animiert
    wird (Dementoren-Umhänge!). **mergeGeometries** nur mit uv+normal-
    Primitiven, alles vorher durch tint().
13. **Punktlicht-Budget** hart bei ~12 aktiven: Moor bekommt KEINE neuen
    Dauerlichter außer der Krypta-Fackel. **Classifier-Ausfälle**: read-only
    Tools laufen weiter; git/gh-Muster sind allowlisted — Rezept im Memory.

---

## 13) Was NICHT bauen (Scope-Schutz)

- ❌ Dementoren töten/looten — sie werden NUR vertrieben (das ist ihr Wesen)
- ❌ Dementoren außerhalb des Moors (die Leine ist heilig)
- ❌ Besenflug, Reit-Patronus, neue Zonen jenseits des Moors
- ❌ „Glücks"-Ressource/Mana-System — Cooldown 8 s ist die ganze Ökonomie
- ❌ Kein Umbau der bestehenden Zauber/Kreaturen (Geister ignorieren den
  Patronus bewusst — Lumos bleibt ihr Konter)
- ❌ Keine externen Assets/Libraries — „alles prozedural" bleibt Markenzeichen

Wenn eine Phase aus dem Ruder läuft: Feature halbieren, nicht die Qualität.
Lieber ein perfektes Moor als ein mittelmäßiges Moor plus Hast.

---

*Das Schloss ist gemeistert, Sonnet — jetzt zeig ihnen, was hinter dem*
*Nebel wartet. 🌫️🦌 — Fable*
