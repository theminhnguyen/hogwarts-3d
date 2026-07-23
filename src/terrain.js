// Gelände: Höhenfunktion (auch für Kollision), Terrain-Mesh mit Vertex-Farben,
// See mit animiertem Wasser-Shader, Wege.

import * as THREE from 'three';
import { fbm, smoothstep, lerp, clamp } from './noise.js';
import { getMaterials } from './materials.js';

// PLAN-EPISCHE-WELT.md (Meilenstein E0): Welt spielbar verdoppelt.
// WORLD_SIZE 960->1500, WORLD_BOUND 430->660 (Bergring-Start entsprechend
// weiter draußen, siehe terrainHeight() unten) — Fläche des spielbaren
// Kreises (r=WORLD_BOUND-etwas) wächst dadurch um Faktor ~2.48 (nachgerechnet
// in PLAN-EPISCHE-WELT.md Abschnitt 4), nicht nur linear.
export const WORLD_SIZE = 1500;       // Kantenlänge des Terrains
export const WORLD_BOUND = 660;       // weiter draußen: Berge (unpassierbar)
export const WATER_LEVEL = 0.4;

export const PLATEAU = { x: 0, z: -20, r: 85, blend: 45, h: 18 };
export const LAKE = { x: -170, z: 230, r: 125 };
export const QUIDDITCH = { x: -195, z: 10, r: 52, h: 4 };
export const HAGRID = { x: 122, z: 200, r: 16, h: 5 };
export const STONES = { x: 150, z: -95, r: 24, h: 14 };
export const BOATHOUSE = { x: -88, z: 158, r: 14, h: 1.3 };
export const RAVINE = { z: 94 };      // Schlucht, die das Viadukt überspannt
// x/z gegenüber PLAN-NEBELMOOR.md (215,-150) verschoben: Der Steinkreis-Hügel
// (STONES.r=24, Terrain-Einfluss bis r×2.6=62.4) reichte bei der ursprünglich
// geplanten Position bis auf ~23m an den Moor-Kern heran (Abstand der Zentren
// war nur 85m). Mit diesem Zentrum liegt der nächste Moor-Rand (Abstand 117.8
// − MOOR.r 55 = 62.8) knapp HINTER dem Ende des Steinkreis-Einflusses (62.4) —
// beide Terrain-Shapings überlappen sich nirgends mehr.
export const MOOR = { x: 240, z: -175, r: 55, blend: 25, h: 1.6 };
// Dorf "Eulenbrück" — Senke wie QUIDDITCH/HAGRID-Muster. Abstände geprüft:
// d0=240 (Außenkante 316 < Bergring-Start 330), PLATEAU-Abstand 221 > 130+76,
// STONES-Abstand 258, MOOR-Abstand ~315 — keine Überlappung mit bestehenden Zonen.
export const DORF = { x: -70, z: -230, r: 40, h: 4 };
// Gleis-Trasse: beide Enden liegen ABSICHTLICH im Bergring-Anstieg (d0 ≈ 330-340)
// — die Tunnelportale sollen wie in den Berg gegraben wirken. Bahnhof (Mitte der
// Trasse, dritter Punkt) liegt im Dorf-Umfeld.
export const TRASSE = [
  [-285, -185], [-215, -235], [-140, -255], [-40, -275], [60, -290], [115, -310],
];
export const BAHNHOF = { x: -140, z: -255 };
// Spinnennest-Hain: kein eigenes Terrain-Flatten (steht auf natürlichem
// Waldboden, Muster wie Eulerei/Weide aus W4). Abstände geprüft: RAVINE-Band
// |60-94|=34 > 27 (Einflussgrenze) ✓, STONES-Abstand 155 ✓, alle W4-Zonen
// (Eulerei/Gewächshaus/Weide) > 100m entfernt ✓. r=20 ist der Hain selbst
// (Bäume+Netze+Truhe), die Spinnen-Leine (r=35) reicht etwas weiter in den
// umliegenden Wald hinein.
export const GROVE = { x: 150, z: 60, r: 20 };

