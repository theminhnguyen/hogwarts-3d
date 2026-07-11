# ⚡ Magie-Update: Zauberstab, Kreaturen & Rätsel

> **Implementierungsplan** für Hogwarts 3D — geschrieben von Fable, umzusetzen mit Sonnet.
> Stand: 2026-07-10. Basis-Commit: `faf3c06` (main auf github.com/theminhnguyen/hogwarts-3d).
>
> **Lies dieses Dokument komplett, bevor du die erste Zeile schreibst.**
> Abschnitt 0 (Arbeitsumgebung) und Abschnitt 12 (Stolperfallen) ersparen dir Stunden.

---

## Vision in einem Satz

Der Spieler hält durchgehend einen Zauberstab in der Hand (Ego-Perspektive wie in
einem Shooter), wirkt damit vier verschiedene Zauber, verteidigt sich gegen
Wichtel und Schattengeister, löst vier ortsgebundene Rätsel mit den passenden
Zaubern und gewinnt am Ende — wenn alle 12 Schnätze UND alle 4 Artefakte
gesammelt sind — den „Hauspokal“ mit Feuerwerk über dem Schloss und einem
silbernen Patronus-Hirsch, der durchs Tal galoppiert.

**Spielgefühl-Ziele:**
- Der Stab fühlt sich *lebendig* an: er wippt beim Gehen, neigt sich beim Sprinten,
  zuckt beim Zaubern, seine Spitze glüht in der Farbe des gewählten Zaubers.
- Zaubern ist *knackig*: kurzer Lichtblitz an der Spitze, leuchtendes Projektil
  mit Funkenschweif, satter Treffer-Effekt, Sound mit Charakter.
- Kreaturen sind *Charaktere*, keine Zielscheiben: Wichtel sind frech (sie klauen
  Schnätze!), Schattengeister sind unheimlich (nur nachts, fliehen vor Lumos).
- Rätsel benutzen die Zauber *mechanisch* (nicht nur „drücke E“): entzünden,
  schweben lassen, in Reihenfolge treffen, auf Sterne zielen.

---

## 0) Arbeitsumgebung & Erste Schritte (WICHTIG — zuerst tun!)

Das Projekt liegt kanonisch in `~/Downloads/outputs/hogwarts-3d/`.
GitHub: `theminhnguyen/hogwarts-3d`, live auf https://theminhnguyen.github.io/hogwarts-3d/.

1. **Git-Historie prüfen/herstellen.** Die Downloads-Kopie hat evtl. KEINEN
   `.git`-Ordner (macOS-TCC-Zwischenfall in der Vorsession — siehe Memory
   `hogwarts-3d-project`). Falls `.git` fehlt:
   ```bash
   gh repo clone theminhnguyen/hogwarts-3d /tmp/hg-clone
   diff -rq /tmp/hg-clone ~/Downloads/outputs/hogwarts-3d --exclude .git   # muss leer sein (bis auf PLAN-MAGIE.md)
   mv /tmp/hg-clone/.git ~/Downloads/outputs/hogwarts-3d/.git && rm -rf /tmp/hg-clone
   git -C ~/Downloads/outputs/hogwarts-3d status   # sauber?
   ```
2. **Preview-Setup.** Der Preview-Launcher darf u. U. NICHT auf ~/Downloads
   zugreifen (TCC). Bewährtes Muster:
   - Spiegel ins eigene Session-Scratchpad legen:
     `rsync -a --delete --exclude .git ~/Downloads/outputs/hogwarts-3d/ "$SCRATCHPAD/hogwarts-3d/"`
   - `~/Downloads/outputs/.claude/launch.json`: den `hogwarts`-Eintrag auf den
     NEUEN Scratchpad-Pfad umbiegen (bash -c "cd <scratchpad>/hogwarts-3d && exec node dev-server.mjs", Port 8123).
   - **Nach jedem Edit in Downloads: rsync erneut**, dann im Preview-Tab reloaden.
3. **Testen im Preview:** `window.__game` existiert (siehe Abschnitt 10).
   Pointer-Lock klappt im Preview nicht → `__game.start()` nutzt den Fallback.
   **rAF friert in inaktiven Tabs ein** → für Simulation IMMER `__game.step(n)`
   statt echter Wartezeit benutzen.
4. **Committen:** direkt auf `main`, deutsche Commit-Messages, am Ende
   `git push` (ist in settings.local.json allowlisted). Falls der
   Sicherheits-Classifier ausfällt (Fehler „temporarily unavailable“):
   Deployment über `gh api` Git-Data-Flow (Blobs → Tree → Commit → PATCH ref) —
   funktioniert nachweislich, Rezept im Memory.

---

## 1) Neue Dateien & Architektur-Überblick

```
src/
├── wand.js       NEU  – Zauberstab-Modell, Animation, Spitzen-Glow, Spruchwahl
├── spells.js     NEU  – Projektile, Treffer-Logik, Leviosa-Greifmodus, Ziel-Registry
├── creatures.js  NEU  – Wichtel, Schattengeister, (optional) Troll; FSM-KI
├── puzzles.js    NEU  – 4 Rätsel + Artefakte + Truhen + Finale (Feuerwerk/Patronus)
├── fx.js         NEU  – Partikel-Pool, Screen-Shake, Floating-Sparks, Feuerwerk
├── health.js     NEU  – Herzen, Schaden, Respawn (bewusst klein & separat)
└── (bestehend)   main.js, player.js, hud.js, audio.js … werden erweitert
```

**Datenfluss pro Frame** (Erweiterung von `frame(dt)` in main.js — die Reihenfolge ist wichtig):
```
player.update(dt)
wand.update(dt, moveState, spells.activeSpell, lumosOn)
spells.update(dt, player, creatures.list)        // bewegt Bolzen, prüft Treffer
creatures.update(dt, player, sky.state, lumosOn) // KI, Angriffe → health.damage()
puzzles.update(dt, player, sky.state)
fx.update(dt)
health.update(dt)                                 // Regeneration, Respawn-Fade
… (bestehende Updates: sky, castle, life, collectibles, …)
```

