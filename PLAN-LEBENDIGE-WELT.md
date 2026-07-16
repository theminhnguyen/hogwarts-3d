# 🌍 Lebendige-Welt-Update: Wetter, Dorf & Eisenbahn, NPCs, neue Kreaturen & Besenflug

> **Implementierungsplan** für Hogwarts 3D — geschrieben von Fable, umzusetzen mit Sonnet.
> Stand: 2026-07-16. Basis: `main` inklusive N5 (Commit ed80991) — das komplette
> Magie-Update UND das komplette Nebelmoor-Update sind live und getestet.
>
> **Lies dieses Dokument komplett, bevor du die erste Zeile schreibst.**
> Abschnitt 0 (Arbeitsumgebung), Abschnitt 1.2 (Zonen-Tabelle für Koordinaten-
> Mathe) und Abschnitt 13 (Stolperfallen — jetzt 19 gesammelte Lehren aus
> 13 Phasen) sind Pflichtlektüre. Sie ersparen dir jeden Fehler, den diese
> Session schon einmal gemacht hat.

---

## Vision in einem Satz

Die Welt hört auf, eine Kulisse zu sein: Wetter zieht über die Ländereien,
eine Dampflok fährt in ein kleines Zauberer-Dorf ein, Schüler wandern über
die Wege und geben dir Aufgaben, im Wald lauert ein Spinnennest, eine
schlagende Weide bewacht ihren Hügel — und am Ende schwingst du dich auf
einen Besen und fliegst über all das hinweg.

**Spielgefühl-Ziele:**
- **Die Welt lebt ohne dich.** Zug, NPCs, Wetter und Eulen folgen eigenen
  Rhythmen — der Spieler beobachtet Dinge, die nicht seinetwegen passieren.
- **Grafik-Sprung ohne Asset-Bruch.** Alles bleibt prozedural — aber Wetter,
  Wind in der Vegetation und ein dezenter Post-Effekt-Stack lassen dieselbe
  Geometrie doppelt so gut aussehen.
- **Der Besen ist die ultimative Belohnung.** Nach Schloss, Rätseln, Moor
  und Laterne öffnet der Flug die dritte Dimension — und das Quidditch-Feld
  bekommt endlich seinen Zweck.
- **Alles bleibt kostenlos, offline, prozedural** — kein Asset, kein CDN,
  keine Library außer dem lokalen three.js.

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
   gott(), ep()). **rAF friert in inaktiven Tabs ein** → NIEMALS auf echte
   Zeit warten, IMMER `__game.step(n)` simulieren. **Vor jedem unabhängigen
   End-to-End-Testlauf `localStorage.removeItem('hogwarts3d-save-v1')`** —
   sonst lädt der Save des letzten Testlaufs und Pickups/Quests laufen stumm
   ins Leere (Lehre aus N4).
3. **Koordinaten-Verifikation VOR dem Bauen:** Alle neuen Koordinaten in
   diesem Plan sind gegen die Zonen-Tabelle (1.2) GERECHNET, aber nicht gegen
   jedes Deko-Objekt. Vor jeder neuen Zone: Explore-Agent über `castle.js`,
   `structures.js`, `props.js`, `creatures.js`, `collectibles.js`,
   `puzzles.js`, `moor.js`, `dementor.js`, `spells.js` schicken und das
   Ziel-Rechteck prüfen. In Phase 5 (Magie) und N1 (Moor) mussten Standorte
   verschoben werden, weil das versäumt wurde.
4. **Committen:** direkt auf `main`, deutsche Commit-Messages, `git push`,
   danach `gh api repos/theminhnguyen/hogwarts-3d/pages/builds/latest` bis
   `status: "built"`. Nach jeder Phase Memory (`hogwarts-3d-project`) updaten.

---

## 1) Architektur & Zonen-Tabelle

### 1.1 Neue Dateien

```
src/
├── weather.js    NEU  – Wetter-Zustandsmaschine, Regen-Partikel, Donner, Windstärke
├── post.js       NEU  – handgerollter Post-FX-Stack (Bloom, Grade, FXAA) — KEINE Addons
├── village.js    NEU  – Dorf, Gasthaus, Bahnhof, Laternen (Zone Nordwesten)
├── train.js      NEU  – Dampflok + Wagen, Fahrplan, Gleis-Trasse, Rauch, Pfeife
├── npc.js        NEU  – NPC-Klassen (Schüler, Wirt, Schlossgeist, Katze) + Dialog-Flow
├── interact.js   NEU  – generische Interakt-Registry (Taste E) + Prompt-Anzeige
├── grove.js      NEU  – Spinnennest-Hain im Ostwald (Netze, Spinnen, Truhe)
├── broom.js      NEU  – Besenflug (Player-Erweiterung) + Quidditch-Ringe-Parcours
└── (bestehend)   terrain.js, props.js, materials.js, main.js, hud.js, audio.js,
                  player.js, spells.js, dementor.js … werden erweitert
```

**Frame-Reihenfolge** (Erweiterung von `frame(dt)` — Reihenfolge wichtig):
```
weather.update(dt, sky.state)          // VOR sky-abhängigen Systemen (liefert windStrength)
player.update(dt)                      // broom.js hängt sich IN player (flying-Flag)
wand / spells / creatures / dementors  // unverändert
npcs.update(dt, player, sky.state)
train.update(dt)
moor / puzzles / fx / health           // unverändert
interact.update(player)                // Prompt-Anzeige, E-Taste
broom.updateRings(dt, player)          // Quidditch-Parcours-Timer
… HUD …
post.render(scene, camera)             // ERSETZT renderer.render (wenn 'schön')
```