// ---------- Die Wildmark (S1, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt 4) ----------
// Erschließt den bereits vorhandenen, fast leeren Gürtel zwischen den
// äußersten Alt-Zonen (|x|≈285) und WORLD_BOUND (430) — kein WORLD_SIZE-
// Umbau. Alle Abstände gegen die ECHTEN obigen Zonen-Konstanten nachgerechnet
// (nicht nur gegen die Plan-Kopfrechnung): Silberauen↔STONES 215.7,
// Silberauen↔MOOR 242.5, Silberauen↔GROVE exakt 150, Fahlholz↔Silberauen
// 90.6, Hügelgrab↔Silberauen 86.0, Hügelgrab↔MOOR 198.3, Kate↔Fahlholz 60.8,
// Kate↔GROVE 113.1 — alle stimmen mit der Plan-Tabelle überein (max. 1m
// Rundungs-Differenz), keine Repositionierung nötig.
// Silberauen: offene Kreaturen-Ebene (S2-Fauna), SANFTES Flatten (blend 30,
// kein hartes Plateau wie Dorf/Quidditch) — "einzelne Solitärbäume" bleiben
// dadurch möglich, nur der Kern (r) wird eben.
export const SILBERAUEN = { x: 300, z: 60, r: 40, blend: 30, h: 7 };
// Fahlholz: dunkler Hain, KEIN Flatten (Muster GROVE) — steht auf
// natürlichem Waldboden, r ist nur die Streu-/Ausschlusszone für die
// eigenen dichten Bäume (wildmark.js) und die generische Vegetation.
export const FAHLHOLZ = { x: 290, z: 150, r: 22 };
// Hügelgrab: kleine Grabhügel-Erhebung (Muster STONES, aber niedriger und
// enger). d0 vom Weltursprung ≈350 liegt knapp jenseits des Bergring-Starts
// (330) — der daraus resultierende minimale Grat-Einschlag (t≈0.14) liest
// sich bei einem Hügelgrab am Wildmark-Rand eher wie ein natürlicher
// Übergang zum Gebirge als wie ein Fehler (gleiche Lehre wie beim Moor).
export const HUEGELGRAB = { x: 350, z: -10, r: 12, h: 9 };
// Wispernde Kate: verlassenes Gebäude an einem Hang, KEIN Flatten (Muster
// GROVE/Fahlholz) — die Hang-Lage ist gewollt, die Wände gleichen kleine
// Bodenunterschiede selbst aus (wildmark.js).
export const KATE = { x: 230, z: 140, r: 10 };

// ---------- Aschenklamm (E4, PLAN-EPISCHE-WELT.md) ----------
// Vulkanische Schlucht im Osten, jenseits der Wildmark. Zentrum (395,110),
// d0≈411 — ≥110m Puffer bis zum neuen Bergring-Start (520, siehe E0), also
// sicher innerhalb des begehbaren Rings. Abstände zu den nächsten Alt-/
// Wildmark-Zonen (Zentren, gegen die echten Konstanten oben nachgerechnet):
// Silberauen 107,4 · Fahlholz 112,4 · Hügelgrab 128,2 · Kate 167,7 · GROVE
// 250,1 — der Einfluss-Radius hier (r+blend=67) plus der jeweils größte
// bestehende Einfluss (Hügelgrab r×2,6=31,2, der nächste) bleibt mit 98,2m
// klar unter jedem dieser Abstände, keine Terrain-Überlappung. Der "Lavasee"
// selbst ist bewusst KEIN Terrain-Tiefpunkt (kein Konflikt mit dem
// höhenbasierten Schwimm-Trigger aus player.js) — nur eine sanfte Senke als
// Schluchtboden, das Lava-Optik-Mesh + sein Sperr-Ring sitzen in
// aschenklamm.js oben auf normaler Gehhöhe.
export const ASCHENKLAMM = { x: 395, z: 110, r: 45, blend: 22, h: 3.5 };