**Grundsätze** (gelten für ALLE neuen Systeme):
- Kein einziges externes Asset. Alles aus Primitiven + `tint()` + Canvas-Texturen.
- Alles Bewegliche wird **gepoolt** (Projektile, Partikel, Kreaturen respawnen statt new).
- Geometrien & Materialien **einmal pro Gattung** erzeugen, von allen Instanzen geteilt.
  Ausnahme: Materialien, deren `opacity` PRO OBJEKT animiert wird → `material.clone()`
  (Lektion aus dem Rauch-Bug der Vorsession).
- Punktlichter sind teuer: **max. 3 gleichzeitige Zauber-Lichter** (Licht-Pool),
  sonst nur additive Sprites.

---

## 2) Der Zauberstab (`src/wand.js`)

### 2.1 Modell (prozedural, ~200 Dreiecke)

Gruppe `wandRoot`, als Kind der **Kamera** (nicht der Szene!) — dadurch klebt er
automatisch am Blick:

```
camera.add(wandRoot);
wandRoot.position.set(0.28, -0.24, -0.45);   // rechts unten im Bild
wandRoot.rotation.set(-0.1, 0.15, 0.05);
```

> ⚠️ Wenn die Kamera einer Szene hinzugefügt werden muss, damit Kinder gerendert
> werden: `scene.add(camera)` einmalig in main.js ergänzen (three rendert
> Kamera-Kinder sonst nicht immer korrekt mit).

Aufbau (alle Teile in ein `GeoBatch`-Merge ODER als Einzelmeshes in die Gruppe —
Einzelmeshes sind hier okay, es ist EIN Stab):
- **Schaft:** `CylinderGeometry(0.008, 0.016, 0.42, 7)`, leicht gebogen wirken
  lassen: 2 Segmente mit minimal versetztem Winkel, Farbe `0x4a3020` (Holz),
  `flatShading: true` für den stilisierten Look.
- **Griff:** `CylinderGeometry(0.019, 0.021, 0.12, 7)` mit 2 Zier-Ringen
  (`TorusGeometry(0.02, 0.004, …)`), Farbe `0x2e1d12`.
- **Spitze:** kleine Kugel `SphereGeometry(0.007, 6, 5)`, Farbe cream.
- **Spitzen-Glow:** `Sprite` (makeGlowTexture, additiv), Grundscale 0.06;
  Farbe = Farbe des aktiven Zaubers; pulsiert leicht (`0.9 + sin(t*3)*0.1`).
- **Spitzen-Licht:** `PointLight(farbe, 0, 6, 2.0)` — Intensität 0 im Idle,
  blitzt beim Cast auf 8 und klingt in 0.25 s ab. **Lumos wandert hierher**:
  Wenn Lumos aktiv ist, leuchtet dieses Licht dauerhaft (Intensität
  `4 + nightGlow*22`, distance 20) — das bisherige Lumos-Licht in main.js
  wird ERSETZT (Code dort entfernen, API `lumosOn` bleibt).

`get tipWorldPos()`: Spitzen-Objekt (`this.tip`) → `tip.getWorldPosition(v)`.
Wird von spells.js als Abschusspunkt genutzt.

### 2.2 Animations-Zustandsmaschine

Zustände überlagern sich als Offsets auf `wandRoot.position/rotation` (Basiswerte
oben nie überschreiben, immer Basis + Offset rechnen!):

| Zustand    | Effekt                                                                 |
|------------|------------------------------------------------------------------------|
| Idle       | sanftes Atmen: `y += sin(t*1.6)*0.004`, `rotZ += sin(t*1.1)*0.01`      |
| Gehen      | nutzt `player.bobPhase`: `y += sin(bobPhase*2)*0.012`, `x += cos(bobPhase)*0.008` |
| Sprint     | Stab neigt sich nach vorn-unten: lerp zu `rotX -0.35, y -0.05` (250 ms) |
| Cast       | 180 ms: schneller „Flick“ — `rotX` von −0.5 auf +0.15 (easeOut), dann 220 ms zurück (easeIn). Währenddessen Glow-Sprite ×2.2 skalieren |
| Leviosa-Halten | Stab zeigt leicht nach oben (`rotX +0.2`), Spitze kreist minimal (Radius 0.005) |
| Spruchwechsel  | 150 ms kleiner Dreher um Z (±0.4 rad) + Glow-Farbe cross-faden     |

Implementierung: einfacher Timer + Lerp, KEINE Tween-Library. `playCast()` setzt
`castT = 0`; update() rechnet die Kurve.

### 2.3 Spruchauswahl

```js
export const SPELLS = {
  stupor:   { name: 'Stupor',   color: 0xff4a4a, cooldown: 0.45 },
  incendio: { name: 'Incendio', color: 0xff9a2e, cooldown: 0.9  },
  leviosa:  { name: 'Leviosa',  color: 0xb08cff, cooldown: 0.2  },
  lumos:    { name: 'Lumos',    color: 0x9fc4ff, cooldown: 0.3  },
};
```
- Tasten `1–4` und **Mausrad** (wheel-Event, deltaY-Vorzeichen) wechseln.
- `Digit1..4` in main.js-Keydown-Handler (nur wenn `playing`).
- Beim Wechsel: HUD-Leiste aktualisieren (Abschnitt 8), kleiner „blip“-Sound.
- **Lumos ist ein Toggle**, kein Projektil: Cast schaltet an/aus (ersetzt Taste L;
  L bleibt als Shortcut und wählt Lumos + toggelt).

---

## 3) Zauber-System (`src/spells.js`)

### 3.1 Projektil-Pool

24 vorallozierte Bolzen. Ein Bolzen =
- Kern: `Sprite` (glowTex, additiv, Spruchfarbe), Scale 0.5–0.7,
- Schweif: pro Frame 2 Funken-Partikel an der Position in den fx-Pool spucken,
- optional 1 Licht aus dem **Licht-Pool** (3 × `PointLight(color, 12, 10, 2)`),
  nur die 3 jüngsten aktiven Bolzen bekommen eins.

```js
{ active, spellId, pos: Vector3, vel: Vector3, ttl, light|null }
```

**Cast** (`cast()`, von main.js bei `mousedown` wenn `playing` && Cooldown ok):
1. `wand.playCast()`, Audio `castSound(spellId)`.
2. Richtung = Kamera-Blick (`camera.getWorldDirection`), Start = `wand.tipWorldPos`
   + 0.15 × Richtung.