**Grundsätze (unverändert gültig):**
- Kein einziges externes Asset — alles Primitiven + tint() + Canvas-Texturen.
- Alles Bewegliche gepoolt; Geometrien/Materialien einmal pro Gattung.
- **Punktlicht-Budget bleibt hart:** dieses Update ergänzt genau EIN neues
  dauerhaftes Punktlicht (Gasthaus-Kamin). Dorf-Laternen, Zug-Lampen,
  Gewächshaus: NUR Glow-Sprites.
- Jede neue Zone bekommt ihren eigenen GeoBatch (1–2 Draw-Calls pro Zone).

### 1.2 Zonen-Tabelle (für Koordinaten-Mathe — Werte aus terrain.js verifiziert)

| Zone | Zentrum | Terrain-Einfluss bis (m vom Zentrum) |
|---|---|---|
| PLATEAU (Schloss) | (0, −20) | 130 (r85 + blend45) |
| LAKE (See-Senke) | (−170, 230) | 125 |
| QUIDDITCH | (−195, 10) | 98.8 (r52 × 1.9) |
| HAGRID | (122, 200) | 30.4 (r16 × 1.9) |
| STONES (Steinkreis-Hügel) | (150, −95) | 62.4 (r24 × 2.6) |
| BOATHOUSE | (−88, 158) | 26.6 (r14 × 1.9) |
| MOOR | (240, −175) | 80 (r55 + blend25) |
| RAVINE (Schlucht) | Band um z=94 | ±27 in z, \|x\|<190 |
| Damm | Korridor x∈±30 | z 28…185 |
| Bergring | Ursprung | beginnt bei d0=330, WORLD_BOUND=430 |
| Wege (PATHS) | Polylinien | ±7 m freihalten |

**Regel:** Zwei Terrain-Shapings dürfen sich nur überlappen, wenn beide im
Überlappungsbereich auf ANNÄHERND DIESELBE Zielhöhe lerpen (±1 m). Hügel
gegen Senke = niemals (N1-Lehre).

### 1.3 Neue Zonen dieses Plans (vorgerechnet — trotzdem per 0.3 verifizieren!)

| Neu | Position | Prüfung |
|---|---|---|
| DORF (Senke h≈4, r40, ×1.9→76) | (−70, −230) | d0=240, Außenkante 316 < 330 ✓ · PLATEAU-Abstand 221 > 130+76 ✓ · STONES 258 ✓ |
| Bahnhof | (−140, −255) | im Dorf-Umfeld, Trasse-Flatten zielt h≈4 (= Dorf-Höhe → Überlappung ok) |
| Gleis-Trasse (Korridor ±6 m, h 3.5–4) | (−285,−185)→(−215,−235)→(−140,−255)→(−40,−275)→(60,−290)→(115,−310) | Portale liegen bewusst IM Bergring-Anstieg (Tunnelmünder) |
| Gewächshaus (Flatten r12, h4.5) | (80, 240) | HAGRID-Abstand 58 > 30.4+22.8 ✓ · LAKE 250 ✓ |
| Eulerei (kein Flatten) | (95, −25) | im PLATEAU-Blendbereich (Turm passt sich Hang an) · STONES 89 > 62.4 ✓ |
| Peitschende Weide (kein Flatten) | (60, −150) | PLATEAU 143 > 130 ✓ · STONES 105 > 62.4 ✓ · Rundweg-Pfad > 40 ✓ |
| Spinnennest-Hain | (150, 60) | RAVINE-Band \|60−94\|=34 > 27 ✓ · STONES 155 ✓ |
| Besenschuppen | (−155, 10) | auf dem Quidditch-Flatten (h4), 40 m vom Feld-Schnatz ✓ |

Neue PATHS-Einträge: `[[-90, 100], [-80, -160], [-70, -230]]` (Rundweg → Dorf)
und `[[-70,-230],[-140,-255]]` (Dorf → Bahnhof).

---

## 2) Phase W1 — Wetter & lebendige Vegetation (`weather.js` + materials.js)

### 2.1 Wetter-Zustandsmaschine
- Zustände: `klar` → `bewölkt` → `regen` → `sturm` (und zurück). Wechsel alle
  120–300 s (seeded random), Übergänge über 15 s geblendet. Start immer `klar`.
- `weather.windStrength` (0.2 klar … 1.0 sturm) ist DIE zentrale Größe:
  audio.windGain-Ziel, Wolken-Driftgeschwindigkeit (sky.js), Moor-Nebel-Drift,
  Vegetations-Sway-Amplitude lesen alle diesen Wert.
- `regen/sturm`: sky.js-Himmel Richtung Grau blenden (bestehende Farb-Lerps
  erweitern, NICHT sky.js umbauen — nur ein `weather.gloom`-Faktor 0..1, den
  sky.update() als zusätzlichen Lerp-Input nimmt), Sonnenintensität ×(1−0.5·gloom).
- Vögel/Grillen schweigen bei Regen (`audio.update` bekommt gloom).

### 2.2 Regen & Donner
- **Regen:** EIN `THREE.Points`-System (~700 Tropfen, eigener Shader wie fx.js —
  Achtung Stolperfalle 19: Attribut nie `color` nennen). Tropfen leben in
  einem 40×30×40-Zylinder um den Spieler, fallen mit 22 m/s + Windversatz,
  Reset nach Bodenkontakt (terrainHeight). Als Streifen rendern (gestreckte
  Quads via Shader oder gl.LINES — Streifen lesen sich besser als Punkte).