// ---------- Frostzinnen (E5, PLAN-EPISCHE-WELT.md) ----------
// Eisige Bergzinnen im Norden, jenseits von Dorf/Bahnhof. Zentrum (0,-410),
// d0=410 — ≥110m Puffer bis zum Bergring-Start (520, wie Aschenklamm).
// Abstände zu den nächsten Alt-Zonen (echte Konstanten oben nachgerechnet):
// Dorf 193,1 · Bahnhof 208,9 · Nebelmoor 335,9 · Schloss-Plateau 390 ·
// Steinkreis 348,9 — der Einfluss-Radius hier (r+blend=67) plus Dorfs
// größter bestehender Einfluss (r×1,9=76, "Ebene Spielflächen"-Muster)
// bleibt mit 143m klar unter 193,1m, keine Terrain-Überlappung. Der
// "gefrorene See" ist bewusst fest begehbar (kein Terrain-Tiefpunkt UNTER
// der Wasserlinie, keine Loch-Mechanik) — player.js triggert Schwimmen rein
// höhenbasiert, ein Eis-Loch würfe den Spieler unkontrolliert ins
// Schwimm-System (Stolperfalle aus Plan-Abschnitt 6.3).
export const FROSTZINNEN = { x: 0, z: -410, r: 45, blend: 22, h: 9 };

// ---------- Silberhain (E6, PLAN-EPISCHE-WELT.md) ----------
// Heller Feen-Wald im Südwesten. Plan-Vorschlag (-285,300) lag bei
// nachgerechneter Distanz nur ~134,6m vom See-Zentrum entfernt (See selbst
// hat bereits r=125!) — mit Einfluss-Radius 67 hätte das den Kern klar in
// die See-Senke gelegt. Zentrum daher auf (-90,410) verschoben: d0≈419,8
// (bleibt im Plan-Zielband 390-430, ≥100m Puffer bis Bergring-Start 520),
// Abstand zum See 197,0 — der Kern (r=45) bleibt mit Nächstabstand 152m klar
// außerhalb von See.r (125), nur der äußerste Blend-Rand (45-67m vom
// Zentrum) reicht bis auf ~130m an den See heran, wo dessen eigener Randwert
// bereits gegen 0 geht (gleiche Güteklasse wie die dokumentierten minimalen
// Bergring-Einschläge bei Moor/Hügelgrab). Weitere Abstände: Bootshaus 252 ·
// Hagrid 298 · Quidditch 413,6 · Schloss-Plateau (Einfluss 130) 439,4 — alle
// klar frei. Sanfter Anstieg (kein Boss-Terrain wie Aschenklamm/Frostzinnen),
// da Silberhain keine Kampfregion ist.
export const SILBERHAIN = { x: -90, z: 410, r: 45, blend: 22, h: 6 };

// ---------- Schwarzwasser (E7, PLAN-EPISCHE-WELT.md) ----------
// Zweiter, dunkler See im Westen, jenseits des Quidditch-Felds. Plan-
// Vorschlag (-405,-40): d0=407,0 (Plan-Zielband 390-430, ≥110m Puffer bis
// Bergring-Start 520) — direkt übernommen, keine Kollision gefunden.
// Abstände zu allen realen Zonen-Konstanten nachgerechnet: Quidditch
// (r=52) 215,9 (Rand 163,9 frei) · Dorf (r=40) 385,1 · Bahnhof 341,2 ·
// Nebelmoor (r=55) 659,0 · Schloss-Plateau 405,5 · Hügelgrab 755,6 ·
// Silberauen 712,0 · Kate 660,0 · der GROSSE See (r=125!) 357,9 (Rand
// 232,9 frei — der bei Weitem kritischste Nachbar, da er selbst schon
// riesig ist, aber immer noch klar getrennt) · Aschenklamm 813,9 ·
// Frostzinnen 548,8 · Silberhain 549,4 — alle frei. "Kompakter" laut Plan:
// bewusst kleinerer Kernradius (40) als die drei anderen neuen Regionen
// (45), echte Wassertiefe wie beim großen See (Senke bis -5.5, siehe
// unten) statt begehbarem Boden — Tauchen/Schwimmen soll hier ECHT
// funktionieren (anders als der absichtlich feste Eissee in Frostzinnen).
export const SCHWARZWASSER = { x: -405, z: -40, r: 40, blend: 20, h: -5.5 };

