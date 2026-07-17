# 🐉 Schatten & Schwingen: Mounts, dunkler Pfad, Ökosystem, Unterschlupf & Endgame

*Von Fable 5 für Sonnet 5 — 2026-07-17. Dritter Groß-Plan nach PLAN-MAGIE.md*
*und PLAN-LEBENDIGE-WELT.md. Auf Nutzerwunsch: Mounts (Boden + Flug,*
*Thestral-Kniff), Todesser-Pfad mit verbotenen Sprüchen und Dunklem Mal,*
*größere Welt mit viel mehr Kreaturen und fremden Hexern, Heiligtümer des*
*Todes als Endgame, Begleiter, dynamisches Ökosystem mit Wilderer-Lagern,*
*eigener Unterschlupf mit Braukessel, Animagus-Fähigkeit — plus meine*
*eigenen Ideen (Abschnitt 5.13). Alles durchdacht, auf Unlogiken geprüft.*

---

## Vision in einem Satz

Aus dem Erkunden wird ein LEBEN in dieser Welt: Du reitest und fliegst,
wählst zwischen Licht und Schatten, zähmst und beschützt (oder erntest)
ihre Kreaturen, richtest dir ein Zuhause ein — und am Ende bist du
Meister des Todes oder ein Tier im Mondlicht, ganz wie du willst.

---

## 0) Reihenfolge & Arbeitsweise (WICHTIG — zuerst lesen!)

1. **W6, W7, W8 aus PLAN-LEBENDIGE-WELT.md werden ZUERST fertiggestellt.**
   Dieser Plan setzt sie voraus: W6-Spinnen werden hier zu Akromantulas
   im Ökosystem, W7-Besenflug ist die Basis der Flug-Mount-Physik, W8
   räumt auf, bevor die große Erweiterung beginnt.
2. Danach Phasen **S1 → S12** in Reihenfolge, eine Phase pro
   „weiter"-Zyklus, mit dem etablierten Ritual: Explore → bauen →
   `__game.step()`-Tests → Screenshot-Belege → rsync → committen →
   pushen → Pages-Build prüfen → Memory aktualisieren.
3. Alle 23 Stolperfallen-Lehren (Abschnitt 8) gelten. Test-Harness,
   Scratchpad-rsync, `localStorage`-Hygiene, Positions-Clamps für harte
   Grenzen, restore()-Symmetrie — alles wie gehabt.
4. „Alles prozedural, keine externen Assets, kein Build-Tool, kostenlos"
   bleibt Markenzeichen und harte Regel.

---

## 1) Namens- & Stil-Politik (bewusstes Update des alten Scope-Schutzes)

Der alte Grundsatz „keine Buch-Namen für neue Inhalte" wird auf
**ausdrücklichen Nutzerwunsch** präzisiert:

- ✅ **ERLAUBT — Gattungs-, Spruch- und Gegenstands-Begriffe** aus der
  Vorlage (Präzedenz: Dementor, Quidditch, Expecto Patronum sind längst
  im Spiel): Hippogreif, Thestral, Niffler, Bowtruckle, Akromantula,
  Animagus, Todesser, Avada Kedavra, Crucio, Imperio, Heiligtümer des
  Todes, Elderstab.
- ❌ **WEITER TABU — Personen- und Ortsnamen aus den Büchern.** Statt
  Tom Riddle: der erfundene dunkle Meister **„Morvane der Fahle"** und
  sein **„Aschenes Grimoire"**. Statt Heulende Hütte/Hogsmeade: die
  **„Wispernde Kate"** am Rand der neuen Wildmark; das Dorf bleibt
  Eulenbrück. Neue NPCs: **Fero** (Wanderhändler), **Ondra**
  (Fechtmeisterin), **der Bleiche König** (Hügelgrab-Boss).
- 🧒 **Kindertauglichkeit:** Niemand stirbt sichtbar. Wilderer knien
  und FLIEHEN, Kreaturen „vergehen zu Schatten" (Geist-Sterbeanimation),
  „Ernten" liefert abstrakte „Dunkle Essenz" ohne Gewaltdarstellung.
  Der dunkle Pfad ist UMKEHRBAR (Läuterung, 5.8) — Experimentieren ohne
  Dauerfolgen.

**Aufgehobene „Was NICHT bauen"-Punkte aus PLAN-LEBENDIGE-WELT.md 14:**
„Kampf-NPCs", „Handel/Geld" und das Buch-Begriffs-Tabu (in obiger Form)
sind für DIESEN Plan bewusst aufgehoben. Weiter gültig bleiben: kein
NPC-Pathfinding (Waypoints+Nachteleport), kein Inventar-UI (nur Zähler),
keine externen Assets, kein Jahreszeiten-System.

---

## 2) Save v5 — das KOMPLETTE Schema einmal vorab

Ein einziger Versions-Sprung v4 → v5 in S1; alle späteren Phasen füllen
nur bereits definierte Felder (verhindert Migrations-Wildwuchs):

```js
{
  v: 5,
  // ...alle v4-Felder unverändert (collected, art, pz, moor, quests,
  //    muted, peaceful, grafik, t, besen, bestzeit)...
  gold: 0,               // Währung (S3)
  ruf: 0,                // −100..+100 Ansehen (S3)
  seenDeath: 0,          // Thestral-Gate (S6) — siehe Konsistenz K7
  wild: { aktivCamp: -1, befreit: 0, geerntet: 0 },   // S4
  mounts: { hippo: 0, thestral: 0, sattel: 0 },       // S5/S6
  dunkel: { buch: 0, pfad: 'hell', male: 0 },         // S8
  heim: { kate: 0, zutaten: { glitzer:0, seide:0, stern:0, essenz:0 },
          trank: { id: '', restT: 0 } },               // S7
  begleiter: { aktiv: '', frei: [] },                  // S9
  hallows: { stab: 0, umhang: 0, stein: 0, steinCd: 0 }, // S10
  animagus: { gelernt: 0, form: 'rabe' },              // S11
}
```

