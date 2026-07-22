# Hogwarts 3D — Arbeitsauftrag für Sonnet 5: Die Epische Welt

## Auftrag und Zielbild

Dieser Release macht aus dem bestehenden Spiel eine **spürbar größere, dichter
bevölkerte, grafisch deutlich schönere Welt** — ohne die bewährte, komplett
prozedurale Ästhetik aufzugeben und ohne die stabile Kern-Progression
(Hauspokal → Nebelmoor → Heiligtümer → Animagus) zu zerstören.

Vier Nutzer-Vorgaben, alle verbindlich:

1. **Doppelte Welt.** Die *spielbare* Fläche (innerhalb des Bergrings) wird
   mindestens verdoppelt.
2. **3–4× so viel Leben.** Deutlich mehr Kreaturen, Wilderer-Lager, Herden,
   Schwärme — die Welt soll *episch bevölkert* wirken, nicht leer.
3. **Grafik-Update.** Alle Kreaturen und NPCs bekommen sichtbar bessere
   Modelle, Animationen und Materialien.
4. **Mehr Inhalt.** Mehr Rätsel, mehr Quests, höhere/spannendere
   Quest-Belohnungen.

Dazu kommen die in **Abschnitt 6 „Eigene Ideen"** ergänzten Bausteine
(Regions-Atmosphäre, Fern-Silhouetten, epische Bosse, ein Einhorn-Mount,
Ambient-Massen), die das Ganze zusammenhalten.

Arbeite wie in den bisherigen Plänen: **kleine, nachvollziehbare Commits**,
nach jedem Meilenstein lokal starten (`node dev-server.mjs`) und im Browser
testen, Ergebnisse verifizieren statt annehmen. Beibehalten: Vanilla
ES-Module, Three.js lokal (kein CDN), **kein Build-Schritt, keine externen
Assets, keine neue Laufzeit-Abhängigkeit.** Alle Modelle/Texturen bleiben
prozedural (Geometrie im Code, Canvas-Texturen).

---

## 1. Design-Leitplanken (zuerst lesen)

- **Ästhetik verfeinern, nicht ersetzen.** Das „Grafik-Update" heißt: mehr
  Geometrie-Details, echte Gliedmaßen + Animationen, prozedurale
  Detail-Texturen (Fell/Schuppen/Stoff via Canvas), Rim-/Fresnel-Glühen,
  bessere Farbpaletten, Kontaktschatten. **Es heißt NICHT: externe 3D-Modelle,
  glTF, gekaufte Texturen, ein neues Render-Framework.** Die charmante,
  einheitliche Low-Poly-Handschrift bleibt erhalten — sie wird nur reicher.
- **Bestehendes nicht umschreiben.** Kern-Systeme (creatures.js, npc.js,
  puzzles.js, hallows.js, main.js-Verdrahtung …) werden ERWEITERT, nicht
  refaktoriert. Neue Schnittstellen nur, wo sie zwingend helfen (v.a. das
  Region-Streaming in E0). Jede Regression in der Alt-Welt ist ein Bug.
- **Zwei Grafikstufen bleiben.** „Schön"/„Schnell" (post.js) muss weiter
  funktionieren. Neue, teure Modell-Details werden im „Schnell"-Modus (oder
  bei Auto-Degradation) reduziert — Muster wie beim Bloom-Fallback.
- **Save-Kompatibilität ist heilig.** Alte Spielstände (Schema v6) müssen
  ohne Datenverlust und ohne Absturz weiterlaufen. Neues Save-Schema v7 nur
  additiv (siehe Abschnitt 7).
- **Performance ist ein Feature, kein Nachgedanke.** Ohne das
  Region-Streaming aus E0 kollabiert alles Weitere. E0 ist deshalb Pflicht
  und kommt zuerst. Zielwerte in Abschnitt 8.
- **Koordinaten immer verifizieren.** Jede neue Zone/Rätsel-/Ziel-Position
  ZUERST gegen die echten Konstanten in `terrain.js` (nicht gegen die
  Kopfrechnung hier) prüfen. Die Stolperfallen in Abschnitt 9 sind aus 30+
  echten Bugs dieser Codebasis destilliert — sie gelten alle weiter.

---

## 2. Verifizierte Ausgangslage (Stand: Schema v6, alle Vorgänger-Pläne live)