// Wege als Polylinien (für Färbung + Freihalten von Bäumen)
export const PATHS = [
  [[0, 46], [0, 168]],                       // Tor → Kreuzung (über Viadukt)
  [[0, 168], [-84, 162]],                    // Kreuzung → Bootshaus
  [[-88, 158], [-140, 190]],                 // Bootshaus → Seeufer
  [[0, 168], [60, 185], [118, 198]],         // Kreuzung → Hagrids Hütte
  [[0, 168], [-90, 100], [-165, 40]],        // Kreuzung → Quidditch-Feld
  [[-90, 100], [-40, -60], [80, -100], [140, -98]], // Rundweg → Steinkreis
  [[140, -98], [190, -140], [240, -175]],    // Steinkreis-Rundweg → Nebelmoor
  [[-90, 100], [-80, -160], [-70, -230]],    // Rundweg → Dorf
  [[-70, -230], [-140, -255]],               // Dorf → Bahnhof
  [[140, -98], [260, -60], [350, -10]],      // Steinkreis-Rundweg → Hügelgrab (Wildmark)
  [[350, -10], [300, 60]],                   // Hügelgrab → Silberauen
  [[300, 60], [290, 150]],                   // Silberauen → Fahlholz
  [[290, 150], [230, 140]],                  // Fahlholz → Wispernde Kate
  [[230, 140], [95, 105]],                   // Kate → zurück zur Waldlichtung
  [[230, 140], [310, 125], [395, 110]],      // Kate → Aschenklamm (E4)
  [[-70, -230], [-30, -320], [0, -410]],     // Dorf → Frostzinnen (E5)
  [[-140, 190], [-110, 300], [-90, 410]],    // Seeufer → Silberhain (E6)
  [[-165, 40], [-280, 0], [-405, -40]],      // Quidditch-Rundweg → Schwarzwasser (E7)
];

// Kürzester Abstand zu EINER Polylinie (nicht dem gesamten PATHS-Bestand) —
// eigenständig, damit die Gleis-Trasse ihre eigene, engere Flatten-Zone
// bekommt, ohne versehentlich auch andere Wege anderswo mit-flachzuklopfen.
export function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const abx = bx - ax, abz = bz - az;
    const t = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
    const dx = x - (ax + abx * t), dz = z - (az + abz * t);
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