- **Sturm:** Regen dichter (alle 700), alle 8–20 s ein Blitz: Himmels-Flash
  (hemi-Licht-Intensität kurz ×3 + weißer CSS-Layer opacity 0.25, 120 ms),
  danach 1–3 s versetzt prozeduraler Donner (audio: tiefes Noise-Rumpeln,
  Lowpass 120 Hz, 2 s Abklingen — Rezept wie trollSlam, nur länger/tiefer).
- Regen im Innenraum (Große Halle): Tropfen spawnen nur, wenn über der
  Spawn-Position KEINE Plattform liegt (`platformGround`-Check beim Reset —
  billig, 1 Check pro Tropfen-Reset, nicht pro Frame).

### 2.3 Vegetations-Sway (materials.js)
- Gras + Bäume sind InstancedMeshes mit LOKALEN Vertex-Koordinaten (props.js)
  — perfekt für Shader-Sway: `onBeforeCompile` des Natur-Materials bekommt
  `uTime` + `uWind`; Verschiebung in x/z ∝ `position.y / geoHeight` (Basis
  steht, Krone schwankt), Phase aus `instanceMatrix`-Weltposition gehasht,
  Amplitude 0.05 m (klar) bis 0.35 m (Sturm). Gras stärker (volle Amplitude),
  Bäume dezenter (×0.4).
- **Fallende Blätter:** kleiner Pool (60 Sprites) nur in Waldnähe, trudeln
  spiralig zu Boden, despawnen dort. Spawnrate ∝ windStrength.

### 2.4 __game-Hooks
`__game.weather` mit `.state`, `.set('sturm')` (sofortiger Wechsel für Tests),
`.windStrength`.

✅ **DoD W1:** Wetterwechsel per `weather.set()` sichtbar (Himmel, Regen,
Wind-Sound); Regen fällt NICHT in der Großen Halle; Gras/Bäume schwanken
sichtbar stärker im Sturm; Donner folgt Blitz verzögert; 60 FPS im Regen an
allen Benchmark-Spots; Vogel-Stille bei Regen.

---

## 3) Phase W2 — Post-FX „Schön/Schnell" (`post.js`)

Handgerollter Mini-Composer, KEINE three.js-Addons (nur three.module.js ist da):

### 3.1 Pipeline
1. Szene → `RT_scene` (volle Auflösung, HalfFloat wenn verfügbar).
2. Brightpass + Downsample → `RT_bright` (¼ Auflösung, Schwelle ~0.75).
3. Blur H → Blur V (zwei ¼-RTs, 9-Tap-Gauß).
4. Kombinier-Pass (Fullscreen-Quad): `RT_scene` + Bloom (additiv, Stärke 0.35)
   + Color-Grade (leichte S-Kurve, Sättigung +8 %, nachts Schatten minimal
   Richtung Blau) → `RT_final`.
5. FXAA-Pass auf `RT_final` → Bildschirm.

### 3.2 Kritische Details (Stolperfallen 18 vorwegnehmen!)
- Renderer nutzt `ACESFilmicToneMapping` — das wird PRO MATERIAL angewandt.
  Alle Fullscreen-Quad-Materialien MÜSSEN `toneMapped: false` setzen und der
  Renderer-Output beim finalen Pass unverändert bleiben, sonst wird doppelt
  getonemappt (ausgewaschenes Bild).
- RT-Größen folgen `renderer.getDrawingBufferSize()` — bei Resize UND bei
  jedem `setPixelRatio` der Auto-Qualität neu allozieren (throttled).
- Der bestehende fx.js-Partikel-Shader und der Wasser-Shader rendern in die
  Szene wie bisher — Post-FX liegt komplett dahinter, keine Integration nötig.

### 3.3 Qualitäts-Stufen & Menü
- Menü-Button `Grafik: Schön / Schnell` (persistiert, Save v4). `Schnell` =
  direkter `renderer.render` wie bisher (Null Overhead, alte Optik).
- Auto-Degradation innerhalb von `Schön`: fpsEMA < 50 → Bloom aus (nur
  Grade+FXAA); fpsEMA < 42 → komplett auf Direkt-Render zurückfallen und
  Toast „Grafik automatisch reduziert" (einmalig). Die bestehende
  pixelRatio-Anpassung läuft unabhängig weiter.
- **Kill-Kriterium (Scope-Schutz):** Wenn der volle Stack nach einem Tag
  Arbeit nicht stabil 55+ FPS auf dem Test-Rechner hält → Bloom streichen,
  nur Grade+FXAA shippen. Ein halber, stabiler Effekt schlägt einen ganzen
  wackligen.

✅ **DoD W2:** Sichtbarer Unterschied Schön↔Schnell (Screenshot-Vergleich);
Glow-Quellen (Fackeln, Schnätze, Patronus) bloomen weich; keine doppelte
Tonemapping-Waschung; Resize + pixelRatio-Wechsel ohne Artefakte; `Schön`
hält 55+ FPS an allen Benchmark-Spots, sonst greift die Degradation sichtbar.

---

## 4) Phase W3 — Dorf & Eisenbahn (`village.js` + `train.js` + terrain.js)

### 4.1 Terrain (terrain.js)
- `export const DORF = { x: -70, z: -230, r: 40, h: 4 };` — Flatten wie
  QUIDDITCH-Muster (`smoothstep(r, r*1.9, d)`).
- Gleis-Trasse: Korridor-Flatten entlang der Polyline aus 1.3 (Muster: der
  bestehende Damm-Code, aber via distToPolyline-Helfer, Breite ±6 m, Zielhöhe
  4 am Bahnhof → 3.5 an den Portalen). Zielhöhen im Dorf-Überlappungsbereich
  BEIDE ≈4 (Regel aus 1.2).