3. Stupor: speed 46 m/s, ttl 2.2 s. Incendio: speed 34, ttl 2.0, Bogenflug:
   `vel.y -= 9*dt` (Feuerball fällt leicht — wichtig fürs Feuerschalen-Rätsel-Gefühl).
4. Leviosa & Lumos erzeugen KEINE Bolzen (Sonderlogik unten).

**Flug & Kollision** (pro Bolzen pro Frame, in dieser Reihenfolge):
1. `pos += vel*dt`; ttl ablaufen → despawn mit Mini-Puff (4 Partikel).
2. **Gelände:** `pos.y < terrainHeight(pos.x, pos.z)` → Einschlag.
3. **Wasser:** `pos.y < WATER_LEVEL` und im See-Bereich → „Zisch“-Puff (weiß-blau), despawn.
4. **Blocker:** neuer Helper in geo.js:
   ```js
   export function pointBlocked(x, y, z) {
     for (const b of colliders.blockers) {
       if (y < b.minY || y > b.maxY) continue;
       if (b.kind === 'circle') { … dist² < r² … } else { … AABB-Test … }
     }
   }
   ```
   (≈500 Blocker × ≤24 Bolzen = trivial. Early-out: erst grobe |dx|+|dz|-Schranke.)
5. **Kreaturen:** Kugel-Test gegen `creatures.list` (`distSq < (radius+0.35)²`)
   → `creatures.applyHit(c, spellId, vel.normalized)`.
6. **Rätsel-Ziele:** Kugel-Test gegen die **Ziel-Registry** (unten).

**Einschlag-FX:** `fx.burst(pos, farbe, 16, 6)` + kurzer Lichtblitz (Licht-Pool,
0.15 s) + Screen-Shake NUR bei Nahtreffern (<3 m, Stärke 0.15).

### 3.2 Ziel-Registry (Bindeglied zu den Rätseln)

```js
spells.registerTarget({
  kind: 'brazier' | 'rune' | 'star' | 'leviObj' | 'pumpkin',
  getPos: () => Vector3,      // oder feste pos
  radius: 0.9,
  accepts: ['stupor','incendio'],   // welche Sprüche wirken
  onSpell(spellId, hitPos) { … }    // Rückruf ans Rätsel
});
```
puzzles.js registriert seine Ziele hier; spells.js bleibt dumm und generisch.
**Sterne** (fürs Sternbild-Rätsel) werden NICHT von Bolzen getroffen, sondern per
Blickwinkel: beim Cast von Stupor prüft spells.js zusätzlich alle `kind:'star'`-Ziele:
Winkel zwischen Blickrichtung und Richtung zum Ziel < 2° → Treffer (die Sterne
sind „unendlich weit“ — Bolzen fliegt trotzdem los, reine Kosmetik).

### 3.3 Wingardium Leviosa (der Greif-Zauber)

Kein Projektil, sondern ein Modus:
- Cast mit Leviosa: Raycast-artiger Check — nächstes `kind:'leviObj'`-Ziel im
  Umkreis 7 m UND im Blickkegel (< 12°). Gefunden → **Halten beginnt**.
- Während Halten (`mousedown` gehalten ODER Toggle — nimm **Halten = solange
  Maustaste gedrückt**, das fühlt sich magischer an):
  - Zielposition des Objekts = Kamera + Blickrichtung × 4 m, Höhe geklemmt auf
    `terrainHeight+0.5 … +4`. Objekt folgt per Feder: `objVel += (target-objPos)*8*dt; objVel *= 0.85`.
  - Objekt bekommt lila Glow-Sprite + 1 Funke/Frame.
  - Stab in Leviosa-Halten-Pose (Abschnitt 2.2).
- Loslassen: Objekt fällt (einfache Gravitation, landet auf `terrainHeight` oder
  auf einer Druckplatte — puzzles.js prüft die Position beim Landen).
- Die 2 Steinblöcke im Nordgarten sind die einzigen leviObj (bewusst!). Sie haben
  Kreis-Blocker (r 0.7), der beim Schweben deaktiviert und beim Landen an der
  neuen Position neu gesetzt wird (Blocker-Objekt behalten, Felder mutieren).

---

## 4) Kreaturen (`src/creatures.js`)

Gemeinsame Basis:
```js
{ id, species, group: THREE.Group, pos (=group.position), vel, hp, maxHp,
  state: 'idle'|'wander'|'aggro'|'attack'|'hitstun'|'dying'|'dead',
  stateT, homePos, radius, respawnT }
```
`update` läuft NUR für Kreaturen < 140 m vom Spieler (Distanz-Culling, Rest friert
ein und `group.visible=false` ab 160 m).

### 4.1 Wichtel / Pixies 🧚 (frech, tagsüber & nachts)

**Look** (~120 Dreiecke): Körper `SphereGeometry(0.16, 6, 5)` gequetscht (1, 0.8, 0.9),
Farbe `0x3fb8d4` (kobaltblau-türkis), flatShading; Kopf kleinere Kugel mit zwei
winzigen dunklen Augen-Kugeln; Ohren: 2 Mini-Kegel; Flügel: 2 `PlaneGeometry(0.22, 0.12)`
(DoubleSide, halbtransparent weiß, opacity 0.6), flattern via `rotation.z = ±sin(t*28)`;
dezenter cyan Glow-Sprite (Scale 0.5).

**Spawns:** 3 Schwärme à 5: Waldlichtung `(95, 105)`, Schluchtrand `(-30, 80)`,
Hagrid-Wald `(150, 170)`. Home-Radius 25 m.

**FSM:**
- `wander`: Lissajous-Flug um homePos (y = terrain+1.5…4), Geschwindigkeit 3.
- → `aggro` wenn Spieler < 14 m: umkreist den Spieler (Orbit r 6, y +2.5),
  freches Kichern-SFX alle 2–4 s.
- → `attack` alle 3.5–5 s: Sturzflug auf Spielerkopf (speed 14). Trifft er
  (< 0.8 m): `health.damage(0.5, dir)`, kleiner Shake, Pixie prallt weg.