- Migration: fehlende Felder → Defaults, NIE crashen. Sonderregel:
  `seenDeath = 1`, wenn ein Alt-Save `pz.troll === true` hat (der
  Troll-Sieg zählt rückwirkend als miterlebter Tod).
- Reset-Button setzt ALLES zurück (inkl. Mounts, Pfad, Kate, Hallows).
- Jedes neue System bekommt `save()`/`restore()` nach moor.js-Muster —
  restore setzt IMMER den kompletten Weltzustand synchron (Lehre 15/W5).

---

## 3) Tasten-Belegung (kollisionsfrei, final)

| Taste | Funktion | Phase |
|---|---|---|
| E | Interagieren / Dialog weiter (existiert) | — |
| B | Besen auf/absteigen (existiert ab W7) | W7 |
| R | Mount rufen/aufsteigen/absteigen | S5 |
| U | Umhang der Unsichtbarkeit an/aus | S10 |
| V | Animagus-Verwandlung an/aus | S11 |
| G | Begleiter rufen/wegschicken | S9 |
| 6 / 7 / 8 | Avada Kedavra / Crucio / Imperio (nur dunkler Pfad) | S8 |
| 9 | Dunkles Mal beschwören (nur dunkler Pfad) | S8 |

Alle neuen Tasten ins Steuerungs-Grid + README, sobald ihre Phase live
ist (nicht vorher — keine toten Einträge).

---

## 4) Welterweiterung „Die Wildmark" — Koordinaten (vorverifiziert)

**Kern-Einsicht statt Terrain-Chirurgie:** Zwischen den äußersten Zonen
(≈ |x| 285) und WORLD_BOUND 430 liegt bereits ein breiter, fast leerer
Gürtel. Die „größere Welt" entsteht durch ERSCHLIESSEN dieses Gürtels
(Vegetation, Zonen, Wege bis ~410), NICHT durch WORLD_SIZE-Umbau. Nur
falls props.js-Streuung bei ±330 endet: auf ±400 erweitern (Zähler und
Culling-Budget prüfen). Kein Eingriff in den Bergring.

| Neue Zone | Koordinate | Distanz-Checks (gegen terrain.js-Einflussradien, VOR dem Bauen re-verifizieren!) |
|---|---|---|
| **Silberauen** (Kreaturen-Ebene, sanftes Flatten r40) | (300, 60) | STONES 215 ✓ · MOOR 242 ✓ · Waldlichtung 210 ✓ · Spinnenhain (150,60) exakt 150 ✓ |
| **Fahlholz** (dunkler Hain, kein Flatten) | (290, 150) | Silberauen 90 ✓ · Waldlichtung 200 ✓ |
| **Hügelgrab** (kleiner Grabhügel, Mini-Shaping r12) | (350, −10) | Silberauen 86 ✓ · MOOR 198 ✓ |
| **Wispernde Kate** (kein Flatten, Hang-Lage) | (230, 140) | Fahlholz 60 ✓ · Waldlichtung 139 ✓ · Spinnenhain 113 ✓ |
| Wilderer-Spots (3, nur Props) | (320, −60) / (260, 200) / (−260, −120) | jeweils ≥ 60 zu allen Flatten-Zonen ✓ (Spot 3 vs QUIDDITCH (−195,10): 145 ✓, vs DORF (−70,−230): 220 ✓) |
| Neue PATHS | Steinkreis-Rundweg (140,−98) → Hügelgrab → Silberauen → Fahlholz → Kate → zurück zur Waldlichtung (95,105) | Wege-Flatten schmal wie gehabt |

⚠️ Lehre 3 bleibt Gesetz: Vor JEDER Zone Explore-Agent + Distanz-Mathe
gegen die REALE terrain.js (die Tabelle hier ist Fable-Kopfrechnung).

---

## 5) Die 12 Phasen

### S1 — Wildmark & Save v5 (`terrain.js`, `props.js`, main.js)
- Zonen aus Abschnitt 4 anlegen: Silberauen (weites Grasland, einzelne
  Solitärbäume), Fahlholz (dichte dunkle Bäume, eigener Mini-Batch wie
  Spinnenhain, Bodennebel-Sprites wie Moor aber dünner), Hügelgrab
  (Grashügel + Steinkranz + verschlossene Steinplatte — Öffnung erst
  S10), Wispernde Kate als GEBÄUDE (verlassen: schiefe Fensterläden,
  kein Licht; Innenraum begehbar nach Gasthaus-Wandmuster, aber leer
  und staubig — Einrichtung kommt in S7), neue PATHS.
- Vegetations-Streuung auf die Wildmark ausdehnen; Ausschlüsse für alle
  neuen Zonen (Muster W3). **Baum-Positions-Export:** props.js sammelt
  beim Streuen ein Array `treeSpots` (x,z der Instanzen, gesampelt) und
  exportiert es — S2 braucht echte Baumpositionen für Bowtruckles,
  sonst sitzen sie im Leeren (die Instanzen selbst sind gemergt!).