- Neue PATHS-Einträge aus 1.3. Vegetations-Ausschluss: Dorf r+10 und
  Trasse ±8 in props.js (spotFree + Loops — Muster MOOR).

### 4.2 Dorf (village.js, ~6 Häuser + Platz)
- 6 Fachwerk-artige Häuser (Box-Korpus + Satteldach-Prisma + Schornstein,
  Fenster als emissive Flächen, die nachts glühen — Muster castle-Fenster),
  gemergt in EINEN GeoBatch, individuelle Kreis-/Box-Blocker.
- Dorfplatz: Brunnen (klein, heilt NICHT — der Innenhof-Brunnen bleibt
  einzigartig), 4 Laternen (Pfosten + Glow-Sprite, nachts opacity hoch,
  KEINE Punktlichter), 2 Marktstände (Deko).
- **Gasthaus „Zum Singenden Kessel"** (Fantasiename — bewusst KEIN Name aus
  den Büchern): größtes Haus, begehbare Nische (Grotten-Muster wie Krypta:
  3 Wände + offene Front, innen Tresen, 2 Tische, Kamin). Kamin: das EINE
  neue Punktlicht + Flacker-Animation (castle-Fackel-Muster) + Rauch aus dem
  Schornstein (LifeSystem-Kaminrauch-Muster wiederverwenden).
  **Kamin-Heilung:** Proximity < 2.5 m heilt voll (Brunnen-Muster, eigener
  60-s-Cooldown, Toast „Du wärmst dich am Kamin. ♥ voll!").
- Ortsschild am Dorfeingang (Zwei-Pfosten-Muster) + einmaliger Toast.

### 4.3 Bahnhof & Zug (train.js)
- Bahnhof: Bahnsteig (Box, 2 m hoch, Kante zur Trasse), kleines Stationshaus
  (in den Dorf-Batch), Schild „Eulenbrück" (Fantasiename), 2 Laternen-Sprites.
- Gleis: 2 parallele dunkle Schienen-Boxen + Schwellen alle 1.2 m, als EIN
  gemergter Batch entlang der Polyline (Kurven segmentweise interpoliert).
- **Tunnelportale:** an beiden Enden Steinbogen (Halbtorus/Boxen) + schwarzes
  „Loch" (MeshBasicMaterial 0x000000-Ebene — Dementor-Kapuzen-Trick: Schwarz
  ohne Licht liest sich als Tiefe).
- **Zug:** Lok (Kessel-Zylinder, Führerhaus-Box, Schlot, 6 Räder-Zylinder,
  rote Akzente) + 3 Wagen, als EINE Group, fährt die Polyline entlang
  (CatmullRom über die Trasse, wie Finale-Patronus-Spline-Muster).
  Fahrplan: alle 240 s aus Portal A → 20 s Halt am Bahnhof → weiter zu
  Portal B → despawn (unsichtbar bis zur nächsten Runde, Richtung wechselt).
  Beim Fahren: Schlot-Rauchpartikel (fx.trail grau, 2/Frame), Chuff-Sound
  (rhythmisches Noise-Puffen ∝ Geschwindigkeit), Pfeife bei Ein-/Ausfahrt
  (zwei Sinus-Töne 620+930 Hz, 0.8 s). Nachts: Stirnlampe als Glow-Sprite.
  Anfahren/Bremsen über 6 s easing — Räder drehen (rotation ∝ Strecke).
- **Kein Einsteigen/Mitfahren** (Scope-Schutz — der Zug ist Weltleben, kein
  Transportmittel; Schnellreise wäre ein eigenes Feature).

### 4.4 Sounds (audio.js)
Pfeife, Chuff-Loop (gain ∝ Nähe, EIN Node-Set — setGhostDrone-Muster),
Kamin-Knistern (Incendio-Crackle-Rezept, leiser Dauerloop nur in Gasthaus-Nähe).

✅ **DoD W3:** Dorf begehbar mit Kollision, Fenster glühen nachts, Kamin heilt
(Cooldown greift); Zug fährt sichtbar ein, hält, pfeift, raucht und
verschwindet im Portal; Trasse/Dorf ohne Terrain-Nähte (Screenshot); Weg
führt vom Rundweg ins Dorf; 55+ FPS im Dorf bei einfahrendem Zug.

---

## 5) Phase W4 — Gewächshaus, Eulerei & Peitschende Weide

### 5.1 Gewächshaus (structures.js oder village.js — wo es besser passt)
- Glashaus 10×6 m: Rahmen aus dünnen Boxen + Glasflächen
  (`MeshLambertMaterial transparent opacity 0.22 DoubleSide`), Giebeldach.
  Innen: 2 Pflanztische mit Töpfen, darin wippende Fantasie-Pflanzen
  (Kegel/Kugeln in Grüntönen, 1–2 mit Glow-Knospen). 3 **Leuchtkräuter**
  (Glow-Sprite klein, smaragdgrün) auf den Tischen — Pickup erst in W5
  (Quest), hier nur Deko + Positionen exportieren.
- Blocker für Wände, Durchgang offen (Tür-Lücke).