**Welt (`terrain.js`):** `WORLD_SIZE = 960`, `WORLD_BOUND = 430`, Bergring
beginnt bei `d0 > 330` (Distanz vom Weltursprung) und steigt bis 470 an.
Terrain = eine `PlaneGeometry(960, 960, 220, 220)` (≈48.800 Vertices, 1
Draw-Call, `matrixAutoUpdate=false`). Spielbarer Radius ≈ 330.

**Vegetation (`props.js`, `buildNature`):** 660 Nadelbäume, 260 Laubbäume,
150 Felsen, 2400 Grasbüschel; platziert bis Radius ≈ 410–420; instanziert in
320er-Chunks (`buildChunkedInstances`) für Frustum-Culling; Wind-Sway-Shader
via `onBeforeCompile`.

**Gegner/Fauna heute (alle beim Start gebaut, interne Distanz-Culling):**
- creatures.js: 15 Wichtel (3 Schwärme) + 6 Schattengeister + 1 Troll + 4 Riesenspinnen
- fauna.js: 8 Rehe, ~Hasen, 4 Füchse, 3 Niffler, Bowtruckles, 3 wilde Hippogreife
- wilderer.js: 3 rotierende Wilderer-Lager + Duellring (Ondra)
- dementor.js: 5 Dementoren (Nebelmoor)
- hallows.js: Bleicher König (Hügelgrab)

**NPCs (`npc.js`, `buildFigure`):** 4 wandernde Schüler, Lena, Barnaby,
Schlossgeist, Katze Musch, Fero (Händler), 2 wandernde Hexer. Figur =
Cone-Robe + Kugel-Kopf + Halbkugel-Haar + Torus-Schal (+ optional Hut/Kapuze),
**keine Arme, keine Beine, keine Geh-Animation.**

**Rätsel (`puzzles.js`):** 4 (Feuerprobe, Schwebender Garten, Lied der Steine,
Sternbild) → 4 Artefakte → Hauspokal.

**Quests:** Q1 „Die verlorene Katze", Q2 „Kräuter für den Kessel" (npc.js) +
diverse Endgame-Stränge (Wilderer-Befreiung, Heiligtümer, Animagus-Ritual).

**Spielschleife (`main.js`):** 30 `buildSteps` beim Start; `frame(dt)` updatet
JEDES System jeden Tick. Test-Hooks über `window.__game` (start, teleport,
step(n), fps). Save via `src/save.js` (Schema v6, `normalizeSave`).

---

## 3. Verifizierte Geographie & freie Sektoren

Bestehende Zonen (Zentrum → `d0` vom Ursprung). Der neue Content muss um sie
herum platziert werden:

| Zone | x | z | d0 |
|---|---|---|---|
| Schloss/Plateau | 0 | −20 | 20 |
| Steinkreis | 150 | −95 | 178 |
| Grove/Spinnennest | 150 | 60 | 161 |
| Quidditch | −195 | 10 | 195 |
| Hagrid | 122 | 200 | 234 |
| Dorf Eulenbrück | −70 | −230 | 241 |
| Kate | 230 | 140 | 270 |
| See | −170 | 230 | 286 |
| Bahnhof | −140 | −255 | 291 |
| Nebelmoor | 240 | −175 | 297 |
| Silberauen | 300 | 60 | 306 |
| Fahlholz | 290 | 150 | 327 |
| Hügelgrab | 350 | −10 | 350 |

**Beobachtung:** Der Altbestand füllt den Kreis `d0 ≲ 350`. Der neue,
vergrößerte Gürtel (`d0` ≈ 350–520) ist fast leer und liegt in diesen freien
Himmelsrichtungen:
- **Weiter Osten** (x > 380): jenseits von Fahlholz/Kate/Hügelgrab
- **Weiter Norden** (z < −290): jenseits von Dorf/Bahnhof/Moor
- **Weiter Süden/Südwesten** (z > 280, x < −200): jenseits des Sees
- **Weiter Westen** (x < −300): jenseits von Quidditch

Genau in diese vier Sektoren kommen die vier neuen Regionen (E4–E7).

**Platzierungs-Regel (nachgerechnet):** Region-*Zentren* liegen bei
`d0 ≈ 390–430`, der begehbare Kern (Gebäude/Boss/Rätsel) bei max. `r ≈ 70`.
So bleiben ≥ 50 m Puffer bis zum Bergring-Fuß (520) — sonst läuft der Kern in
den unpassierbaren Berg (bei Zentren ab `d0 ≈ 445` schrumpft der Puffer schon
auf < 75 m, zu eng). Grobe Startwerte (Sonnet verifiziert final gegen
`terrain.js`): Aschenklamm ≈ (395, 110) d0≈411 · Frostzinnen ≈ (0, −410)
d0=410 · Silberhain ≈ (−285, 300) d0≈413 · Schwarzwasser ≈ (−405, −40)
d0≈407. Alle vier haben zueinander und zur nächsten Alt-Zone > 130 m Abstand.