- Save v5 komplett einführen (Abschnitt 2) inkl. Migration + Reset.
- ✅ **DoD:** Alle Zonen per Teleport-Screenshots abgenommen (Tag UND
  Nacht — W2-Lehre); Vegetation wächst in der Wildmark, aber nicht in
  den Zonen; Save v4→v5-Roundtrip crashfrei; 6 alte Benchmark-Spots
  regressionsfrei, 2 neue (Silberauen, Kate) ≥ 55 FPS.

### S2 — Fauna & Ökosystem (`fauna.js`)
Leichtgewichtige Tier-Klasse (KEINE creatures.js-Bürger — kein hp/hitY,
Bolzen fliegen durch, außer wo unten vermerkt): wander/flee/hunt-FSM,
Distanz-Culling 140/160, harte Zonen-Leinen als Positions-Clamp.
- **8 Rehe** (Silberauen): Patronus-Hirsch-Geometrie WIEDERVERWENDEN
  (buildPatronusModel-Extraktionsmuster — Material braun statt Glow!),
  äsen/wandern, fliehen ab 8 m Spielernähe.
- **12 Hasen** (Silberauen + Wiesen): kleine Hüpf-Kugeln mit Ohren,
  Beute-Rolle.
- **4 Füchse** (Waldränder): jagen Hasen (< 20 m → Verfolgung; Kontakt:
  Hase „flieht in den Bau" = Despawn + Respawn nach 60 s beim Bau,
  Fuchs satt = 90 s träge). Kindgerecht: kein Riss auf dem Bildschirm.
- **3 Niffler** (Silberauen): buddeln sichtbar Glitzerhaufen aus
  (Sprite + Sound), lassen bei Spielernähe **Glitzerstaub** fallen
  (Zutat + 1–3 Gold, S3). ⚠️ Konsistenz K1: Niffler fassen NIEMALS die
  12 Schnätze an — Diebstahl bleibt exklusiv Pixie-Mechanik.
- **6 Bowtruckles**: sitzen an echten `treeSpots`-Bäumen (S1-Export),
  verstecken sich bei Nähe hinterm Stamm (Rotations-Trick), Lumos lockt
  sie hervor (Lumos wird wieder etwas nützlicher).
- **3 wilde Hippogreife** (Silberauen): majestätisch grasend, fliehen
  vor RENNENDEN Spielern (Zähm-Vorschau für S5), Flügelschlag-Idle.
- **Akromantula-Kopplung (W6):** Spinnen, deren Leine es erlaubt, jagen
  Hasen/Füchse in 25 m — Beute „vergeht zu Schatten", Spinne 120 s
  satt (greift Spieler dann nicht an). Ökosystem: Akromantula > Fuchs >
  Hase, Niffler/Bowtruckle neutral.
- **2 wandernde Hexer** (npc.js-Figuren mit Spitzhut, neue Route durch
  die Wildmark, tags): reine Atmosphäre, Basis der Duell-KI in S4.
- ✅ **DoD:** Jede Art per Screenshot + Verhaltens-step()-Test (Fuchs
  fängt Hase in < 60 s Simulationszeit; Spinne jagt nur in Leine;
  Niffler-Glitzer gibt Gold+Zutat); FPS-Benchmark Silberauen ≥ 55.

### S3 — Gold, Ruf & Wanderhändler Fero (`economy.js` + npc.js)
- **Gold**: HUD-Zähler (dezent neben Artefakten). Quellen: Niffler-
  Glitzer, Wilderer-Lager (S4), Duelle (S4), Sternsplitter-Verkauf.
  Senken: Fero, Duell-Einsatz, Kate-Ausbau (S7), Sattel (S5).
- **Ruf** (−100..+100): +5 Lager befreit, +3 Duell gewonnen, −5 Ernte,
  −3 dunkler Spruch vor Schülern. Wirkung: ≥ +20 Schüler winken,
  Barnaby-Rabatt; ≤ −20 Schüler fliehen, Fero-Aufpreis 50 % (verkauft
  dafür Dunkle Essenz). Ruf ist FLAVOR — sperrt nie Inhalte (K12).
- **Fero der Wanderhändler:** reist mit dem ZUG! Während der
  Bahnhofs-Haltephase (train.js-Fahrplan: `phase === 'halt'`) steht er
  am Bahnsteig (Figur + Karren), sonst nicht — wer handeln will, muss
  den Fahrplan lernen (der W3-Zug bekommt endlich Spiel-Funktion).
  Sortiment: Zutaten (5–10 G), Frischfisch (8 G, S5-Zähmung),
  Sattel (40 G, einmalig: Mount-Sprint +2), 1 Tagesangebot.