### 5.2 Eulerei (props.js/structures.js) + Eulen (creatures.js-Erweiterung light)
- Runder Steinturm (r 3, h 9) am Hang (95, −25), oben offene Fensterbögen,
  Sitzstangen. 4 **Eulen**: tagsüber sitzend (leichtes Kopf-Wackeln), nachts
  Kreisflug um den Turm (Vogel-Muster aus LifeSystem, aber größer + langsamer),
  gelegentlicher Ruf (2 weiche Sinus-Töne 540→480 Hz — „Schuhu"). KEINE
  Interaktion, reine Atmosphäre. Eulen sind Deko-Objekte in props/LifeSystem,
  KEINE CreatureSystem-Bürger (kein hp/hitY nötig — Bolzen fliegen durch).

### 5.3 Peitschende Weide
- Dicker knorriger Stamm (Zylinder + jitter 0.3) + 6 Ast-Ketten (je 3
  Segmente, per Group-Hierarchie animierbar) auf dem Hügel bei (60, −150).
- Verhalten: Spieler < 7 m → Äste holen aus (1 s Telegraph: Äste heben sich,
  Knarz-Sound) → Schlag (rotieren schnell durch): Spieler in < 5 m bekommt
  `damage(0.5, dir)` + Rückstoß 6 (Kontakt-Muster Dementor). Cooldown 3 s.
  KEIN hp, unzerstörbar, reine Umwelt-Gefahr.
  → Die FSM ist trivial (idle/telegraph/swing/cooldown), aber: Lehre 5
  beachten — im „cooldown"-Zustand muss der Ast-Rückschwung weiterlaufen.
- Warum? Sie bewacht einen Schnatz? NEIN — die 12 Schnätze bleiben
  unangetastet (Save-Kompatibilität!). Sie bewacht eine kleine Truhe mit
  **einmaligem Herz-Refill + 50 Funken-Konfetti** (Belohnung fürs Timing).

✅ **DoD W4:** Gewächshaus transparent + begehbar; Eulen sitzen tags, kreisen
nachts, rufen hörbar; Weide telegraphiert sichtbar und trifft nur bei
Nichtausweichen (step()-Test: Spieler außerhalb 5 m beim Swing = kein
Schaden); Truhe hinter der Weide funktioniert; 60 FPS an allen Spots.

---

## 6) Phase W5 — Interakt-System, NPCs & Dialoge (`interact.js` + `npc.js`)

### 6.1 Interakt-Registry (interact.js)
- `interact.register({ x, z, r, prompt, onInteract, enabled })` → Liste.
- `interact.update(player)`: nächstes aktives Ziel in Reichweite → HUD-Prompt
  („E — Mit Lena sprechen") via hud.showHint-Muster (eigene Zeile über der
  Spellbar, nicht das Schwimm-Hint kapern). Taste E in main.js → onInteract().
- Steuerungs-Grid + README um „E — Interagieren" ergänzen.

### 6.2 Dialog-UI (hud.js + index.html)
- `#dialog` unten mittig: Name-Zeile (farbig) + Text + „E ▸" Weiter-Hinweis.
  `hud.showDialog(name, lines[])` — E blättert, letzte Zeile schließt.
  Spieler-Bewegung bleibt frei (kein Modal-Lock — simpel halten).

### 6.3 NPCs (npc.js)
Prozedurale Figuren (~80 Dreiecke): Robe (Kegel), Kopf (Kugel, Hautton),
Haar (Halbkugel), Schal in Hausfarbe (Torus-Segment). Idle-Wippen +
Geh-Animation (Roben-Pendeln). KEINE Gesichter (liest sich auf Distanz
besser als schlechte Gesichter).

| NPC | Ort | Verhalten |
|---|---|---|
| 4 Schüler (je Hausfarbe) | wandern tags einzeln auf PATHS-Abschnitten (Waypoint-Folge, 1.2 m/s), stehen manchmal 10 s | nachts verschwunden (Fade — Geist-Fade-Muster) |
| Lena (Schülerin) | Innenhof-Rand | Questgeberin Q1 |
| Wirt Barnaby | im Gasthaus | Questgeber Q2 |
| Schlossgeist | schwebt in der Großen Halle | Hinweisgeber (kontextabhängig) |
| Katze „Musch" | streunt beim Bootshaus | Quest-Ziel Q1 |

- **Schlossgeist:** halbtransparent (Geist-Material-Muster, aber freundlich
  warmweiß), Dialog liefert DYNAMISCHE Hinweise: fehlende Schnätze (nächster
  Fundort-Name aus collectibles SPOTS), offene Rätsel, Moor-Tipp wenn EP
  freigeschaltet aber Laterne fehlt. Ein NPC, der den Spielstand liest —
  der beste Tutorial-Ersatz.
- **Q1 „Die verlorene Katze":** Lena → „Musch ist weggelaufen, Richtung See…"
  → Katze beim Bootshaus per E ansprechen → folgt dem Spieler (Follow-FSM,
  teleportiert nach, wenn > 25 m — kein Pathfinding bauen!) → zu Lena →
  Belohnung: volle Herzen + Fanfare + Toast. Quest-Status in Save v4.
- **Q2 „Kräuter für den Kessel":** Barnaby → „3 Leuchtkräuter aus dem
  Gewächshaus…" → 3 Pickups (Interakt, je Glas-Ping) → zurück → Belohnung:
  **„Warm ums Herz"** (permanent: Frost-Aufbau ×0.75 — multipliziert sich
  mit der Laterne; dementors.frostRateMul-Bridge in main.js erweitern) +
  Menü-Statuszeile.
- Save v4: `{ v:4, …, quests: { katze: 0|1|2, kraeuter: 0-3, kraeuterDone: 0|1 }, grafik: 'schoen'|'schnell' }`
  + Migration (v3 → Defaults) + Reset-Button + `npc.restore()`-Symmetrie
  (Lehre: restore setzt ALLES synchron, auch Katzen-Position).

✅ **DoD W5:** Schüler wandern tags auf Wegen und fehlen nachts; beide Quests
end-to-end per step()-Skript (inkl. Save-Reload mitten in Q1: Katze folgt
nach Reload NICHT mehr, Quest-Status bleibt); Schlossgeist-Hinweise ändern
sich mit dem Spielstand (3 Spielstände testen); Dialog-UI blättert sauber;
E kollidiert nicht mit bestehenden Tasten.