---

## 4. Kern-Architektur: Region-Streaming (Meilenstein E0)

**Das Problem:** Alles wird beim Start gebaut und jeden Frame geupdatet.
Verdoppelt man Welt + Vegetation und vervierfacht die Kreaturen, explodieren
Ladezeit, Speicher und CPU. Die interne Distanz-Culling der Alt-Systeme spart
nur die *Bewegungslogik*, nicht das *Bauen* und nicht die Iterations-Kosten.

**Die Lösung — `src/regions.js`, ein `RegionManager`:** Nie ist die ganze
Welt gleichzeitig „wach". Der neue Content wird in benannte Regionen
gruppiert, die **lazy beim Betreten gebaut** und **beim Verlassen schlafen
gelegt** werden. So gibt es INSGESAMT 3–4× so viel Leben, aber nie mehr als
~1.5× gleichzeitig AKTIV — das ist der Schlüssel, warum die Vorgabe
performant erfüllbar ist.

Interface (bewusst schlank, damit neue Systeme leicht andocken):

```js
regionManager.register({
  key: 'aschenklamm',
  center: { x: 430, z: 120 },
  wakeRadius: 220,      // Spieler näher → bauen + aktiv
  sleepRadius: 300,     // Spieler weiter → schlafen (Hysterese gegen Flackern)
  build: (scene, deps) => { /* baut Meshes/Kreaturen EINMAL, gibt handle zurück */ },
});
// handle: { update(dt, player), setAwake(bool), meshes[] }
```