export function distToPaths(x, z) {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const abx = bx - ax, abz = bz - az;
      const t = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
      const dx = x - (ax + abx * t), dz = z - (az + abz * t);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

// ---------- Die zentrale Höhenfunktion ----------
export function terrainHeight(x, z) {
  // Sanfte Grundhügel
  let h = (fbm(x * 0.0052, z * 0.0052, 4) - 0.38) * 15;

  // Bergring am Weltrand (zerklüftete Grate statt glatter Wand). E0: Start/
  // Ende im selben Verhältnis wie vorher (330/470, Differenz 140) auf den
  // neuen WORLD_BOUND (660) hochskaliert, damit die Grat-Breite (in Metern)
  // gleich bleibt und sich nicht dünner/dichter anfühlt.
  const d0 = Math.sqrt(x * x + z * z);
  if (d0 > 520) {
    const t = smoothstep(520, 660, d0);
    const ridge = Math.abs(fbm(x * 0.013, z * 0.013, 4) - 0.5) * 2; // Grat-Noise
    h += t * t * 46 + ridge * t * 52 + fbm(x * 0.05, z * 0.05, 2) * t * 10;
  }

  // Damm/Weg vom Tor nach Süden (Trasse für das Viadukt)
  if (z > 28 && z < 185) {
    const t = clamp((z - 40) / 140, 0, 1);
    const target = 18 - t * 12; // 18 → 6
    const m = (1 - smoothstep(9, 30, Math.abs(x))) * smoothstep(28, 42, z) * (1 - smoothstep(155, 185, z));
    h = lerp(h, target, m);
  }

  // Schloss-Plateau (flach → Schloss steht eben)
  {
    const dp = Math.sqrt((x - PLATEAU.x) ** 2 + (z - PLATEAU.z) ** 2);
    const m = 1 - smoothstep(PLATEAU.r, PLATEAU.r + PLATEAU.blend, dp);
    h = lerp(h, PLATEAU.h, m);
  }

  // Schlucht (quer zum Damm — das Viadukt überspannt sie)
  {
    const mz = 1 - smoothstep(12, 27, Math.abs(z - RAVINE.z));
    const mx = 1 - smoothstep(130, 190, Math.abs(x));
    const m = mz * mx;
    if (m > 0.001) {
      const bottom = 1.2 + Math.max(0, Math.abs(x) - 70) * 0.06;
      h = lerp(h, bottom, m);
    }
  }

  // See-Senke
  {
    const dl = Math.sqrt((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2);
    const m = 1 - smoothstep(LAKE.r * 0.5, LAKE.r, dl);
    h = lerp(h, -5.5, m);
  }

  // Ebene Spielflächen
  for (const spot of [QUIDDITCH, HAGRID, BOATHOUSE, DORF]) {
    const d = Math.sqrt((x - spot.x) ** 2 + (z - spot.z) ** 2);
    const m = 1 - smoothstep(spot.r, spot.r * 1.9, d);
    h = lerp(h, spot.h, m);
  }

  // Gleis-Trasse: flacher Bahndamm (±6m Korridor), gleiche Zielhöhe wie DORF
  // (4) — verhindert jede Naht zwischen Dorf-Senke und Trasse.
  {
    const d = distToPolyline(x, z, TRASSE);
    const m = 1 - smoothstep(4, 6, d);
    h = lerp(h, DORF.h, m);
  }

  // Wege nicht unter Wasser: Senken entlang der Pfade leicht anheben
  {
    const pd = distToPaths(x, z);
    if (pd < 7 && h < 1.6) {
      const m = 1 - smoothstep(2.5, 7, pd);
      h = lerp(h, 1.6, m);
    }
  }

  // Hügel mit Steinkreis
  {
    const d = Math.sqrt((x - STONES.x) ** 2 + (z - STONES.z) ** 2);
    const m = 1 - smoothstep(STONES.r, STONES.r * 2.6, d);
    h = lerp(h, STONES.h + fbm(x * 0.05, z * 0.05, 2) * 1.5, m * 0.9);
  }

  // Nebelmoor-Senke (leicht buckelig, knapp über Wasserlinie — matschig,
  // aber begehbar). Zentrum d0≈297 vom Weltursprung, äußerster Kernrand
  // (ohne Blend) ≈352 — knapp JENSEITS des Bergring-Starts (330). Nur der
  // äußerste Zipfel des Kerns (dem Weltrand zugewandt) bekommt dadurch einen
  // minimalen Bergring-Einschlag (m≈0.07 im schlimmsten Punkt) — bei einem
  // Moor am Kartenrand liest sich das eher wie ein natürlicher Übergang zum
  // Gebirge als wie ein Fehler.
  {
    const d = Math.sqrt((x - MOOR.x) ** 2 + (z - MOOR.z) ** 2);
    const m = 1 - smoothstep(MOOR.r, MOOR.r + MOOR.blend, d);
    h = lerp(h, MOOR.h + fbm(x * 0.08, z * 0.08, 2) * 0.5, m);
  }

  // Silberauen (Wildmark-Kreaturen-Ebene, S1) — sanftes Flatten mit breitem
  // Blend, KEIN hartes Plateau (Muster MOOR, nicht Dorf/Quidditch), damit
  // die "einzelnen Solitärbäume" außerhalb des Kerns natürlich wirken.
  {
    const d = Math.sqrt((x - SILBERAUEN.x) ** 2 + (z - SILBERAUEN.z) ** 2);
    const m = 1 - smoothstep(SILBERAUEN.r, SILBERAUEN.r + SILBERAUEN.blend, d);
    h = lerp(h, SILBERAUEN.h + fbm(x * 0.04, z * 0.04, 2) * 1.2, m);
  }

  // Hügelgrab (Wildmark, S1) — kleine Erhebung, Muster Steinkreis-Hügel
  // aber niedriger/enger (r=12 statt 24).
  {
    const d = Math.sqrt((x - HUEGELGRAB.x) ** 2 + (z - HUEGELGRAB.z) ** 2);
    const m = 1 - smoothstep(HUEGELGRAB.r, HUEGELGRAB.r * 2.6, d);
    h = lerp(h, HUEGELGRAB.h + fbm(x * 0.06, z * 0.06, 2) * 1, m * 0.9);
  }

  // Aschenklamm (E4) — sanfte Senke wie MOOR, aber etwas rauer (fbm-Skala
  // gröber, wirkt zerklüfteter/vulkanischer statt matschig-glatt).
  {
    const d = Math.sqrt((x - ASCHENKLAMM.x) ** 2 + (z - ASCHENKLAMM.z) ** 2);
    const m = 1 - smoothstep(ASCHENKLAMM.r, ASCHENKLAMM.r + ASCHENKLAMM.blend, d);
    h = lerp(h, ASCHENKLAMM.h + fbm(x * 0.045, z * 0.045, 3) * 2.2, m);
  }

  // Frostzinnen (E5) — kleines, zerklüftetes Eis-Plateau (Muster Steinkreis-
  // Hügel, aber wie Aschenklamm mit weichem Blend statt hartem Rand).
  {
    const d = Math.sqrt((x - FROSTZINNEN.x) ** 2 + (z - FROSTZINNEN.z) ** 2);
    const m = 1 - smoothstep(FROSTZINNEN.r, FROSTZINNEN.r + FROSTZINNEN.blend, d);
    h = lerp(h, FROSTZINNEN.h + fbm(x * 0.05, z * 0.05, 3) * 2.5, m);
  }

  // Silberhain (E6) — sanfter Hain-Boden, feineres Rauschen als die beiden
  // Boss-Zonen (keine Kampfregion, soll ruhig/eben wirken statt zerklüftet).
  {
    const d = Math.sqrt((x - SILBERHAIN.x) ** 2 + (z - SILBERHAIN.z) ** 2);
    const m = 1 - smoothstep(SILBERHAIN.r, SILBERHAIN.r + SILBERHAIN.blend, d);
    h = lerp(h, SILBERHAIN.h + fbm(x * 0.035, z * 0.035, 3) * 1.6, m);
  }

  // Schwarzwasser-Senke (E7) — exakt gleiches Muster wie die See-Senke oben
  // (echte Wassertiefe, kein begehbarer Boden wie bei Frostzinnen/Silberhain):
  // Tauchen/Schwimmen soll hier ECHT auslösen (player.js: rein höhenbasiert).
  {
    const dw = Math.sqrt((x - SCHWARZWASSER.x) ** 2 + (z - SCHWARZWASSER.z) ** 2);
    const m = 1 - smoothstep(SCHWARZWASSER.r * 0.5, SCHWARZWASSER.r, dw);
    h = lerp(h, SCHWARZWASSER.h, m);
  }

  // Sicherheitsnetz gegen unsichtbares "Phantom-Wasser": das Grund-Rauschen
  // (Skala 0.0052, Wellenlänge ~190m) kann UNABHÄNGIG vom See irgendwo auf
  // der Karte unter die Schwimm-Schwelle (WATER_LEVEL-1.2) absacken, ohne
  // dass dort ein Wasser-Mesh liegt — player.js löst "Schwimmen" rein über
  // terrainHeight() aus. Gefunden: so eine Senke ~70-95m östlich des Sees,
  // bis dicht an Hagrids Hütte heran (kein Zusammenhang mit der See-Senke
  // oben — die endet bereits bei dl=LAKE.r=125, der Bug lag bei dl≈180-265).
  // Fix ist rein von h abhängig (nicht vom Ort) → keine Kante im Gelände,
  // nur echte Unterwasser-Höhen werden angehoben, alles ab h≥0.3 bleibt
  // unangetastet. dl-Schutz stellt sicher, dass die eigentliche Seefläche
  // (dort deckt ohnehin das Wasser-Mesh ab) nie betroffen ist. E7 (Schwarz-
  // wasser) braucht denselben zweiten Schutz — sonst würde dieses Netz die
  // gerade oben erst gebaute Schwarzwasser-Senke (h=-5.5, weit unter dem
  // -0.8-Schwellwert) sofort wieder auf ~1.0-1.6 anheben und den ganzen
  // neuen See unsichtbar verschwinden lassen (klassischer Stolperfallen-1-
  // Fehler: eine bestehende ortsunabhängige Regel nach einer NEUEN Senke
  // nicht gegenprüfen).
  {
    const dl = Math.sqrt((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2);
    const dw = Math.sqrt((x - SCHWARZWASSER.x) ** 2 + (z - SCHWARZWASSER.z) ** 2);
    if (dl > LAKE.r + 55 && dw > SCHWARZWASSER.r + 55) {
      const m = 1 - smoothstep(-0.8, 0.3, h);
      if (m > 0) {
        const floor = WATER_LEVEL + 0.6 + fbm(x * 0.05, z * 0.05, 2) * 0.6; // ~1.0–1.6
        h = lerp(h, floor, m);
      }
    }
  }

  return h;
}

// ---------- Terrain-Mesh ----------
// Texturen multiplizieren → Töne heller angelegt
const COL_GRASS_A = new THREE.Color(0x5c8a45);
const COL_GRASS_B = new THREE.Color(0x7da354);
const COL_DIRT = new THREE.Color(0x9c825e);
const COL_SAND = new THREE.Color(0xb0a077);
const COL_ROCK = new THREE.Color(0x8b8780);
const COL_SNOW = new THREE.Color(0xe8ecf2);
const COL_GOLD = new THREE.Color(0xd8c078); // Silberhain (E6): warm-goldener Waldboden

export function buildTerrain() {
  // E0: 220->300 (gleiche Vertex-DICHTE pro Meter wie vorher: 960/220≈4.36m,
  // 1500/300=5m — minimal gröber, aber Terrain-Vertexzahl bleibt mit 90.601
  // statt 48.841 handhabbar, siehe PLAN-EPISCHE-WELT.md Abschnitt 4).
  const segs = 300;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // Färbung nach Höhe / Steigung / Wegen
  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = normals.getY(i);
    const n = fbm(x * 0.03, z * 0.03, 3);

    c.copy(COL_GRASS_A).lerp(COL_GRASS_B, n);
    // Ufer / Sand
    if (y < 1.4) c.lerp(COL_SAND, clamp((1.4 - y) / 1.6, 0, 1));
    // Fels an steilen Hängen und in der Höhe
    const steep = 1 - smoothstep(0.62, 0.85, ny);
    c.lerp(COL_ROCK, Math.max(steep, smoothstep(24, 40, y)));
    // Schnee bleibt nur auf flacheren Lagen liegen
    c.lerp(COL_SNOW, smoothstep(44, 62, y) * smoothstep(0.5, 0.78, ny));
    // Frostzinnen (E5): Schneedecke unabhängig von der Höhe, nur nach Nähe
    // zur Zone — sonst bliebe das "eisige" Plateau grün wie der Rest der Welt.
    {
      const df = Math.hypot(x - FROSTZINNEN.x, z - FROSTZINNEN.z);
      c.lerp(COL_SNOW, (1 - smoothstep(FROSTZINNEN.r, FROSTZINNEN.r + FROSTZINNEN.blend + 25, df)) * 0.9);
    }
    // Silberhain (E6): warmer Goldton statt Schnee — "heller magischer Wald".
    {
      const ds = Math.hypot(x - SILBERHAIN.x, z - SILBERHAIN.z);
      c.lerp(COL_GOLD, (1 - smoothstep(SILBERHAIN.r, SILBERHAIN.r + SILBERHAIN.blend + 25, ds)) * 0.8);
    }
    // Wege
    const pd = distToPaths(x, z);
    if (pd < 5.5) c.lerp(COL_DIRT, (1 - smoothstep(2.6, 5.5, pd)) * 0.85);
    // dezente Helligkeitsvariation
    const v = 0.92 + fbm(x * 0.11, z * 0.11, 2) * 0.16;
    colors[i * 3] = c.r * v;
    colors[i * 3 + 1] = c.g * v;
    colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, getMaterials().terrain);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---------- Wasser ----------
// E7: parametrisiert (Zentrum/Radius/Farben), damit Schwarzwasser dieselbe
// Shader-Wasserfläche mit eigener (dunklerer) Farbgebung bekommt, ohne den
// Shader zu duplizieren. Ohne Argumente exakt das bisherige Verhalten (See).
export function buildWater(center = LAKE, colors = {}) {
  const deep = colors.deep ?? 0x14384d;
  const shallow = colors.shallow ?? 0x2a6a7d;
  const geo = new THREE.CircleGeometry(center.r + 55, 64);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.2) },
    uSunColor: { value: new THREE.Color(0xfff2cf) },
    uSky: { value: new THREE.Color(0x87b8e8) },
    uDeep: { value: new THREE.Color(deep) },
    uShallow: { value: new THREE.Color(shallow) },
    uNight: { value: 0 },
    uCenter: { value: new THREE.Vector2(center.x, center.z) },
    uR: { value: center.r },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSky;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uTime;
      uniform float uNight;
      uniform vec2 uCenter;
      uniform float uR;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float shoreDist = length(vWorld.xz - uCenter);
        // Wellen-Normale pro Pixel (zwei überlagerte Frequenzen)
        float nx = -0.09 * cos(vWorld.x * 0.11 + vWorld.z * 0.05 + uTime * 1.1)
                   - 0.06 * cos(vWorld.x * 0.43 + vWorld.z * 0.31 + uTime * 1.9)
                   - 0.045 * cos(vWorld.x * 0.83 - vWorld.z * 0.61 + uTime * 2.4);
        float nz = -0.08 * cos(vWorld.z * 0.13 - vWorld.x * 0.06 + uTime * 0.8)
                   - 0.055 * cos(vWorld.z * 0.47 - vWorld.x * 0.27 + uTime * 1.6)
                   - 0.04 * cos(vWorld.z * 0.71 + vWorld.x * 0.53 + uTime * 2.1);
        vec3 n = normalize(vec3(nx, 1.0, nz));
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 2.0);
        // Tiefe: Mitte dunkel, Rand heller
        vec3 col = mix(uDeep, uShallow, smoothstep(uR * 0.45, uR * 0.95, shoreDist));
        col = mix(col, uSky, fres * 0.7);
        // Sonnen-/Mond-Glitzern
        vec3 refl = reflect(-uSunDir, n);
        float spec = pow(max(dot(refl, viewDir), 0.0), 90.0);
        float sparkle = 0.6 + 0.4 * sin(vWorld.x * 2.1 + vWorld.z * 1.7 + uTime * 2.4);
        col += uSunColor * spec * sparkle * (1.2 - uNight * 0.5);
        // Uferschaum: schmaler, wandernder heller Saum direkt an der
        // Schilfkante. War ursprünglich 16m breit mit hoher Wellen-Frequenz
        // (2.6 rad/m) — aus flachem Blickwinkel (z.B. vom Bootshaus-Ufer aus)
        // projizierten die vielen Wellenzüge zu harten, parallelen Streifen
        // über einen Großteil der sichtbaren Wasserfläche statt eines
        // dezenten Schaumsaums. Jetzt schmaler (halb so breit) und mit
        // niedrigerer Frequenz + geringerem Kontrast.
        float foamBand = smoothstep(uR * 0.93, uR * 0.995, shoreDist);
        float foamWave = 0.55 + 0.45 * sin(shoreDist * 1.1 - uTime * 1.3
                          + sin(vWorld.x * 0.35 + uTime * 0.6) * 1.2);
        col = mix(col, vec3(0.88, 0.92, 0.94), foamBand * foamWave * (0.35 - uNight * 0.2));
        col *= (1.0 - uNight * 0.72);
        gl_FragColor = vec4(col, 0.88);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