---

## 7) Phase W6 — Das Spinnennest im Ostwald (`grove.js`)

- Hain bei (150, 60): 8 besonders dichte dunkle Bäume (eigener Mini-Batch),
  dazwischen 5 **Spinnennetze**: Ebenen mit prozeduraler Netz-Textur
  (Canvas: radiale + spiralige Linien, transparent — textures.js-Muster).
  3 davon versperren den Zugang zur Lichtung in der Mitte (Netz-Blocker!).
- **Netze brennen:** Incendio-Ziel-Registry pro Netz (accepts:['incendio']).
  ⚠️ Lehre 4: Ziel-Radius MUSS den eigenen Netz-Blocker überragen
  (Registry-Punkt ≥ 1.6 m vor dem Blocker platzieren oder Blocker beim
  Registrieren schmaler als den Trefferradius machen). Brennen: 1.5 s
  Orange-Glow + Partikel, dann Netz + Blocker weg. Persistiert NICHT —
  Netze sind nach Reload wieder da (Spinnen weben nach — kein Save-Feld).
- **4 Riesenspinnen** (creatures.js-Bürger, volles Muster): Körper 2 Kugeln +
  8 Bein-Ketten (je 2 Segmente, Lauf-Animation über Phasenversatz), dunkel
  mit rotem Augen-Glow (Sprite AUSSERHALB des Kopf-Meshes — Lehre 7!).
  `radius 0.8, hitY 0.5`, hp 2, Stupor 1 dmg / Incendio 2 (One-Shot).
  FSM: lauern (bewegungslos an Bäumen — unheimlich!) → aggro < 9 m
  (schnelles Krabbeln 4.5 m/s, Kontakt 0.5 dmg + Rückstoß) → Tod (Beine
  einklappen, Fade — Sterbeanimation läuft VOR Culling-Return, Lehre 6).
  Respawn nach 120 s. Leine: Hain-Radius 35 (harter Clamp — Lehre 14!).
- **Lichtung:** Truhe mit **Herz-Upgrade #2 (max 6 → 7)** —
  `health.upgradeMaxHearts(7)`, Save über pz.maxHearts (existiert schon,
  KEINE Save-Migration nötig). Truhe öffnet per Nähe (Troll-Truhen-Muster,
  inkl. der `dead`-Zustand-Lektion 5).
- Sound: Skitter-Rascheln (schnelle Noise-Ticks) bei Aggro, EIN Node-Set.

✅ **DoD W6:** Netze blockieren physisch, brennen einzeln weg (Ziel-vs-
Blocker-Test: 10 Schüsse aus Spielwinkel treffen 10/10); Spinnen lauern/
jagen/sterben sauber, überschreiten NIE Radius 35 (Stresstest wie N2-Leine);
Truhe gibt 7. Herz genau einmal (Reload-Test); Pixie/Geist/Troll/Dementor-
Regression grün.

---

## 8) Phase W7 — Besenflug & Quidditch-Parcours (`broom.js`)

### 8.1 Freischaltung & Besen
- **Besenschuppen** am Quidditch-Feld (−155, 10): kleiner Holzschuppen,
  darin Besen an der Wand. Interakt „E — Besen nehmen": einmalig, Toast
  „🧹 Ein Rennbesen! (B zum Auf-/Absteigen)", `besen:1` in Save v4.
  KEINE Vorbedingung (der Besen soll früh Spaß machen — Balancing über
  die Welt selbst, nicht über Gates).
- **Besen-Modell:** Stiel + Reisig-Bündel (Kegel aus jitter-Zylindern),
  im Flug als Kamera-Kind sichtbar (unten ins Bild ragend, wie der
  Zauberstab — der Stab wird währenddessen ausgeblendet).

### 8.2 Flugmodus (player.js-Erweiterung, ~40 Zeilen — kein Umbau!)
- Taste B (nur wenn `besen:1`): `player.flying` togglen. Abstieg auch
  automatisch bei Bodenkontakt + Rückwärts/Idle 1 s.
- Im Flug: Schwerkraft aus; W = Flug in BLICKRICHTUNG inkl. Pitch (das
  fühlt sich sofort richtig an, keine Extra-Tasten), S bremst/rückwärts
  langsam, Leertaste = sanft steigen, Shift = Boost (18 m/s statt 12).
  Träge Beschleunigung (accel-Lerp wie am Boden, aber weicher).