- Dialog-UI von W5 wiederverwenden; Kauf per Dialog-Zeilen (kein
  Shop-UI bauen! „E ▸" blättert durch Angebote, Kauf = onClose-Zweig).
- ✅ **DoD:** Gold/Ruf persistieren + Reset; Fero exakt nur während
  Haltefenster (step()-Test über einen 240-s-Fahrplanzyklus); Kauf
  bucht Gold ab und Zutat zu; Ruf-Schwellen ändern Schülerverhalten.

### S4 — Wilderer-Lager & Duell-KI (`wilderer.js`)
- **Feindliche Zauberer-KI** (erste menschliche Gegner): Figur-Basis
  aus npc.js + Kapuze. FSM patrol → aggro (14 m) → Telegraph 1,2 s
  (Stab hebt, roter Funke) → Bolzen (6 m/s, 0.5 ♥, ausweichbar!) →
  Cooldown 2 s. 3 Stupor-Treffer → kniet, flieht, despawnt. Kein
  eigenes Blut/Tod — sie GEBEN AUF. `peaceful`-Modus: ihre Bolzen
  verpuffen wirkungslos (K3).
- **Lager:** je Morgengrauen wird (falls keins aktiv) einer der 3 Spots
  aktiviert (seeded Rotation): 2 Zelte, Feuer, **Käfig** mit Kreatur
  (Pool: Hase, Fuchs, Niffler, Bowtruckle — Fauna-Modelle), 3 Wilderer.
  - **Heller Weg:** alle 3 vertrieben → Käfig per E öffnen → Kreatur
    hüpft davon (Fanfare) → +15 Gold, +5 Ruf, `wild.befreit++`.
  - **Dunkler Weg (nur Todesser, S8):** Käfig per E „Essenz ernten" →
    +3 Dunkle Essenz, −5 Ruf, Kreatur „vergeht zu Schatten".
  - Cleared-Lager verschwindet beim nächsten Morgengrauen.
- **Duellring von Eulenbrück:** Kreidekreis am Dorfplatz, Fechtmeisterin
  **Ondra** täglich 10–16 Uhr. 10 Gold Einsatz, faires 1-gegen-1 gegen
  einen Duellanten (Wilderer-KI, faire Ansage „3-2-1"). Sieg: 20 Gold,
  +3 Ruf; Siegesserie erhöht Gegner-Tempo leicht. Umhang im Ring
  verboten — Ondra besteht darauf (K5).
- ✅ **DoD:** Lager spawnt/verschwindet im Tageszyklus (Zeitraffer-
  Test); Kampf end-to-end (Ausweichen nachweisbar: seitlicher Spieler
  wird nicht getroffen); beide Käfig-Wege; Duell gewinn- und
  verlierbar; peaceful macht Wilderer harmlos.

### S5 — Boden-Mounts: der Hippogreif (`mount.js`)
- **Zähmung** (Silberauen): LANGSAM nähern (Tempo < Gehen innerhalb
  10 m, sonst flieht er), bei 5 m „E — Verbeugen", 3 s stillstehen
  (Fortschrittsring), dann „E — Frischfisch anbieten" (von Fero) →
  gezähmt, Toast + `mounts.hippo=1`, Pfiff erlernt.
- **Rufen & Reiten:** Taste R pfeift (nur im Freien — pointBlocked-
  Check über Kopf): Hippogreif trabt/fliegt heran (Fade-Spawn 20 m
  entfernt, KEIN persistenter Weltstandort — nie „Mount verloren").
  R bei < 3 m: aufsitzen. Ego-Ansicht: Hals + Kopf ragen unten ins
  Bild (Kamera-Kind wie Zauberstab/Besen; Stab ausgeblendet).
- **Physik:** Gehen 15 / Sprint 19 (+2 mit Sattel) — schneller als
  alles (Sprint 11.5, Dementor-Chase 5). Kollision = Spieler-Blocker
  (gleicher Radius — bewusst simpel), Schwimmen erzwingt Absitzen.
- **Kampf-Tritt:** feindliche Kreatur < 2.2 m in Blickrichtung → Tritt
  (Auto, Cooldown 1.5 s): 1 dmg + Rückstoß 8. Wirkt auf Pixies,
  Spinnen, Wilderer. NICHT auf Dementoren (immateriell, K6).
- Zaubern beim Boden-Reiten: erlaubt (macht Reiten wertvoll).
- ✅ **DoD:** Zähm-Choreografie inkl. Fehlversuch (zu schnell → Flucht);
  R-Zyklus 10× robust (drinnen korrekt verweigert); Tritt trifft/
  verfehlt korrekt; Tempo-Messung 15/19; Save-Roundtrip.

### S6 — Flug-Mounts & der Thestral (`mount.js` + flight-Extraktion)
- **Flugphysik EXTRAHIEREN, nicht kopieren** (Patronus-Lehre!): W7s
  Besen-Flugcode aus player.js → gemeinsames Modul `flight.js`
  (steigen/sinken/Blickrichtungs-Flug/Höhen- und Welt-Clamps als
  Positions-Clamps). Besen nutzt es weiter (Regression!), Mounts auch.
- **Hippogreif fliegend:** beim Reiten Leertaste 2× = abheben. Tempo 24
  (Besen-Boost bleibt 18 — der Hippogreif ist das Upgrade), träger
  Kurvenradius (majestätisch), Flügelschlag-Animation + Wind.
- **Thestral:** 2 Stück im Fahlholz — **unsichtbar (opacity 0), solange
  `seenDeath = 0`**. Hörbar: leises Atmen/Hufscharren (Audio-Hinweis,
  dass DA etwas ist — Gänsehaut!). `seenDeath = 1` wird gesetzt durch:
  ersten eigenen Tod, Troll-Sieg (auch rückwirkend, Abschnitt 2) oder
  ersten Avada-Einsatz. Danach: sichtbar (Fade-in, dünn, knochig,
  ledrige Schwingen — eigenes Modell), zähmbar OHNE Ritual (sie mögen
  dich einfach — sie kennen dich jetzt): E → sofort geritten.
  Tempo 28, wendiger als der Hippogreif — Belohnung fürs Mysterium.
- Kein Zaubern im Flug (gilt für Besen wie Mounts — einheitlich, K8).
  Dementoren-Frost prüft ab jetzt 3D-Distanz: hoch fliegen = sicher,
  tief über dem Moor = riskant (K9).
- ✅ **DoD:** flight.js-Extraktion regressionsfrei (Besen-Parcours-
  Bestzeit weiter erreichbar!); Thestral-Gate in beide Richtungen
  (unsichtbar vor / sichtbar+hörbar nach seenDeath, Alt-Save-Migration
  getestet); Höhen-/Welt-Clamps im Stresstest; 55 FPS im Panorama-Flug.

### S7 — Wispernde Kate: Unterschlupf & Braukessel (`home.js`)
- **In Besitz nehmen:** Aushang an der Kate „Verlassen — wer mich
  pflegt, dem gehöre ich": E → 60 Gold (oder gratis ab Ruf ≥ 30 —
  die Nachbarschaft vertraut dir) → `heim.kate=1`: Fensterläden
  gerade, warmes Fensterlicht (mats.window-Trick!), Kamin an.
- **Einrichtung:** Braukessel, Bett, 3 Podeste (leer — für S10),
  Kreaturen-Ecke (Begleiter döst dort, wenn weggeschickt), Trophäen-
  regal (zeigt Artefakte/Laterne/Pokal als Mini-Deko — reiner Read
  aus dem Save).
- **Bett:** „E — Rasten bis zum Morgen/Abend" (sky.timeOfDay-Sprung +
  kurzer Fade; Herzen voll — gemütliche Alternative zum Brunnen).
- **Brauen** (Dialog-UI, kein neues Interface): Rezepte mit Zutaten aus
  der Welt — Glitzerstaub (Niffler), Spinnenseide (W6-Spinnen lassen
  sie ab jetzt fallen), Sternsplitter (Meteor-Nächte, s.u.),
  Leuchtkraut (Gewächshaus — **wächst nach Q2 jeden Morgen nach**,
  Behebung der W5-Einweg-Unlogik!), Dunkle Essenz (nur dunkler Pfad).
  | Trank | Zutaten | Wirkung (5 min, 1 aktiv) |
  |---|---|---|
  | Flinktrank | Glitzer + Leuchtkraut | Tempo ×1.3 |
  | Herztrank | Seide + Leuchtkraut | +2 temporäre Max-Herzen |
  | Frostbann | Stern + Glitzer | Frost-Immunität |
  | Dunkler Sud | Essenz + Seide | Spruchschaden ×1.5 (nur dunkel) |
  Trank wirkt AB BRAUEN (Timer im Save) — kein Inventar/Trink-UI.
- **Meteor-Nächte:** in klaren Nächten 15 % Chance: Sternschnuppen-
  Streifen am Himmel (fx), 2 glühende **Sternsplitter** landen in der
  Wildmark (Tracker-Pfeil zeigt zum nächsten; verschwinden im
  Morgengrauen — sanfter Zeitdruck).
- ✅ **DoD:** Kauf beide Wege (Gold/Ruf); Bett-Sprung; jedes Rezept
  einmal end-to-end (Zutat sammeln → brauen → Wirkung messbar:
  Tempo-/Herz-/Frost-Assert); Leuchtkraut-Nachwuchs am Morgen;
  Meteor-Nacht erzwungen per Debug-Hook und Splitter eingesammelt.

### S8 — Der dunkle Pfad (`dark.js` + spells.js)
- **Das Aschene Grimoire** liegt in der tiefsten Nest-Kammer des
  Spinnenhains (W6-Geometrie, neuer Alkoven). Aufheben → Toast über
  Morvane den Fahlen + Wahl-Dialog: „Das Ritual sprechen?" → dunkler
  Altar erscheint dort. Ritual = `dunkel.pfad='dunkel'`.
- **Verbotene Sprüche** (Slots 6–8, eigene dunkelgrüne Chips):
  - **Avada Kedavra** (8 s CD): grüner Blitz, One-Shot auf normale
    Kreaturen (Schatten-Vergehen), 4 dmg auf Troll/Bosse. Wirkungslos
    auf Quest-NPCs, Begleiter, Schüler, Musch (Auto-Fizzle + missbilligende
    Schlossgeist-Zeile beim ersten Versuch — K2).
  - **Crucio** (6 s CD): 2-s-Kanal-Strahl, Ziel gelähmt + 0.5 dmg/s —
    unterbricht Telegraphs (taktisch gegen Troll/Wilderer).
  - **Imperio** (12 s CD): Pixie/Spinne/Fuchs/**Wilderer** kämpft 20 s
    für dich, dann benommen. Imperio auf einen Wilderer kann den KÄFIG
    öffnen lassen (Lager-Alternativlösung — Spielwitz!). Nicht auf
    Bosse/Dementoren/Begleiter.
  - **Dunkles Mal** (Taste 9, 60 s CD): grüne Partikel-Schlange +
    Glutwolke steigt in den Himmel (60 s, weithin sichtbar). Schüler
    fliehen, Ruf −3 — ABER: Dementoren driften zum Mal (30 s) →
    taktisches Weglocken vom Moor-Pfad! Das Mal ist Werkzeug, nicht
    nur Show.
- **Weltreaktion als Todesser:** Dementoren neutral (kein Aggro, kein
  Frost — du gehörst zu den Schatten; Seelenlichter-Quest wird dadurch
  LEICHTER, bewusst: der dunkle Weg ist der bequeme, K4). Lena/Barnaby
  verweigern ängstlich Dialog (Quests pausieren, gehen NICHT verloren),
  Schüler fliehen, Ondra duelliert erst recht („dich will ich prüfen"),
  Fero verkauft alles (Geschäft ist Geschäft). Sprint hinterlässt
  dezenten Schatten-Trail (fx.trail schwarz-violett).
- **Läuterung:** Am Innenhof-Brunnen im Morgengrauen mit vollen Herzen:
  „E — ins Licht zurückkehren" → `pfad='hell'`, Sprüche 6–9 gesperrt
  (Grimoire-Wissen bleibt: erneutes Ritual am Altar jederzeit). Beide
  Richtungen beliebig oft — Identität als Spielzeug, nicht als Falle.
- ✅ **DoD:** Ritual + Läuterung im Kreis (3× hin/zurück, Save-stabil);
  jeder Spruch einzeln verifiziert (inkl. Fizzle-Schutzliste!); Mal
  lockt Dementoren messbar (Positions-Assert); NPC-Reaktionsmatrix
  stichprobenhaft; Regression: heller Spielstand unverändert spielbar.

### S9 — Begleiter (`companion.js`)
- Ein aktiver Begleiter folgt (Katzen-Follow-FSM aus npc.js WIEDER-
  VERWENDEN — Teleport-Nachziehen inklusive), Taste G ruft/schickt weg
  (weggeschickt: döst in der Kate, falls gekauft, sonst Heimatort).
- **Freischaltungen:** 🐈 **Musch** (nach Q1 Lena fragen — „sie mag
  dich"), 🦉 **Eule Piniva** (Eulerei, nachts E + 1 Frischfisch),
  💰 **Niffler Grabbel** (Silberauen: 5 Gold in sein Loch legen).
- **Schutz-Verhalten:** Feind < 12 m vom Spieler → Begleiter attackiert
  (Musch: Pranken-Sprung 0.5 dmg; Piniva: Sturzflug + kurzer Gegner-
  Stagger; Grabbel: klaut dem Wilderer den Stab für 3 s — Zauber-
  Unterbrechung!). Begleiter sind UNVERWUNDBAR (kein Pflege-Stress,
  K10) und niemals Ziel von Sprüchen (auch nicht dunklen).
- Bonus-Passiva: Musch faucht bei Geistern (Vorwarnung), Piniva kreist
  über dem nächsten fehlenden Schnatz wenn < 60 m (sanfte Suchhilfe),
  Grabbel findet +1 Glitzer bei Niffler-Funden.
- ✅ **DoD:** alle 3 freischalt-, ruf- und wegschickbar (Save!); jede
  Schutz-Aktion im gestellten Kampf nachgewiesen; Begleiter stören
  keine Quest-Trigger (Katzen-Quest Q1 mit aktivem Begleiter getestet).

### S10 — Die Heiligtümer des Todes (`hallows.js`)
Drei Endgame-Quests, freigeschaltet nach Hauspokal UND Seelenlaterne
(der Schlossgeist flüstert dann von „drei Dingen, die der Tod verlor").
- **Der Elderstab** — Duell am Hügelgrab: um Mitternacht öffnet sich
  die Steinplatte, der **Bleiche König** erhebt sich (Geist-Material
  fahl-golden, Wilderer-KI-Basis, aber: 3 Phasen, teleportiert nach
  jedem 3. Treffer, beschwört 2 Schattengeister in Phase 2). 10 Treffer
  → er verneigt sich („endlich einer, der würdig ist") → Elderstab:
  Spruchschaden ×2, Cooldowns ×0.6 — BEWUSST wuchtig (Endgame-Wunsch
  des Nutzers), am Stab-Modell goldene Maserung.
- **Der Umhang** — Diebesquest: der Wilderer-ANFÜHRER (4. Wilderer,
  erscheint nur, wenn ein Lager 2 Tage nicht geräumt wurde) hütet eine
  Truhe. Der Umhang muss GESTOHLEN werden: nachts, ohne dass dich ein
  Wilderer je auf < 8 m sieht (Sichtkegel-Check; entdeckt = Lager
  alarmiert, Versuch morgen neu). Belohnung: Taste U = Unsichtbarkeit
  (alle Kreaturen/NPCs deaggro & ignorieren dich; Dialoge erzwingen
  Sichtbarkeit, Duelle verbieten ihn — K5). An/abschaltbar, kein Timer
  — Machtfantasie ist hier der Punkt.
- **Der Stein der Wiederkehr** — im tiefsten Punkt des Sees. NEUE
  Mini-Mechanik **Tauchen**: beim Schwimmen Shift = abtauchen (Luft-
  anzeige 25 s, Unterwasser-Vignette blau, dumpfer Audio-Filter).
  Der Stein glimmt am Grund. Wirkung: bei 0 Herzen einmal pro Spieltag
  Wiederbelebung AN ORT UND STELLE mit vollen Herzen — kein Whiteout,
  kein Respawn-Teleport, getragene Seelenlichter bleiben erhalten (K11).
- **Meister des Todes** (alle 3): Thestrale immer sichtbar (überschreibt
  seenDeath), +1 Max-Herz (→ 8 mit W6), Dementoren verneigen sich im
  Vorbeigehen (Umhang-Dip-Animation), silbriger Sprint-Schimmer. Die 3
  Podeste in der Kate zeigen die Heiligtümer (an/ablegbar per E —
  abgelegt = Effekt aus, für Selbst-Balancing!).
- ✅ **DoD:** jede Quest end-to-end; Stein-Revive im echten Tod-Szenario
  (Moor! Lichter bleiben getragen); Umhang-Stealth erkennbar fair
  (Sichtkegel-Visualisierung im Debug); König-Duell in allen 3 Phasen;
  Podest-Ablage schaltet Effekte nachweislich ab.

### S11 — Animagus (`animagus.js`)
- **Quest** (nach S7, braucht den Kessel): Schlossgeist-Hinweis →
  „Trank der zweiten Gestalt" brauen (Sternsplitter + Seide + Leucht-
  kraut) → damit **während eines GEWITTERS** (W1-Wetter! `weather.state
  === 'sturm'`) zum Steinkreis → Ritual im Blitzlicht → Form wählen.
- **3 Formen** (Taste V wechselt Mensch/Tier; Form-Wahl im Menü):
  - 🐦‍⬛ **Rabe:** fliegt (flight.js!), klein & flink (Tempo 16), aber:
    KEIN Zaubern, kein Interagieren mit Truhen. Kamera niedrig, Flügel
    im Blickfeld.
  - 🐈 **Katze:** Kamera auf 0.5 m (die Welt wird RIESIG — billiger,
    großartiger Effekt), Tempo 9, Aggro-Radien aller Feinde ×0.3
    (Schleichen!), passt durch einen neuen Katzentunnel in der Kate.
  - 🐺 **Wolf:** Tempo 13, Nahkampf-Biss auf V-Doppeldruck (1 dmg),
    Nachtsicht (nightGlow-Aufhellung der Vignette).
  - Als Tier: kein Zaubern, kein Reiten, Dialog nur „...(du bist ein
    Tier)" — NPC-Reaktion als Easter-Egg (Musch beschnuppert dich).
- ✅ **DoD:** Ritual nur im Sturm (Nicht-Sturm-Versuch scheitert mit
  Hinweis); alle 3 Formen: Bewegung, Spezialfähigkeit, Restriktionen
  (Zauber-Sperre!) einzeln getestet; V-Toggle 10× robust inkl. im
  Wasser (Tier im Wasser → sofort Mensch); Save speichert Form.

### S12 — Gerüchte, Balancing, Politur & Deploy
- **Gerüchte-System:** ~12 Idle-Zeilen für Schüler/Lena/Barnaby, die
  auf Save-Flags reagieren („Jemand hat das Lager am See befreit!",
  „Nachts soll ein Wolf durchs Fahlholz streifen…", „Man sagt, in der
  Kate brennt wieder Licht"). Reiner Text-Switch — maximale Lebendig-
  keit pro Zeile Code.
- Balancing-Pass gegen Tabelle (Abschnitt 6); Fokus: fühlt sich der
  helle Weg NEBEN dem bequemen dunklen noch lohnend an? (Ruf-Perks
  ggf. nachschärfen.)
- README komplett (Mounts, Pfade, Kate, Hallows, Animagus, Tasten),
  Steuerungs-Grid final, Menü-Statuszeilen (Pfad, Mounts, Hallows).
- Performance-Endabnahme: alle Benchmark-Spots + Silberauen-Panorama
  beritten UND fliegend; „Schön" ≥ 55, „Schnell" 60.
- **100 %-Durchlauf** in einer Kette: Hippogreif zähmen → Lager hell
  räumen → Kate kaufen → Trank → dunkles Ritual → Mal lockt Dementor →
  Läuterung → alle 3 Hallows → Meister des Todes → Animagus-Sturm-
  Ritual → als Rabe zur Bestzeit-Schleife. Grün = Deploy + Memory.

---

## 6) Balancing-Tabelle (Startwerte — HIER ändern)

| Parameter | Wert |
|---|---|
| Hippogreif Gehen / Sprint / Flug | 15 / 19 (+2 Sattel) / 24 |
| Thestral Flug / Wendigkeit | 28 / Kurven ×1.4 |
| Mount-Tritt: Schaden / Rückstoß / CD | 1 ♥ / 8 m / 1.5 s |
| Wilderer: Bolzen-Tempo / Schaden / Treffer bis Flucht | 6 m/s / 0.5 ♥ / 3 |
| Duell-Einsatz / Sieg | 10 G / 20 G, +3 Ruf |
| Lager: Belohnung hell / dunkel | 15 G + 5 Ruf / 3 Essenz − 5 Ruf |
| Avada: CD / Schaden normal / Boss | 8 s / One-Shot / 4 ♥ |
| Crucio: CD / Kanal / DoT | 6 s / 2 s / 0.5 ♥ pro s |
| Imperio: CD / Dauer | 12 s / 20 s |
| Dunkles Mal: CD / Dauer / Dementor-Sog | 60 s / 60 s / 30 s |
| Tränke: Dauer / gleichzeitig | 5 min / 1 |
| Elderstab | Schaden ×2, CD ×0.6 |
| Stein: Revive-CD | 1× pro Spieltag |
| Tauchen: Luft | 25 s |
| Animagus: Rabe/Katze/Wolf Tempo | 16 / 9 / 13 |
| Katze: Feind-Aggro-Radien | ×0.3 |
| Kate: Preis / Ruf-Alternative | 60 G / Ruf ≥ 30 |
| Meteor-Nacht: Chance / Splitter | 15 % klarer Nächte / 2 |

---

## 7) 🔍 Konsistenz-Prüfliste (die „Unlogiken", bevor sie passieren)

- **K1 — Niffler vs. Schnätze:** Niffler berühren die 12 Schnätze NIE
  (Save-Integrität; Diebstahl bleibt Pixie-Feature). Eigene Glitzer.
- **K2 — Spruch-Schutzliste:** Quest-NPCs, Schüler, Begleiter, Musch,
  Fero, Ondra sind gegen ALLE Sprüche immun (Auto-Fizzle). Einmalige
  Missbilligungs-Zeile statt Bestrafung.
- **K3 — peaceful-Modus** deckt auch Wilderer, Bleichen König und
  Willow ab: nichts davon schadet dem Spieler; besiegen bleibt möglich.
- **K4 — Todesser & Seelenlichter:** Dementoren-Neutralität macht die
  Moor-Quest leichter — GEWOLLT (der dunkle Weg ist bequem, kostet
  Ansehen & Quest-Zugang). Im Plan dokumentiert, kein Bug.
- **K5 — Umhang-Grenzen:** Dialog erzwingt Sichtbarkeit; Duellring
  verbietet ihn (Ondra-Zeile); Stealth-Quest selbst natürlich ohne.
- **K6 — Tritt trifft keine Dementoren** (immateriell — nur Patronus
  wirkt, bestehende Regel bleibt konsistent).
- **K7 — seenDeath & Stein:** Ein Stein-Revive ZÄHLT als miterlebter
  Tod (setzt seenDeath) — wer den Tod betrogen hat, sieht Thestrale.
- **K8 — Kein Zaubern im Flug** (Besen wie Mounts, einheitlich);
  am Boden beritten: Zaubern erlaubt.
- **K9 — Frost prüft 3D-Distanz** ab S6 (vorher 2D): Überfliegen des
  Moors in Höhe ist sicher, Tiefflug nicht. Regression: zu Fuß
  identisch (y-Differenz ≈ 0).
- **K10 — Begleiter unverwundbar** und nie Spruchziel; verursachte
  Kills geben KEINE dunkle Essenz (kein Ernte-Exploit per Begleiter).
- **K11 — Stein-Revive** lässt getragene Seelenlichter am Spieler
  (kein dropCarriedLights) — das ist sein Kernwert im Moor.
- **K12 — Ruf sperrt nie Inhalte,** er färbt nur Preise/Reaktionen —
  kein Softlock durch niedrigen Ruf möglich.
- **K13 — Mount & Willow/Zonen:** Weide trifft auch Beritten (Spieler-
  pos zählt); Mount-Pfiff im Gasthaus/Krypta/Kate korrekt verweigert.
- **K14 — Tier-Form im Wasser** → sofortige Rückverwandlung (kein
  ertrinkender Rabe); Tauchen nur als Mensch.
- **K15 — Fero-Abhängigkeit:** Frischfisch (Zähmung S5) MUSS vor S5
  kaufbar sein → Fero kommt in S3. Reihenfolge ist deshalb fix.
- **K16 — Leuchtkraut-Nachwuchs** (S7) erst NACH Q2-Abschluss —
  vorher bleibt die Quest-Knappheit erhalten.
- **K17 — Alle neuen „harten Grenzen"** (Fauna-Leinen, Flughöhe,
  Duellring-Radius, Spinnen-Leine) sind Positions-Clamps am Ende von
  update() — Lehre 14, keine Ausnahmen.

---

## 8) ⚠️ Stolperfallen — Lehren 1–19 gelten weiter, NEU seit W3:

20. **Halbtorus (arc=π) ist schon der fertige Bogen** — nur rotateY zur
    Ausrichtung, jede weitere Achsen-Rotation zerstört die Form (W3).
21. **`renderer.info.render.calls` ist seit W2 wertlos** (autoReset pro
    render()-Aufruf im Multi-Pass) — Performance nur über fps/pixelRatio.
22. **„Innen" ist oft kein Hohlraum:** Deko an/in soliden Zylindern
    (Türme!) landet unsichtbar im Vollmaterial — Aufbauten immer AUSSEN
    an der Hülle anbringen oder echten Hohlraum bauen (W4-Eulerei).
23. **API nimmt Getter an? Dann keine Destrukturierung!** `{x} = spec`
    wertet Getter sofort aus und friert Werte ein —
    `Object.defineProperties(entry, Object.getOwnPropertyDescriptors(spec))`
    erhält Live-Positionen (W5-interact.js, Katzen-Bug).

---

## 9) Was NICHT bauen (aktualisierter Scope-Schutz)

- ❌ Kein Multiplayer, keine Server — alles bleibt lokal/statisch
- ❌ Kein Inventar-UI — Zutaten/Gold sind Zähler, Tränke wirken ab Brauen
- ❌ Kein NPC-Pathfinding — Waypoints + Nachteleport (bewährt)
- ❌ Kein WORLD_SIZE-Umbau — die Wildmark nutzt den bestehenden Gürtel
- ❌ Keine Reittier-Ställe/Fütterung/Pflege — Pfiff genügt
- ❌ Kein Moral-Punktesystem jenseits von Ruf + Pfad-Flag
- ❌ Keine echten Gesichter/Stimmen — Figuren bleiben stilisiert stumm
- ❌ Sichtbarer Tod/Gewalt — Fliehen, Verneigen, Zu-Schatten-Vergehen

Wenn eine Phase kippt: Feature halbieren, nie die Qualität. Jede Phase
ist für sich ein fertiges, deploybares Update.

---

*Du hast dem Schloss Wetter, ein Dorf und Seelen gegeben, Sonnet.*
*Jetzt gib dem Spieler Flügel — und eine Wahl. 🐉🖤 — Fable*