- `hitstun` 0.4 s bei Treffer (zurückgeschleudert: `vel = knockDir*10 + up*4`).
- **hp 2** (Stupor: 1 Schaden, Incendio: 2). `dying`: 0.5 s Taumeln + Scale→0,
  `fx.burst(cyan, 24)`, Kicher-Abgang. Respawn nach 90 s am homePos.

**🎁 Signature-Feature — Schnatz-Diebe:** Wenn ein Pixie im `wander` einem
NICHT eingesammelten Schnatz < 10 m kommt, klaut er ihn: Schnatz-Group hängt ab
sofort 0.4 m unter dem Pixie (collectibles bekommt `carriedBy`-Feld; sein
update überspringt Bobbing solange). Pixie besiegt → Schnatz fällt an Ort und
Stelle zu Boden (baseY neu = terrain+1.5). Der HUD-Kompass zeigt automatisch auf
die neue Position (nearest() nutzt group.position — funktioniert ohne Änderung).
Toast beim ersten Diebstahl: „⚡ Ein Wichtel hat einen Schnatz geklaut! Hol ihn dir zurück!“

### 4.2 Schattengeister 👻 (unheimlich, NUR nachts)

**Look** (~90 Dreiecke): offener, gejitterter Kegel als Umhang
(`ConeGeometry(0.5, 1.6, 8, 3, true)` + jitter(0.12)), Material
`MeshLambertMaterial({ color: 0x11131f, transparent: true, opacity: 0.85, flatShading: true, side: DoubleSide })` —
**pro Geist geklont** (Fade-Animationen!). Kapuzen-Kugel oben, KEIN Gesicht,
nur 2 schwach glimmende Augen-Sprites (blassblau, klein). Schwebt sinusförmig
0.6–1.1 m überm Boden, Umhangsaum „weht“: `cone.rotation.y += 0.3*dt` reicht als Illusion.
Kalter Glow-Sprite (blau, groß, opacity 0.15) darunter.

**Spawns (je 2):** Steinkreis `(150, -95)`, Nordgarten `(0, -75)`, Schluchtboden `(-20, 94)`.

**Aktivität:** nur wenn `sky.state.nightGlow > 0.5`. Tagsüber: `dead` + unsichtbar
(im Morgengrauen ausfaden über 3 s — opacity animieren).

**FSM:**
- `wander`: langsames Driften (speed 1.2) um homePos (r 18).
- → `aggro` Spieler < 20 m: direkter Drift auf den Spieler zu, speed 2.6,
  tiefes Drone-SFX (loopendes Pad in audio.js, gain ∝ Nähe).