- **Grenzen:** Höhe hart geclampt auf terrainHeight+50 UND absolut y ≤ 75
  (Positions-Clamp am Ende von update() — Lehre 14, kein „Zurücksteuern");
  WORLD_BOUND-Clamp wirkt weiter; resolveBlockers läuft weiter (Türme
  bleiben solide). Schwimmen + Fliegen schließen sich aus (Wasser = Abstieg).
- FOV-Kick + Windrauschen ∝ Geschwindigkeit (audio.windGain-Ziel anheben),
  fx.trail dezent hinterm Besen (gold NUR mit Quidditch-Trophäe, sonst weiß).
- Kreaturen-Interaktion: Dementoren-Frost wirkt auch in der Luft (Moor
  bleibt gefährlich!), Pixies/Weide ignorieren Flieger über 6 m Höhe.

### 8.3 Quidditch-Parcours
- Interakt am Feld-Mittelkreis: „E — Ringe-Rennen starten" (nur mit Besen).
  12 goldene Ringe (Torus r 2.2) in einer Route: Feld-Slalom → Bogen über
  die Tribünen → weiter Bogen Richtung See-Ufer → zurück zum Feld.
  Aktiver Ring glüht + HUD-Kompasspfeil (Tracker-Muster wiederverwenden),
  Durchflug = Glocken-Ping + nächster Ring. Timer im puzzle-status-HUD.
- Abbruch: Absteigen oder > 120 s. **Bestzeit** in Save v4.
- **Belohnung < 75 s:** „🧹 Quidditch-Ass" — Menü-Statuszeile + goldener
  Flug-Trail dauerhaft. (Reine Kosmetik — kein Gameplay-Zwang.)

✅ **DoD W7:** Auf-/Absteigen robust (10× Toggle-Test inkl. über Wasser,
im Moor, auf dem Viadukt); Höhen-/Welt-Clamp hält im Stresstest (Frame-für-
Frame-Max wie N2-Leinen-Test); Parcours end-to-end per Skript (Ringe
sequenziell abfliegen, Bestzeit gespeichert, Trophäe nach Reload da);
Schloss aus 50 m Höhe: Screenshot + 55 FPS (Fernsicht ist der teuerste
Fall — hier den Post-FX-Fallback prüfen!).

---

## 9) Phase W8 — Balancing, Politur & finaler Deploy

- Balancing-Tabelle (Abschnitt 11) gegen echtes Spielgefühl; alle neuen
  Toast-/Dialog-Texte auf Ton-Konsistenz (poetisch-knapp, wie bisher).
- README: Wetter, Dorf & Zug, NPCs & Quests, Spinnennest, Weide, Besen +
  Quidditch, Grafik-Modus, neue Tasten (E, B). Steuerungs-Grid im Menü.
- Performance-Pass: alle 6 Benchmark-Spots + NEU: Dorf-Platz (−70,−230) und
  Flug-Panorama (0, 80, aus 50 m) — Ziel ≥ 55 FPS in `Schön`, 60 in `Schnell`.
- Draw-Call-Audit: jede neue Zone ≤ 3 Calls (Batch-Kontrolle via
  renderer.info an den neuen Spots).
- 100%-Durchlauf-Skript: Q1 + Q2 + Weide-Truhe + Spinnen-Truhe (7 Herzen) +
  Besen + Parcours-Trophäe + ein voller Wetterzyklus — in EINER Kette grün.
- Optional (NUR wenn alles andere fertig und stabil): generative Ambient-
  Musik (WebAudio-Pads, 2 Akkorde, sehr leise, Menü-Toggle default AUS).
  Kill-Kriterium: klingt es nach 2 Stunden nicht gut → ersatzlos streichen.
- Finaler Deploy + Memory-Abschluss.

---

## 10) Automatisierte Abnahme-Tests (Muster)

```js
const g = window.__game;
g.start(); g.gott();
localStorage.removeItem('hogwarts3d-save-v1'); // Lehre 17!

// Wetter:
g.weather.set('sturm'); g.step(120);
assert(g.weather.windStrength > 0.8 && regenPartikelSichtbar);

// Zug (Fahrplan vorspulen statt warten):
g.train.timer = 0; g.step(600);
assert(g.train.state === 'halt' && Math.abs(g.train.pos.x - (-140)) < 15);

// NPC-Quest Q1:
g.teleport(/* Lena */); g.interact.trigger();      // Dialog + Quest an
g.teleport(-88, 152); g.interact.trigger();        // Katze anpsrechen
g.teleport(/* Lena */); g.step(60);
assert(save.quests.katze === 2 && g.health.hearts === g.health.maxHearts);

// Spinnen-Leine (Stresstest wie N2):
const s = g.grove.spiders[0]; s.pos.set(150+60, s.pos.y, 60); s.state='aggro';
for (let i=0;i<300;i++){ g.step(1); assert(dist(s, [150,60]) <= 35 + 1e-9); }

// Besen-Höhenclamp:
g.broom.mount(); g.player.pos.y = 200; g.step(5);
assert(g.player.pos.y <= 75 + 1e-9);
```
Und wie immer: mindestens EIN echter Durchlauf von Hand mit Screenshots
(Sturm überm Schloss, Zug-Einfahrt, Dorf bei Nacht, Dialog-Box, Spinnenhain,
Flug-Panorama, Schön-vs-Schnell-Vergleich).

---

## 11) Balancing-Tabelle (Startwerte — HIER ändern, nicht im Code verstreuen)

| Wert | Start |
|---|---|
| Wetter: Phasendauer / Übergang | 120–300 s / 15 s |
| Regen-Partikel / Sturm-Blitzabstand | 700 / 8–20 s |
| Zug: Periode / Halt / Tempo | 240 s / 20 s / 9 m/s |
| Kamin-Heilung Cooldown | 60 s |
| NPC-Gehtempo / Katze-Follow-Teleport | 1.2 m/s / > 25 m |
| Weide: Telegraph / Schaden / Radius / Cooldown | 1 s / 0.5 ♥ / 5 m / 3 s |
| Spinne: hp / dmg / aggro / Tempo / Respawn / Leine | 2 / 0.5 ♥ / 9 m / 4.5 m/s / 120 s / 35 m |
| „Warm ums Herz": Frost-Faktor | ×0.75 (multiplikativ zur Laterne) |
| Besen: Tempo / Boost / Höhenlimit | 12 / 18 m/s / terrain+50, abs. 75 |
| Quidditch: Ringe / Trophäen-Zeit / Abbruch | 12 / < 75 s / 120 s |
| Post-FX: Bloom-Stärke / Degradation | 0.35 / < 50 fps Bloom aus, < 42 ganz aus |

---

## 12) Save v4 & Menü

```js
{ v: 4, …alles aus v3…,
  grafik: 'schoen' | 'schnell',          // default 'schoen'
  quests: { katze: 0|1|2, kraeuter: 0-3, kraeuterDone: 0|1 },
  besen: 0|1, quidditchBest: null|Sekunden, quidditchAss: 0|1 }
```
- Migration v3→v4: alle Felder mit Defaults (`?? `), NIE crashen.
- Reset-Button: quests/besen/quidditch zurück, `npc.restore()`, Grafik-Wahl
  bleibt (ist eine Einstellung, kein Fortschritt).
- Menü: Button „Grafik: Schön/Schnell"; Statuszeilen „🧹 Quidditch-Ass" und
  „🔥 Warm ums Herz" (Muster hauspokal-status/lantern-status).

---

## 13) ⚠️ Stolperfallen — 19 gesammelte Lehren aus 13 Phasen (NICHT neu entdecken!)

1. **rAF friert** in inaktiven Preview-Tabs → Tests IMMER über `__game.step(n)`.
2. **Preview dient aus dem Scratchpad** → nach jedem Edit rsync; launch.json-Pfad pro Session neu.
3. **Plan-Koordinaten ≠ echte Geometrie** → vor JEDEM Bauen Explore-Agent + Distanz-Mathe gegen Zonen-Tabelle 1.2. Zwei Shapings nur mit ≈gleicher Zielhöhe überlappen lassen.
4. **Ziel-Registry vs. Blocker:** `pointBlocked()` gewinnt vor der Registry → Ziele ≥ Blocker-Radius + 0.8 m absetzen (Spinnennetze W6!).
5. **FSM-Endzustände fressen Folgelogik:** blindes `if (dead) return` verschluckt Truhen/Ausklang-Animationen (3× passiert). Bei JEDEM Endzustand fragen: „Was muss hier trotzdem laufen?"
6. **Zustands-Abschlüsse nie hinter Distanz-Culling** — Sterbe-/Timer-Enden VOR dem Culling-Return.
7. **Sprites in opaker Geometrie:** Additiv-Blending ändert den Tiefentest NICHT — Anker außerhalb des Meshes (Spinnen-Augen!).
8. **Treffer-Anker ≠ Fußpunkt:** Kreaturen mit Fußpunkt-pos brauchen `hitY` auf die visuelle Mitte; Tests zielen auf `pos.y + hitY`.
9. **Teleport landet in Objekten:** Position NACH `player.update(0)` neu lesen, bevor Yaw/Pitch gerechnet wird.
10. **Feder-Physik hinkt bewegten Zielen nach** → vor Positions-Asserts ~1 s stillhalten.
11. **Yaw-Konvention:** yaw=0 blickt nach −z. Für castAt aufs XZ-Ziel: `yaw = atan2(-dx, -dz)` (dx/dz = Ziel−Spieler) — das Minus vor dx dreimal falsch gemacht.
12. **Geteilte Materialien clonen**, wenn opacity/color pro Objekt animiert wird; mergeGeometries nur mit uv+normal-Primitiven durch tint().
13. **Punktlicht-Budget hart:** dieses Update = genau 1 neues Dauerlicht (Kamin). Laternen/Zug/Gewächshaus = Sprites.
14. **Harte Grenzen sind Positions-Clamps,** kein Zurücksteuern — am ENDE von update() klemmen (Dementor-Leine-Lehre; gilt für Spinnen-Leine UND Besen-Höhe).
15. **Kein `{...state, methoden}`-Spread** bei Objekten mit extern lesbaren/schreibbaren Primitiven — EIN Objekt, das über `this` liest/schreibt (moor.js-Lehre).
16. **buildStep-Reihenfolge = Abhängigkeits-Graph:** Wer fx/audio/hud braucht, kommt NACH deren Erzeugung (buildMoor-Lehre). weather vor sky-Nutzern, interact vor npc.
17. **localStorage zwischen Testläufen leeren** — alte Saves lassen neue Tests stumm scheitern.
18. **Tone-Mapping doppelt sich in Post-Passes:** Fullscreen-Quad-Materialien `toneMapped: false`, sonst wäscht ACES zweimal (W2!).
19. **In rohen ShaderMaterials nie ein Attribut `color` nennen** (three deklariert es nur mit vertexColors:true selbst) — eigene Namen wie `pColor` (Regen-Shader W1!).

---

## 14) Was NICHT bauen (Scope-Schutz)

- ❌ Zug-Mitfahren / Schnellreise — der Zug ist Atmosphäre
- ❌ NPC-Pathfinding — Waypoints + Nachteleport reichen völlig
- ❌ Kampf-NPCs, Handel, Inventar, Geld — Quests belohnen direkt
- ❌ Echte Innenräume für alle Dorfhäuser — nur das Gasthaus (Nischen-Muster)
- ❌ Quidditch mit Bällen/Gegnern — der Ringe-Parcours IST das Minispiel
- ❌ Schnee-/Jahreszeiten-System — Wetter bleibt bei 4 Zuständen
- ❌ Keine Namen/Figuren aus den Büchern für NEUE Inhalte — eigene Namen
  (Eulenbrück, Singender Kessel, Lena, Barnaby, Musch)
- ❌ Keine externen Assets/Libraries — „alles prozedural" bleibt Markenzeichen

Wenn eine Phase aus dem Ruder läuft: Feature halbieren, nicht die Qualität.
Reihenfolge W1→W8 ist bewusst: Atmosphäre zuerst (sofort sichtbar), Welt
dann, der Besen als Krönung — jede Phase ist für sich ein fertiges Update.

---

*Das Schloss steht, das Moor liegt hinter dir, Sonnet — jetzt erweck die*
*Welt zum Leben. 🌍🧹 — Fable*