- **Budget-Bauen:** `build()` darf teuer sein, wird aber nur beim ersten
  Wecken aufgerufen — verteilt über wenige Frames (kleiner Ladebalken „Region
  erwacht …"), damit kein sichtbarer Ruckler entsteht.
- **Schlafen:** `setAwake(false)` → `update()` wird übersprungen, Region-Root
  `visible=false`. Wieder nah → `setAwake(true)`, kein Neubau.
- **Rückwärtskompatibel:** Die BESTEHENDEN Systeme werden NICHT umgestellt.
  Sie liegen alle im Kernradius (`d0 ≲ 350`) und bleiben „immer wach". Nur der
  NEUE Content in E4–E9 nutzt den RegionManager. So bleibt der stabile
  Altbestand unangetastet (Regressionsrisiko = 0).
- **Fliegen bedenken:** Auf Besen/Hippogreif/Rabe erreicht man Regionen sehr
  schnell und aus der Höhe. `wakeRadius` großzügig wählen und die Budget-Rate
  an die (hohe) Fluggeschwindigkeit anpassen, damit eine Region nicht erst
  „aufpoppt", wenn man schon mittendrin ist.

**Welt-Vergrößerung (`terrain.js`) in E0:**
- `WORLD_SIZE 960 → 1500`, `WORLD_BOUND 430 → 660`, Bergring-Start
  `d0 > 330 → d0 > 520`, Anstiegsende `470 → 660`. Spielbarer Radius
  330 → 520 (**Fläche ×2.48** — Vorgabe „mindestens doppelt" klar erfüllt).
- Terrain-Segmente `220 → 300` (≈90.600 Vertices, weiterhin 1 Draw-Call).
  **Prüfen:** `terrainHeight()` wird beim Bau 90.600× aufgerufen — Ladezeit
  im Auge behalten; falls zu lang, adaptive Segmentierung (außen gröber) als
  Fallback im Plan halten, aber erst wenn nötig.
- **WICHTIGE LOGIK-FALLE:** Das Verschieben des Bergrings verändert das
  Terrain UNTER den bestehenden Wildmark-Rand-Zonen (Silberauen d0=306,
  Fahlholz d0=327, Hügelgrab d0=350, Moor d0=297). Diese haben heute
  absichtliche minimale Bergring-Einschläge (dokumentiert in terrain.js).
  Nach dem Umbau liegen sie klar IM Feld — die Einschläge verschwinden. Das
  ist gewollt (mehr Platz), aber: Nach dem Umbau **jede Alt-Rand-Zone im
  Browser gegenchecken** (kein neuer Krater, kein Phantom-Wasser, Gebäude
  stehen weiter eben). Das `terrainHeight`-Sicherheitsnetz gegen
  Phantom-Wasser (Zeile ~240) greift jetzt auf einer viel größeren Fläche —
  verifizieren, dass es nirgends sichtbare Kanten erzeugt.
- Alle harten Radius-Grenzen, die heute auf `WORLD_BOUND`/410/420 verweisen
  (player.js-Clamp, props.js-Streuung), auf die neuen Werte ziehen.

**Vegetation skalieren (`props.js`) in E0:**
- Streuradius 410 → 640, Baum-/Fels-/Gras-Zahlen ~×2 (bei gleicher Dichte).
- Chunk-Rasterung an die größere Welt anpassen (`(p.x + 480)/320` → passende
  Offsets/Chunkgröße für `d0` bis 660), sonst landen ferne Instanzen in einem
  Riesen-Chunk und das Frustum-Culling greift nicht.
- **Eigene Idee (LOD):** Ab einem Radius (z.B. `d0 > 380`) nur noch die
  billige Baum-Variante + halbe Gras-Dichte streuen — spart Vertices dort, wo
  man ohnehin selten hinschaut.

**E0-DoD:** Welt sichtbar ~doppelt so groß begehbar; Bergring am neuen Rand;
keine Terrain-Artefakte an den Alt-Zonen; FPS am alten Schlosshof unverändert;
RegionManager mit einer Dummy-Testregion nachweisbar (baut beim Nähern, schläft
beim Entfernen — per `step()`/Teleport verifiziert); Alt-Save lädt fehlerfrei.

---

## 5. Meilensteine im Überblick

Reihenfolge ist bewusst: erst Fundament (E0), dann das Grafik-Update (E1–E3,
wirkt sofort überall und ist unabhängig von neuem Content), dann die neuen
Regionen (E4–E7), dann Fülle & Feinschliff (E8–E12).

### E0 — Welt-Vergrößerung + Region-Streaming + Vegetations-Skalierung
Siehe Abschnitt 4. **Pflicht-Fundament, zuerst.**

### E1 — Grafik-Overhaul: Kreaturen & Fauna
Neues geteiltes `src/model.js` mit Bau-Helfern (Gliedmaßen-Ketten mit Pivot
wie in willow.js, Fell-/Schuppen-Canvas-Texturen in textures.js, ein
wiederverwendbarer Rim-Light-`onBeforeCompile`-Shader). Damit aufwerten:
- **Wichtel:** filigranere Flügel (Doppelmembran, animiert), leuchtende Adern,
  ausdrucksstärkere Augen.
- **Schattengeister:** wehende, prozedural verformte Umhang-Ränder
  (Vertex-Wobble), tieferes „Nichts" im Inneren, Kälte-Schlieren.
- **Troll & Riesenspinnen:** echte Muskel-/Beinsegmente mit Lauf-Animation,
  bessere Silhouette, Aggro-Pose.
- **Fauna** (Rehe/Füchse/Hasen/Hippogreife/Niffler): Beine mit Gang-Zyklus,
  Ohren/Schwanz-Sekundärbewegung, Fell-Textur.
- **Regeln:** `hitY`-Offset pro Modell neu setzen (Fußpunkt-Anker-Falle!),
  Augen-Sprites AUSSERHALB opaker Köpfe (Tiefentest-Falle), teure Details im
  „Schnell"-Modus reduzieren. Bestehende Spawn-/FSM-Logik bleibt unberührt —
  nur die `build*Parts()`-Funktionen werden ersetzt.

**E1-DoD:** Screenshot-Vergleich vorher/nachher (Tag UND Nacht) je Kreatur;
FPS an einem dichten Kreaturen-Spot unverändert; Treffer sitzen weiter (auf
neue `hitY` getestet); „Schnell"-Modus bleibt flüssig.

### E2 — Grafik-Overhaul: NPCs
`buildFigure` (npc.js) erweitern: **Arme** (2 Segment-Ketten, pendeln beim
Gehen), **Beine** (Gang-Zyklus), schlankere Robe mit angedeuteten Falten,
bessere Köpfe (Nase/Augen/Mund als Mini-Geometrie), Haar-Varianten. Alle
bestehenden NPCs (Schüler, Lena, Barnaby, Fero, Hexer, Ondra, Schlossgeist)
ziehen die Verbesserung automatisch, weil sie `buildFigure` teilen — genau
prüfen, dass jeder Aufrufer weiter passt (Höhen, Kapuze, Transparenz beim
Fade). Geh-Animation an die vorhandene Wander-Geschwindigkeit koppeln.

**E2-DoD:** Alle NPC-Typen im Browser gesichtet; Schüler faden nachts weiter
korrekt; Schlossgeist bleibt halbtransparent; Katze/Fero unverändert
funktional; Dialoge/Interakt (Taste E) intakt.

### E3 — Grafik-Overhaul: Umgebung & Regions-Atmosphäre
- Mehr Baum-/Fels-Varianten (props.js), bessere Rinde/Laub-Töne.
- **Regions-Atmosphäre-System** (eigene Idee, siehe 6.1): pro Region eigene
  Himmelsfärbung, Nebel, Ambient-Licht, Ambient-Sound, die beim Betreten
  sanft überblenden (Muster: weather.js-Blend + sky.js-`gloom`-Parameter).
- Wasser-Shader-Variante für den neuen Schwarzwasser-See (dunkler, unheimlich).

**E3-DoD:** Betreten jeder (Test-)Region ändert Stimmung sichtbar & hörbar,
Übergänge weich; kein Farbraum-/Verdunkelungs-Fehler (Post-FX-Falle, bei Tag
UND Nacht prüfen); FPS stabil.

### E4 — Region „Die Aschenklamm" (Osten, Feuer)
Siehe 6.2. Tiefe vulkanische Schlucht mit Lava-Glühen, Basaltsäulen, Höhlen;
**Boss: der Alte Drache „Aschenschwinge"**; Feuer-Runen-Rätsel; Quest „Das
Drachenei". Region baut über RegionManager.

### E5 — Region „Die Frostzinnen" (Norden, Eis)
Siehe 6.3. Schneelandschaft, gefrorener See, Eishöhle; **Boss: der Frostriese
„Rimefell"**; Eis-Kreaturen (Frostgeister); 2 Rätsel (Incendio-Schmelzen +
Nordlicht-Konstellation); Quest „Das Frostherz". Nordlicht am Himmel.

### E6 — Region „Der Silberhain" (Südwesten, Feen/Licht)
Siehe 6.4. Heller magischer Wald, leuchtende Pilzkreise, ein riesiger
Silberbaum als Fern-Landmarke; **zähmbares Einhorn (neuer Mount)**;
Zentauren-NPCs (Händlerin + Duell); Feenlicht-Muster-Rätsel (Lumos);
Quest „Die stumme Zentaurin".

### E7 — Region „Das Sturmkap & Schwarzwasser" (Westen, Wasser) — kompakter
Siehe 6.5. Zweiter, dunkler See mit Unterwasser-Ruine + Leuchtturm;
**Seeungeheuer „Der Schwarze Schlund"** (nur Kopf/Tentakel, kein Vollmodell);
Grindeloh-Wassergeister; Tauch-Mechanismus-Rätsel (koppelt an Stein der
Wiederkehr); Quest „Der Leuchtturmwärter".

### E8 — Verdichtung der Alt-Welt (das „3–4×"-Fundament)
Bestehende Zonen bevölkern, ohne sie zu überladen: mehr Wichtel-Schwärme,
mehr Schattengeister-Nester, **3 zusätzliche Wilderer-Lager** in den weiteren
Ringen, zusätzliche Fauna-Herden. Neuer Content läuft über RegionManager
(„Ostmark", „Nordmark", „Südmark", „Westmark" als Aktivitätsregionen), damit
die Gesamtzahl steigt, aber nie alles gleichzeitig tickt. Balancing: Dichte so,
dass es „belebt" wirkt, nicht „überrannt".

### E9 — Ambient-Massen (das „episch voll"-Gefühl)
Reine Atmosphäre, kein Kampf: große wandernde **Reh-/Hirsch-Herden** (12–20
Tiere als eine instanzierte, leichte Herde mit gemeinsamem Boid-Ziel),
**Vogelschwärme** am Himmel, **Fischschwärme** in beiden Seen, gelegentliche
**Wildmark-Karawane** (fahrender Händler-Tross auf den Wegen), ferne
**Drachen-Silhouette** am Horizont der Aschenklamm. Alles Instancing +
Streaming, minimale CPU.

### E10 — Quests & Belohnungen ausbauen
Die 5 neuen Region-Quests (E4–E7) + 2–3 verbindende Quests (z.B. „Die vier
Siegel" — ein Meta-Strang, der je ein Artefakt/Zeichen aus jeder neuen Region
verlangt und mit einem großen Finale belohnt). **Höhere Belohnungen:** neue
Tränke (Feuerschutz, Eisatem, Feenlicht), Herz-Upgrades 7→8→9 (Bosse), neue
kosmetische Titel, größere Gold-/Ruf-Sprünge, Einhorn-Mount. Questlog/Progress
(progress.js) + Karte (marauders-map.js) um die neuen Stränge erweitern.

### E11 — Karte & Orientierung erweitern
Neue Landmarken (die 4 Regionen + Bosse) in marauders-map.js; **Fern-Silhouetten
am Horizont** (eigene Idee 6.6) als weithin sichtbare Ansteuer-Ziele;
Region-Entdeckung persistent; Objective Resolver (progress.js) priorisiert die
neuen Stränge korrekt hinter der Kern-Progression.

### E12 — Balancing, Performance-Endabnahme, Doku, Deploy
Balancing-Pass über alle neuen Werte; Performance an ≥10 Benchmark-Spots
(alte + neue, zu Fuß UND im Flug); `node --test`-Suite um progress/save-Fälle
für v7 erweitern; README + TESTPLAN aktualisieren; 100%-Durchlauf; finaler
Deploy; Memory-Abschluss.

---

## 6. Eigene Ideen (über die Nutzer-Vorgaben hinaus)

### 6.1 Regions-Atmosphäre
Jede große Region hat eine eigene Stimmung (Himmelsfarbe, Nebeldichte/-farbe,
Ambient-Licht, Ambient-Sound-Bett), die beim Betreten über ~4 s sanft
überblendet. Macht die größere Welt abwechslungsreich statt „mehr vom
Gleichen" — Aschenklamm glüht rot & flirrt, Frostzinnen bläulich-weiß & still,
Silberhain warm-golden & singend, Schwarzwasser grün-düster & tropfend.

### 6.2 Aschenklamm & der Drache
Ein echter **Miniboss-Drache** als Höhepunkt: schläft auf einem Basaltthron
über einem Lavasee; erwacht, wenn man das Drachenei aus seinem Nest stiehlt
(Quest). Fliegt in Bögen, speit Feuer-Bolzen (telegraphiert, ausweichbar),
gegen Incendio immun. **Besiegbar mit den bis E4 vorhandenen Mitteln** —
Kern-Mechanik: Stupor unterbricht den Feuerspeier während des Telegraphs (wie
beim Troll), dann sind seine Flanken/Flügelansätze für alle übrigen Sprüche
kurz verwundbar (`hitY`-Fenster). **Reihenfolge-sicher:** E4 setzt KEINE
region-fremde Mechanik voraus. Der Eis-Zauber aus E5 ist später ein *optionaler
Bonus* (mehr Schaden gegen den Drachen) — für Spieler, die zuerst die
Frostzinnen machen; er ist nie Pflicht. Belohnung: Herz-Upgrade +
Feuerschutz-Rezept + Titel „Drachenbezwinger". Auch als **ferne Silhouette** am
Horizont sichtbar.

> **Regel für ALLE Boss-Regionen:** Jede Region ist mit den bis zu ihrem
> Meilenstein verfügbaren Sprüchen/Mitteln lösbar. Region-Verzahnungen
> (Eis→Drache, Feuer→Eis) sind immer nur erleichternde Boni, nie
> Freischalt-Voraussetzungen — sonst entsteht eine Reihenfolge-Sackgasse.

### 6.3 Frostzinnen & der Frostriese
Schnee-Sway (Flocken-Partikel wie Regen), gefrorener See (fest begehbar — das
Eis ist eine solide Fläche knapp über der Wasserlinie; **kein** „einbrechen",
da player.js das Schwimmen rein höhenbasiert triggert und ein Loch im Eis den
Spieler unkontrolliert ins Schwimm-System werfen würde), Eishöhle mit dem
**Frostriesen „Rimefell"**. Eis-Zauber
als neue Mechanik (aus einem Rätsel/Trank freigeschaltet) — schmilzt Frost-Runen
UND verwundet den Drachen. Nordlicht am Nachthimmel (sky.js-Erweiterung).

### 6.4 Silberhain & das Einhorn
Der emotionale Gegenpol zu den beiden Bossen: friedlich, leuchtend. Ein
**zähmbares Einhorn** (reiht sich in mount.js ein — langsame, geduldige
Annäherung wie beim Hippogreif, aber es flieht, wenn man dem dunklen Pfad
folgt → schöne Kopplung an save.dunkel). **Zentauren** als würdevolle NPCs
(Händlerin für seltene Zutaten + ein optionales Bogen-Duell). Riesiger
Silberbaum als Landmarke.

### 6.5 Schwarzwasser & das Seeungeheuer
Nutzt das vorhandene Tauch-System (Stein der Wiederkehr, player.js) für ein
Unterwasser-Rätsel in einer versunkenen Ruine. Das **Seeungeheuer** taucht nur
als riesiger Kopf/Tentakel auf (kein Vollmodell — spart Aufwand, wirkt
trotzdem episch). Grindelohs als kleine Wassergeister-Gegner.

### 6.6 Fern-Silhouetten & Horizont-Landmarken
Jede Boss-Region hat eine weithin sichtbare Landmarke (rauchender Drachenberg,
leuchtender Eisgipfel, glühender Silberbaum, Leuchtturm-Strahl), gerendert als
billige ferne Geometrie/Billboard jenseits des Bergrings. Macht die große Welt
navigierbar und *einladend* — man sieht ein Ziel und will hin.

### 6.7 „Die vier Siegel" — verbindender Meta-Strang
Optionaler Sammelbogen: je ein Zeichen aus jeder neuen Region (Drachenschuppe,
Frostherz, Silberblatt, Tiefenperle) öffnet ein Weltfinale (z.B. ein
Sternentor am Schloss) mit einer großen Abschluss-Belohnung + Titel „Hüter der
vier Reiche". Gibt der vergrößerten Welt ein Endziel jenseits der
Einzel-Regionen.

---

## 7. Save-Schema v7 (additiv, migrationssicher)

Nur ergänzen, nie umbenennen/entfernen (alte Felder bleiben). Vorschlag:

```js
regions: { discovered: [], bosses: {} },   // bosses: { drache:1, frostriese:1, ... }
mounts: { ..., einhorn: 0 },               // bestehendes mounts-Objekt erweitern
siegel: { drache: 0, frost: 0, hain: 0, tiefe: 0, finaleWon: 0 },
quests: { ... /* neue Quest-Flags additiv */ },
heim: { zutaten: { ..., /* neue Zutaten */ }, /* neue trank-ids zulässig */ },
```

`SAVE_VERSION 6 → 7`, `normalizeSave` um die neuen Felder mit sicheren
Defaults erweitern (Muster wie tutorial/map/ui in v6). `save.js`-Tests
(`node --test`) um „v6-Save lädt, bekommt v7-Defaults" ergänzen. Reset-Handler
(main.js) und alle In-Memory-Referenzen: neue Sub-Objekte **in-place**
zurücksetzen (`Object.assign`, nie Neuzuweisung — Referenz-Falle).

---

## 8. Performance-Budget & Abnahmekriterien

- **Ladezeit:** Startbildschirm bis spielbar nicht länger als heute + ~50%
  (nur Kernwelt lädt; Regionen streamen). Ladebalken bleibt aussagekräftig.
- **FPS „Schön":** ≥ 50 an allen Benchmark-Spots (zu Fuß). „Schnell": ≥ 60.
  Im Flug (schnelle Region-Aktivierung) kein Einbruch unter 40 beim Einfliegen.
- **Aktive Last:** Nie mehr als ~1.5× der heutigen gleichzeitig aktiven
  Kreaturenzahl (Streaming garantiert das strukturell, nicht nur per Messung).
- **Auto-Degradation** (post.js) greift weiter; neue teure Modelle im
  „Schnell"-Modus reduziert.
- **Abnahme gesamt:** Welt ≥ doppelt begehbar; 3–4× Gesamt-Kreaturen/Camps
  (gezählt); alle Kreaturen/NPCs sichtbar aufgewertet; ≥ 8 neue Rätsel; ≥ 6
  neue Quests mit spürbar größeren Belohnungen; Alt-Save läuft; `npm test`
  grün; keine neuen Konsolenfehler; kein externes Asset, keine neue
  Abhängigkeit.

---

## 9. Stolperfallen (aus 30+ echten Bugs dieser Codebasis — alle gelten weiter)

1. **Ziel-Registry ≥ 1.6 m von jedem Kollisions-Blocker** entfernt platzieren
   (Blocker-Check läuft VOR der Ziel-Prüfung mit `continue` → sonst
   frame-abhängig „grundlos" verfehlende Zauber). Gilt für jedes neue Rätsel.
2. **FSM: kein blindes `if (dead) return`** am `update()`-Anfang, wenn danach
   noch Truhen/Interaktionen/Nachwirkungen laufen müssen (3× real passiert:
   Geist, Troll, Drache-Nest wäre der nächste Kandidat).
3. **Getter NIEMALS destrukturieren** beim Registrieren beweglicher Positionen
   (`interact.register`, Ziel-Registry) — `Object.defineProperties` mit
   Descriptors, sonst friert die Live-Kopplung als Snapshot ein.
4. **Harte Grenzen (Leinen, Zonenränder, Bergring) als Positions-Clamp am
   ENDE von `update()`**, nie als Richtungswunsch am Anfang — und NACH den
   Distanz-Culling-Returns platzieren, sonst greifen sie nie.
5. **`hitY`-Offset** für jede Kreatur mit Fußpunkt-Anker (Bolzen prüfen gegen
   `pos.y + hitY`) — sonst verfehlt man das natürliche Ziel (Torso/Augen). Bei
   E1 neu setzen, wenn Modelle wachsen.
6. **Augen-/Glow-Sprites außerhalb opaker Meshes** ankern (additives Blending
   ändert nur die Farbe, nicht den Tiefentest).
7. **Post-FX/Verdunkelung:** Screenshot-Vergleich IMMER bei Tag UND Nacht; bei
   unerwarteter Verdunkelung zuerst an fehlende sRGB-Kodierung im letzten Pass
   denken (`renderTarget.texture.colorSpace` reicht NICHT — manuelle OETF im
   Final-Pass).
8. **Save-Sub-Objekte in-place mutieren** (`Object.assign(save.x, {...})`),
   nie neu zuweisen — Systeme halten direkte Referenzen.
9. **`localStorage` zwischen unabhängigen Testläufen leeren** — ein Alt-Save
   verfälscht sonst still den nächsten Test.
10. **Koordinaten gegen echte `terrain.js`-Konstanten verifizieren**, nicht
    gegen die Plan-Kopfrechnung. Ein Explore der Zielzone lohnt sich vor jedem
    Bau.
11. **Solide Rundtürme/Zylinder haben kein echtes Loch** — neue Deko „innen"
    landet unsichtbar im Vollmaterial (Konsolen nach außen ragen lassen).
12. **Halbtorus (arc=π) braucht NUR die Ausrichtungs-Rotation** — jede
    Zusatz-Achsen-Rotation zerstört den aufrechten Bogen.
13. **`renderer.info.render.calls` ist seit Post-FX unbrauchbar** für
    Draw-Call-Messung (autoReset) — `fps`/`pixelRatio` sind die verlässlichen
    Signale; `fpsEMA` steht nur in der echten rAF-Schleife, nicht in `step()`.
14. **Callbacks (`onChange`, `onMountChange`) sind Nur-Setter** — nicht
    zurücklesen; echte Interaktions-Flows auslösen statt Callbacks von außen
    aufrufen.
15. **NEU für diese Skala:** Regionen-Wecken/Schlafen mit **Hysterese**
    (`wakeRadius < sleepRadius`), sonst flackert eine Region am Rand jedes
    Frame zwischen Bau und Abbau. Und: Fliegen kann eine Region *überspringen*
    — Wecken auch dann garantieren, wenn der Spieler in einem Frame weit
    hineinspringt (Position, nicht nur „hat wakeRadius von außen berührt").

---

## 10. Offene Entscheidungen (bitte vor E4 klären, falls gewünscht)

Diese habe ich vorläufig entschieden — leicht änderbar:
- **Größe:** Radius 330 → 520 (Fläche ×2.48). Größer möglich, kostet Ladezeit/
  Vertices. Kleiner (×2.0) spart Performance.
- **Regionen-Zahl:** 4 neue Regionen (E4–E7), davon Schwarzwasser (E7) am
  kompaktesten. Reduzierbar auf 3, falls der Umfang zu groß wird.
- **Grafik-Ambition:** Verfeinerung der Low-Poly-Handschrift (keine externen
  Modelle). Falls „fotorealistischer" gewünscht wäre — das ginge nur mit
  externen Assets und würde alle Leitplanken sprengen; bitte dann explizit
  sagen.

---

## 11. Abschlussbericht (am Ende von Sonnet 5 liefern)

1. Zusammenfassung je Meilenstein E0–E12.
2. Geänderte/neue Dateien mit Begründung.
3. Gezählte Kennzahlen (Welt-Radius, Gesamt- vs. gleichzeitig-aktive
   Kreaturen, Rätsel-/Quest-Zahl vorher/nachher).
4. Automatisierte + manuelle Tests samt Ergebnis; FPS-Tabelle.
5. Echte Restpunkte (nur begründete Einschränkungen, keine vagen „könnte
   man"-Listen).