- **Kälte-Aura:** Spieler < 6 m → HUD-Vignette wird stärker + Farbton kälter
  (CSS-Variable `--cold: 0..1` auf #vignette, siehe 8.3) + Wind-Gain steigt.
  Bei Berührung (< 1.1 m): `health.damage(1, dir)` + starker Shake + Geist
  teleportiert 8 m zurück (damit er nicht dauerschadet).
- **Lumos-Furcht 💡:** `lumosOn` && Spieler-Distanz < 9 m → Zustand `flee`:
  weht mit speed 5 vom Spieler weg (min. 16 m). DAS ist der taktische Konter —
  Lumos wird vom Deko-Feature zum Werkzeug.
- **hp 3** (nur Stupor wirkt; Incendio 1, Leviosa/Lumos 0). Tod: Umhang kollabiert
  (scale.y→0, opacity→0, 0.7 s), `fx.burst(0x8fb0ff, 30)` + erleichterter
  Glockenton. Respawn nächste Nacht (Respawn-Check: erst wenn nightGlow < 0.2
  UND wieder > 0.5, d. h. frühestens am Folgeabend).

### 4.3 Troll 🧌 (optional, Phase „Bonus“ — nur wenn alles andere steht)

Ravine-Miniboss bei `(-40, 94)`: 3.2 m großer Klops aus Kugeln/Zylindern
(graugrün, flatShading), Keule = Zylinder+Kugel. Patrouilliert den Schluchtboden.
Aggro < 16 m: stapft auf Spieler zu (speed 3.4). Attacke mit **Telegraph**:
0.8 s Keule heben (rot glühender Ring am Boden, r 3) → Slam: im Ring →
`health.damage(1.5)` + Shake 0.5. hp 12, Stupor staggert (0.6 s). Tod: Truhe
mit 5. Artefakt „Trollkeule“ erscheint … nein: Artefakt-Anzahl bleibt 4;
Troll bewacht stattdessen eine Truhe mit **Herz-Upgrade** (max-Herzen 5 → 6).
HUD-Bossbar oben mittig nur während Aggro (schmaler Balken, CSS).

### 4.4 Kürbis-Überraschung 🎃 (Mini-Gag, 20 Zeilen)

Incendio auf einen von Hagrids Kürbissen (registerTarget kind:'pumpkin'):
geschnitztes Grinsen leuchtet auf (Emissive-Overlay-Plane an der Kürbisfront +
warmes Licht 10 s). Kein Gameplay-Effekt. Einmal pro Kürbis. Erster Fund:
Toast „Jack-o'-Lantern! 🎃“.

---

## 5) Spieler-Gesundheit (`src/health.js`)

- **5 Herzen** (float, Schritte 0.5). `damage(amount, knockDir)`:
  - i-Frames 0.8 s (keine Doppeltreffer), roter Vignette-Blitz (CSS-Klasse
    `#vignette.hurt` 300 ms), Shake, Knockback: `player.vel += knockDir*7 + up*3`,
    Audio-Thud.
- **Regeneration:** +0.5 Herz alle 25 s ohne Schaden (Timer resettet bei Hit).
- **Brunnen heilt:** Innenhof-Brunnen < 4 m → voll heilen (1×/Minute), Glitzer-FX,
  Toast „Das Brunnenwasser wärmt dich. ♥ voll!“.
- **0 Herzen:** 1 s Weißblende (CSS overlay opacity), Respawn am Innenhof
  `teleport(0, 30, Math.PI)`, volle Herzen, Toast „Du wachst im Innenhof auf …“
  — **kein Verlust** von Schnätzen/Artefakten (freundliches Spiel, es sind Kinder unter den Spielern).
- **Friedlicher Modus:** Menü-Button „Kreaturen: zahm/wild“ (persistiert im Save).
  Zahm = Kreaturen existieren & fliehen bei Treffern, greifen aber nie an
  (FSM überspringt attack/aggro-Schaden). Default: wild.

---

## 6) Die vier Rätsel (`src/puzzles.js`)

Jedes Rätsel belohnt mit einer **Truhe**, aus der ein **Artefakt** schwebt
(HUD-Zähler „🏆 n/4“). Truhe: Box + Deckel (rotierender Deckel beim Öffnen,
Gold-Glow, Fanfare). Artefakt fliegt in einer Bogen-Animation zum Spieler
(0.8 s) und ploppt in den Zähler. Alles im Save (Abschnitt 9).

### R1 · Die Feuerprobe 🔥 (Incendio) — am Viadukt
- **3 Feuerschalen** (Stein-Kelch: Zylinder+Schale, oben Kohle-Kugeln) bei
  `(-5, 60)`, `(6, 76)`, `(-6, 92)` — auf/neben der Viadukt-Brüstung platziert
  (y = Deckhöhe via `platformGround(x, z, 10000)`).
- Incendio-Treffer entzündet: Flammen-Sprite (wie Fackeln, aber ×2) + Licht.
  **Alle 3 innerhalb von 45 s** (erste Zündung startet Timer, HUD-Hinweis
  „🔥 2/3 — 31 s“), sonst verlöschen sie (zisch).
- Belohnung: Unterm mittleren Viadukt-Pfeiler öffnet sich eine Steinplatte
  (Deko-Box gleitet zur Seite, 2 s, Rumpel-Sound) → **Grotte** (kleine Nische:
  3 Wände + Fackel) mit Truhe. Artefakt: **„Ewige Flamme“** (kleine Feuer-Urne).
- Hinweis-Schild am Viaduktanfang (Holzschild, E-Interakt = Toast):
  „*Drei Wächterinnen aus Stein frieren. Wärme sie schnell — sie sind ungeduldig.*“

### R2 · Der schwebende Garten 🪨 (Leviosa) — im Nordgarten
- 2 **Steinblöcke** (Box 0.9³, Runen-Gravur = dunklere Kanten via zweiter Box)
  bei `(-14, -62)` und `(14, -62)`; 2 **Druckplatten** (flacher Zylinder r 1.1,
  leuchtende Rune obendrauf) bei `(-6, -70)` und `(6, -70)`.
- Block landet auf Platte (XZ-Distanz < 1.0 beim Aufsetzen) → Platte leuchtet
  lila, tiefer „Klonk“. Beide belegt → die mittlere Hecke fährt ins Erdreich
  (Box skaliert y → 0.05, 1.5 s) und gibt ein verstecktes Beet frei: Truhe
  zwischen Glühwürmchen. Artefakt: **„Krone der Gründer“**.
- Schild: „*Was der Erde zu schwer, hebt der Wille empor. Zwei Wächter, zwei Betten.*“

### R3 · Das Lied der Steine 🎵 (Stupor, Simon-Says) — am Steinkreis
- 4 der 9 Steine (Indizes 0, 2, 4, 6) bekommen eine **Runen-Plane** (additives
  Sprite, je eigene Farbe: rot/grün/blau/gold).
- Spieler betritt den Kreis (< 9 m vom Zentrum) → Rätsel startet: Runen blinken
  nacheinander (0.6 s an, 0.3 s Pause) in zufälliger Sequenz. **Runde 1: 3 Steine,
  Runde 2: 4, Runde 3: 5.** Nachspielen = die Steine in der Reihenfolge mit
  Stupor treffen (jeder Treffer: Stein leuchtet + Ton — jeder Stein hat eine
  eigene Tonhöhe: Pentatonik d-f-g-a, klingt immer gut).
- Fehler: tiefer Brummton, rote Blitze, Runde neu (Sequenz bleibt). Verlassen
  des Kreises = Abbruch.
- Alle 3 Runden: Altar öffnet sich (Deckplatte hebt & dreht sich via Leviosa-artiger
  Schwebe-Anim) → Truhe. Artefakt: **„Singender Stein“**.
- Schild: „*Wir sprechen in Licht. Antworte in Blitzen — Ton für Ton.*“

### R4 · Das Sternbild des Hirschen ✨ (Stupor auf Sterne, nur nachts) — Astronomieturm
- Trigger-Zone am Turmfuß `(0, -80)`, r 10, nur `nightGlow > 0.5`. Beim Betreten:
  Toast „*Der Himmel wartet. Verbinde die fünf hellsten Sterne.*“ + 5
  **Ziel-Sterne** erscheinen: große funkelnde Sprites (Scale 8, pulsierend) an
  festen Himmelsrichtungen (Richtungsvektoren, Position = player + dir×1400,
  jeden Frame nachgeführt wie der Mond). Anordnung: grobes Hirsch-Muster
  (Kopf, 2× Geweih, Rumpf, Läufe — 5 Punkte, siehe Vektoren im Code-Kommentar).
- Stupor-Cast, während die Blickrichtung < 2° an einem Ziel-Stern liegt → Stern
  „rastet ein“ (heller, hört auf zu pulsieren, Glockenton aufsteigend), und eine
  **Lichtlinie** (THREE.Line, additiv, opacity 0.6) verbindet ihn mit dem zuvor
  getroffenen Stern.
- Alle 5 vor Morgengrauen: das Sternbild blitzt 3× auf, ein Sternschnuppen-Regen
  (fx: 12 Kometen-Sprites) fällt, am Turmfuß materialisiert die Truhe. Artefakt:
  **„Sternenkarte“**. Bei Tagesanbruch vorm Abschluss: Sterne verblassen, Fortschritt bleibt.

### 🏆 Finale: Der Hauspokal
Bedingung: **12/12 Schnätze UND 4/4 Artefakte.**
1. Fanfare (audio: 5-Ton-Hymne) + Toast „⚡ DER HAUSPOKAL GEHÖRT DIR! ⚡“ (8 s).
2. **Feuerwerk** über dem Schloss, 40 s: fx.firework() — Rakete (Partikel-Streifen
   aufsteigend) + Explosion (60 Partikel radial, Farbe zufällig aus den 4
   Hausfarben), alle 1.2 s eine, Doppelknall-Sound.
3. **Patronus-Hirsch** (nur nachts; tagsüber wartet er auf die nächste Nacht):
   stilisierter Hirsch aus ~8 gestreckten Kugeln/Kegeln, `MeshBasicMaterial`
   silberblau additiv halbtransparent + großer Glow — galoppiert eine große
   Acht über die Ländereien (Spline aus 8 Fixpunkten, LookAt in Laufrichtung,
   Gallop-Bob), hinterlässt Funkenspur. Bleibt dauerhaft als Belohnung.
4. Menü zeigt danach „Hauspokal gewonnen ⚡“ unterm Titel.

---

## 7) Effekte (`src/fx.js`)

**Partikel-Pool:** 1 × `THREE.Points`, 700 Slots, Attribute position/color/size
als Float32Arrays, `PointsMaterial({ map: glowTex, vertexColors: true,
transparent, additive, sizeAttenuation: true, depthWrite: false })`.
CPU-Update (bewährtes Muster der Glühwürmchen): `vel`, `life`, `drag`, `gravity`
in Parallel-Arrays. API:
```js
fx.burst(pos, colorHex, count = 16, speed = 6, { gravity = -4, life = 0.7 } = {})
fx.trail(pos, colorHex)                  // 1 Funke, kurzlebig (für Bolzen/Leviosa)
fx.firework(pos)                          // Rakete + Explosion (Sequenz intern)
```
Tote Partikel: size 0. Immer ältesten Slot überschreiben (Ring-Index).

**Screen-Shake:** `fx.shake(strength)` → main.js addiert in frame() einen
abklingenden Offset auf `camera.position` NACH player.update (offset =
`(rand-0.5)*s`, s *= exp(-8dt)). Nie mehr als 0.5 stapeln.

**Floating-Sparks bei Treffern:** kleine „+“-Funken steigen vom Treffpunkt
(3 Partikel gold, gravity +2 statt Zahlen-Sprites — schlicht & hübsch).

---

## 8) HUD & UI (index.html + hud.js)

### 8.1 Neue Elemente
```html
<div id="hearts"></div>            <!-- oben links: ♥-Reihe -->
<div id="spellbar"></div>          <!-- unten rechts: 4 Spruch-Chips -->
<div id="artifacts">🏆 0 / 4</div> <!-- unter dem Schnatz-Zähler -->
<div id="puzzle-status"></div>     <!-- unten mitte: „🔥 2/3 — 31 s“ -->
<div id="bossbar"><i></i></div>    <!-- nur Troll -->
```
- **Herzen:** 5 (bzw. 6) `<span class="heart">` — Zustände voll/halb/leer via
  Klassen, CSS: rotes ♥ mit text-shadow-Glow, leer = dunkelgrau. Halbe Herzen:
  `linear-gradient`-Clip oder „♥“ überlagert mit halber Breite (einfacher:
  Klasse `half` → `clip-path: inset(0 50% 0 0)` auf gefülltem Herz über leerem).
- **Spellbar:** 4 Chips (Kreis, 34 px): Ziffer + Emoji (⚡🔥🪄💡), Rahmenfarbe =
  Spruchfarbe, aktiver Chip: goldener Ring + leichtes Scale. Cooldown:
  radialer Dunkel-Sweep via `conic-gradient` (CSS-Var `--cd: 0..1`).
- **Menü:** Steuerungs-Grid ergänzen (Maustaste = Zaubern, Rad/1–4 = Spruch,
  L = Lumos) + Button „Kreaturen: wild/zahm“.

### 8.2 hud.js-API-Erweiterung
```js
setHearts(current, max)      setSpell(activeId, cooldownFrac)
setArtifacts(n, total)       setPuzzleStatus(text|null)
setBoss(frac|null)           setCold(frac)        // Schattengeist-Nähe
flashHurt()                  // rote Vignette, 300 ms
```

### 8.3 Vignette-Erweiterung (CSS)
`#vignette` bekommt zwei Zusatz-Layer via CSS-Variablen:
`--cold` (blauer Rand-Schleier, opacity ∝ Wert) und `.hurt` (roter Blitz,
Animation 0.3 s). Nur CSS, kein Canvas.

---

## 9) Speicherstand v2 (main.js)

```js
{ v: 2, c: [schnatzIds], art: ['flamme','krone','stein','karte'],
  pz: { feuer: 0|1, garten: 0|1, lied: 0|1, sterne: 0|1, grotteOffen: 0|1, heckeOffen: 0|1, troll: 0|1, maxHearts: 5|6 },
  peaceful: bool, muted: bool, t: timeOfDay }
```
- **Migration:** Save ohne `v` → Felder übernehmen, Rest Defaults. NIE crashen
  bei fehlenden Feldern (`?? default` überall).
- Persistieren bei: Artefakt, Rätsel-Statuswechsel, Menü-Öffnen, Pickup (wie bisher).
- **Reset-Button** setzt ALLES zurück (auch Rätselzustände + Welt-Objekte:
  Grotte zu, Hecke hoch, Feuerschalen aus … puzzles.restore({}) muss das können).

---

## 10) Audio (audio.js erweitern — alles prozedural!)

| Sound | Rezept (WebAudio) |
|---|---|
| Cast Stupor | Saw-Osc 220→90 Hz in 0.12 s + Noise-Burst highpass, zackig |
| Cast Incendio | Noise lowpass 600 Hz, 0.3 s anschwellend + Knister (Random-Gain-Zacken) |
| Leviosa halten | leiser Sinus-Chor (3 Osc, 400/500/600 Hz, ±4 Hz Vibrato), loop bis Release |
| Lumos an/aus | heller Ping 1320 Hz / dunkler 660 Hz |
| Bolzen-Einschlag | kurzer Bandpass-Noise-Knall, Pitch je Spruchfarbe |
| Pixie-Kichern | 3–5 schnelle Sinus-Blips 1800–2600 Hz, zufällige Reihenfolge |
| Schatten-Drone | 2 verstimmte Sinus 55/57 Hz + langsames Tremolo, gain ∝ Nähe (loop, ein Node-Set, nicht pro Geist!) |
| Herz-Schaden | Thud (vorhanden: `_thump`) + kurzer Hochpass-Zisch |
| Rune-Ton | Dreieck-Osc, Pentatonik d4/f4/g4/a4 (je Stein), 0.4 s |
| Truhe/Fanfare | aufsteigende Quinten-Arpeggio (vorhandenes chime() erweitern: `chime('fanfare')`) |
| Feuerwerk | Noise-Burst tief (Abschuss) + nach 1 s Doppel-Knall + Glitzer-Chimes |

Drone & Leviosa-Chor: **je EIN** globales Node-Set mit Gain-Steuerung (nie pro
Entity Oszillatoren stapeln).

---

## 11) main.js-Integration (Checkliste)

- [ ] Imports + Instanziierung in `buildSteps` ergänzen (Reihenfolge: fx → wand →
      spells → creatures → health → puzzles; puzzles NACH castle/structures, weil
      es `platformGround` für die Feuerschalen braucht).
- [ ] `scene.add(camera)` (für den Stab als Kamera-Kind).
- [ ] `mousedown`-Handler (nur `playing`, Button 0): `spells.cast()`;
      `mouseup`: `spells.release()` (für Leviosa).
      ⚠️ Der Fallback-Modus nutzt Maus-Ziehen zum Umsehen — Cast trotzdem
      auslösen (Zaubern beim Umsehen ist okay), ABER: im Fallback-Modus lösen
      Klicks auf HUD/Menü nichts aus (`e.target === canvas` prüfen).
- [ ] `wheel`-Listener + `Digit1..4` + `KeyL` → `wand.selectSpell(…)`.
- [ ] frame(): Update-Aufrufe in der Reihenfolge aus Abschnitt 1; Shake-Offset
      nach player.update auf die Kamera.
- [ ] Lumos-Migration: alten `lumos`-PointLight-Block entfernen; `lumosOn` lebt
      jetzt in wand/spells (`spells.lumosOn`), Schattengeister lesen ihn von dort.
- [ ] `__game` erweitern: `wand, spells, creatures, puzzles, health, fx` +
      `gott: () => { health.invincible = true }` (Testkomfort) +
      `castAt: (yaw, pitch) => {…}` (Zielhilfe für automatisierte Tests).
- [ ] Save v2 laden/mergen/schreiben.
- [ ] HUD-Verdrahtung (setHearts etc. in frame(), gedrosselt: nur bei Änderung).

---

## 12) ⚠️ Stolperfallen (bereits erlebt — nicht neu entdecken!)

1. **rAF friert** in inaktiven Preview-Tabs ein → Tests IMMER über `__game.step(n)`
   (simuliert n Frames synchron). Weltaufbau nutzt bereits setTimeout statt rAF.
2. **Preview dient aus dem Scratchpad**, nicht aus Downloads → nach jedem Edit
   rsync (Abschnitt 0.2), sonst testest du alten Code.
3. **macOS-TCC** kann ~/Downloads mitten in der Session sperren („Operation not
   permitted“ überall) → Ruhe bewahren, im Scratchpad weiterarbeiten, später
   zurücksyncen. `.git` überlebt im Scratchpad/auf GitHub.
4. **mergeGeometries verlangt identische Attribute** — jede Geometrie vor dem
   Merge durch `tint()` (setzt color); nur Primitiven mit uv+normal verwenden
   (Box/Cylinder/Cone/Sphere/Plane/Circle/Torus/Icosahedron ✓, Extrude ✗).
5. **Geteilte Materialien**: `opacity`/`color` pro Objekt animieren ⇒ vorher
   `material.clone()` (sonst animieren alle synchron — Rauch-Bug).
6. **Instanzen**: `InstancedMesh` nach dem Befüllen `computeBoundingSphere()`.
7. **Vertex-Farben multiplizieren** mit material.color UND map — Texturen sind
   nahe Weiß angelegt; Farben immer über tint()/instanceColor.
8. **Punktlicht-Budget**: aktuell ~10 aktiv. Neue Lichter poolen (max 3 für
   Zauber, 1 Stabspitze). Sonst bricht Lambert-Forward-Rendering ein.
9. **Classifier-Ausfälle** (Tool-Fehler „temporarily unavailable“): read-only
   Tools gehen weiter; `git add/commit -m ' …/push`, `gh repo *`, `gh api *`
   sind allowlisted. Deployment im Notfall via gh-api-Git-Data-Flow
   (Blobs→Tree→Commit→PATCH ref — dokumentiert im Memory `hogwarts-3d-project`).
10. **Der Fallback-Startmodus** (`__game.start()`) setzt `dragLook` — Mausklicks
    feuern dann auch beim Umsehen. Für Cast-Tests besser `castAt()`-Hook nutzen.
11. **Kompass/Yaw-Konvention:** yaw 0 = Norden (−z), heading = −yaw. atan2-Formel
    für Richtung-zu-Ziel steht in collectibles.nearest() — wiederverwenden.
12. **Terrain ist die Wahrheit:** Höhe IMMER über `terrainHeight(x,z)`,
    begehbare Aufbauten über `platformGround(x,z,10000)`.

---

## 13) Phasenplan mit Definition-of-Done

> Nach JEDER Phase: rsync → Preview-Reload → `__game.step()`-Tests → Screenshot
> → FPS-Check (≥ 55 an den 5 Benchmark-Spots: Spawn (0,150), Innenhof (0,30),
> Halle (−32,20), See (−140,190), Wald (100,120)) → Commit auf main.

**Phase 1 — Stab & Stupor (das Fundament, ~1 Session)**
- wand.js (Modell, Idle/Geh/Sprint/Cast-Anim, Spitzen-Glow+Licht, Spruchwahl-Gerüst)
- fx.js (Partikel-Pool, burst, trail, shake)
- spells.js (Pool, Stupor-Bolzen, Gelände/Blocker/Wasser-Kollision, pointBlocked in geo.js)
- main.js-Verdrahtung, HUD-Spellbar (statisch), Sounds Cast/Einschlag
- ✅ DoD: Stab sichtbar & animiert; Stupor zerplatzt an Mauern/Boden/Wasser mit
  Funken; 60 FPS; Test: `castAt`-Bolzen landet in erwarteter Distanz.

**Phase 2 — Pixies & Herzen**
- creatures.js-Gerüst + Pixies (FSM, Schwärme, Sturzflug), health.js + Herz-HUD,
  Brunnen-Heilung, friedlicher Modus, Sounds Kichern/Schaden
- ✅ DoD: Pixie-Schwarm greift an, Stupor besiegt Pixies (Respawn läuft),
  Herzen sinken/regenerieren, Tod→Respawn am Brunnen. step()-Test: Pixie-HP→0.

**Phase 3 — Schnatz-Diebe & Schattengeister**
- Pixie-Diebstahl (collectibles.carriedBy), Schattengeister komplett
  (Nacht-Gate, Kälte-Aura+setCold, Lumos-Flucht, Fades), Drone-Sound
- ✅ DoD: Nachts am Steinkreis wird’s gruselig; Lumos vertreibt Geister
  (step()-Test: Distanz wächst); geklauter Schnatz fällt beim Pixie-Tod.

**Phase 4 — Incendio & Leviosa**
- Incendio (Bogenflug, Ziel-Registry, Kürbis-Gag), Leviosa (Greifmodus, Feder,
  Blocker-Mitnahme), Spruchwechsel-UI final (Rad/1–4, Cooldown-Sweep), Lumos-Migration
- ✅ DoD: Block schweben lassen & präzise absetzen fühlt sich gut an; Feuerball
  fällt sichtbar; alle 4 Chips funktionieren.

**Phase 5 — Rätsel R1 + R2**
- puzzles.js-Gerüst, Ziel-Registry-Anbindung, Truhen/Artefakt-Flow, Save v2,
  Feuerprobe (Schalen, Timer, Grotte), Schwebender Garten (Blöcke, Platten, Hecke)
- ✅ DoD: beide Rätsel end-to-end (auch nach Reload korrekt restauriert!),
  Artefakt-Zähler, Reset-Button stellt Weltzustand wieder her.

**Phase 6 — Rätsel R3 + R4 + Finale**
- Lied der Steine (Simon, Pentatonik), Sternbild (Ziel-Sterne, Winkel-Треffer,
  Lichtlinien), Feuerwerk + Patronus + Hymne, Menü-Status „Hauspokal“
- ✅ DoD: kompletter 100 %-Durchlauf per step()-Skript (Abschnitt 14) läuft grün.

**Phase 7 — Polish & Balancing-Pass**
- Alle Zahlen aus den Tabellen gegen das Spielgefühl prüfen; Toast-Texte;
  Kälte-Vignette tunen; Performance-Pass (renderer.info: Draw-Calls < 120);
  README + Steuerungs-Grid aktualisieren; **Deploy** (push → Pages-Build prüfen).

**Bonus (nur wenn Zeit & Lust):** Troll + Bossbar + Herz-Upgrade.

---

## 14) Automatisierte Abnahme-Tests (per preview_eval + `__game.step`)

```js
// Muster — jede Phase bekommt so einen Block:
const g = window.__game;
g.start(); g.gott();

// Stupor-Treffer auf Pixie:
g.teleport(95, 115, 0);                        // Waldlichtung, Blick Nord
const pixie = g.creatures.list.find(c => c.species==='pixie' && c.alive);
g.castAt(/*auf pixie zielen: yaw/pitch aus Positionsdifferenz rechnen*/);
g.step(90);                                     // 1.5 s simulieren
assert(pixie.hp < 2 || !pixie.alive);

// Feuerprobe:
g.puzzles.debug.igniteAll();                    // jede Puzzle-Klasse bekommt
g.step(30);                                     // ein debug-Objekt für Abkürzungen
assert(g.puzzles.artifactCount === 1);

// Finale:
g.collectibles.items.forEach(i => i.collected = true);
g.puzzles.debug.completeAll();
g.step(120);
assert(document.getElementById('toast').textContent.includes('HAUSPOKAL'));
```
- `assert` = einfache throw-Funktion im Eval.
- Immer auch **einen echten Durchlauf von Hand** (Screenshots: Stab idle/cast,
  Pixie-Schwarm, Geist bei Nacht mit Lumos, jedes Rätsel, Feuerwerk).

---

## 15) Balancing-Tabelle (Startwerte — im Zweifel HIER ändern, nicht im Code verstreuen)

Alle Werte als `const TUNING = {…}` **oben in der jeweiligen Datei**:

| Wert | Start |
|---|---|
| Stupor: speed / dmg / cd | 46 m/s / 1 / 0.45 s |
| Incendio: speed / dmg / cd / Schwerkraft | 34 / 2 / 0.9 s / −9 m/s² |
| Leviosa: Reichweite / Haltedistanz / cd | 7 m / 4 m / 0.2 s |
| Pixie: hp / Orbit / Dive-Speed / dmg / Respawn | 2 / 6 m / 14 / 0.5 ♥ / 90 s |
| Geist: hp / Speed aggro / Aura / dmg / Lumos-Fluchtradius | 3 / 2.6 / 6 m / 1 ♥ / 9 m |
| Spieler: Herzen / Regen / i-Frames | 5 / 0.5♥ je 25 s / 0.8 s |
| Feuerprobe-Timer | 45 s |
| Simon-Runden | 3/4/5 Steine |
| Stern-Zielwinkel | 2° |
| Troll: hp / dmg / Telegraph | 12 / 1.5 ♥ / 0.8 s |

---

## 16) Was NICHT bauen (Scope-Schutz)

- ❌ Besenflug, Mounts, Inventar-System, Dialoge/Questlog, Multiplayer
- ❌ Physik-Engine (die Feder/Gravitation von Hand reicht völlig)
- ❌ Gegner-Pathfinding (Kreaturen fliegen/schweben — Gelände-Höhe + Distanz genügt)
- ❌ Neue Gebiete/Gebäude (die Welt ist groß genug; Rätsel nutzen Bestehendes)
- ❌ Externe Assets/Libraries — der „alles prozedural“-Anspruch ist das Markenzeichen

Wenn eine Phase aus dem Ruder läuft: Feature halbieren, nicht die Qualität.
Lieber 3 großartige Rätsel als 4 mittelmäßige.

---

*Viel Spaß, Sonnet. Die Welt steht, die Werkzeuge liegen bereit — mach etwas*
*Magisches draus. ⚡ — Fable*
