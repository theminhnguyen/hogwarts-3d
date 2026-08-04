// Gemeinsame Materialien mit Welt-Koordinaten-Mapping:
// Texturen werden über die Weltposition projiziert (triplanar bzw. von oben),
// dadurch sitzt das Mauerwerk auf jeder Form gleichmäßig — ganz ohne UV-Arbeit.

import * as THREE from 'three';
import {
  makeStoneTexture, makeRoofTexture, makeWoodTexture, makeGroundTexture, makeNormalMap,
} from './textures.js';

const VARYINGS = `
varying vec3 vWP;
varying vec3 vWN;
`;

const TRIPLANAR = `
#ifdef USE_MAP
  vec3 tpN = abs(normalize(vWN));
  tpN = pow(tpN, vec3(4.0));
  tpN /= (tpN.x + tpN.y + tpN.z);
  vec4 tpX = texture2D(map, vWP.zy * uTexScale);
  vec4 tpY = texture2D(map, vWP.xz * uTexScale);
  vec4 tpZ = texture2D(map, vWP.xy * uTexScale);
  diffuseColor *= (tpX * tpN.x + tpY * tpN.y + tpZ * tpN.z);
#endif
`;

const TOPDOWN = `
#ifdef USE_MAP
  diffuseColor *= texture2D(map, vWP.xz * uTexScale);
#endif
`;

// G2 (2026-07-31): Normal-Map ebenfalls welt-projizieren.
// three.js' eigener normal_fragment_maps-Chunk tastet die Normal-Map mit
// `vNormalMapUv` ab — also den MESH-EIGENEN UVs. Die Farbtextur liegt hier
// aber weltprojiziert darauf. Würde man den Standard-Chunk lassen, säße das
// Relief völlig woanders als die sichtbaren Fugen: Beleuchtung und Textur
// würden auseinanderlaufen. Deshalb dieselbe Projektion noch einmal für die
// Normalen, mit „UDN"-Blend (tangentiale Auslenkung je Achse ins Weltsystem
// drehen und auf die geometrische Normale addieren).
// `normal` ist an dieser Stelle im VIEW-Space, vWN im World-Space — daher am
// Ende die Multiplikation mit viewMatrix.
const TRIPLANAR_NORMAL = `
#ifdef USE_NORMALMAP
  {
    vec3 bw = abs(normalize(vWN));
    bw = pow(bw, vec3(4.0));
    bw /= (bw.x + bw.y + bw.z);
    vec3 sg = sign(vWN);
    vec3 nX = texture2D(normalMap, vWP.zy * uTexScale).xyz * 2.0 - 1.0;
    vec3 nY = texture2D(normalMap, vWP.xz * uTexScale).xyz * 2.0 - 1.0;
    vec3 nZ = texture2D(normalMap, vWP.xy * uTexScale).xyz * 2.0 - 1.0;
    nX.xy *= normalScale; nY.xy *= normalScale; nZ.xy *= normalScale;
    vec3 gN = normalize(vWN);
    // Das Vorzeichen je Achse ist nötig, sonst kippt das Relief auf
    // gegenüberliegenden Flächen einer Wand in die Gegenrichtung.
    vec3 wN = normalize(
      (gN + vec3(0.0, nX.y, nX.x * sg.x)) * bw.x +
      (gN + vec3(nY.x * sg.y, 0.0, nY.y)) * bw.y +
      (gN + vec3(nZ.x * sg.z, nZ.y, 0.0)) * bw.z
    );
    normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
  }
#endif
`;

const TOPDOWN_NORMAL = `
#ifdef USE_NORMALMAP
  {
    vec3 nT = texture2D(normalMap, vWP.xz * uTexScale).xyz * 2.0 - 1.0;
    nT.xy *= normalScale;
    vec3 gN = normalize(vWN);
    vec3 wN = normalize(gN + vec3(nT.x, 0.0, nT.y));
    normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
  }
#endif
`;

// Ersetzt das normale UV-Mapping des Materials durch Welt-Projektion
function worldMapped(mat, scale, mode = 'triplanar') {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTexScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VARYINGS)
      .replace('#include <uv_vertex>',
        '#include <uv_vertex>\n' +
        'vWP = (modelMatrix * vec4(position, 1.0)).xyz;\n' +
        'vWN = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + VARYINGS + '\nuniform float uTexScale;')
      .replace('#include <map_fragment>', mode === 'triplanar' ? TRIPLANAR : TOPDOWN)
      .replace('#include <normal_fragment_maps>', mode === 'triplanar' ? TRIPLANAR_NORMAL : TOPDOWN_NORMAL);
  };
  // eigener Cache-Key, sonst teilt three den Shader mit ungepatchten Materialien.
  // Der Normal-Map-Zustand gehört mit hinein: mit und ohne Relief sind es
  // verschiedene Programme.
  mat.customProgramCacheKey = () => `worldmap-${mode}-${scale}-${mat.normalMap ? 'n' : ''}`;
  return mat;
}

let cache = null;

// Grafik-Stufe (Nutzerwunsch 2026-07-31). Nur 'episch' wechselt die Material-
// KLASSE von Lambert auf MeshStandardMaterial (echtes PBR mit Glanzlicht,
// Rauheit und Umgebungsspiegelung). Das ist der mit Abstand grösste optische
// Hebel im Projekt: Lambert kennt ausschliesslich Streulicht, es gibt darin
// physikalisch KEINE Glanzkante — deshalb wirkt die Welt in 'schoen'/'schnell'
// flach, egal wie gut Tonemapping und Bloom sind.
//
// WICHTIG: muss vor dem ersten getMaterials() gesetzt werden (main.js ruft es
// direkt nach dem Laden des Saves auf, lange vor allen Build-Steps). Ein
// Wechsel zur Laufzeit ist bewusst NICHT möglich — die ~150 Material-Instanzen
// hängen längst in fertig gebauten Meshes in 20 Dateien; main.js lädt deshalb
// beim Umschalten die Seite neu (in echten Spielen ebenso üblich).
let tier = 'schoen';
export function setMaterialTier(t) {
  if (cache) return; // zu spät — Materialien stehen schon, Stufe gilt ab Neuladen
  tier = t;
}
export function getMaterialTier() { return tier; }

// PBR-Kennwerte der vier texturierten Grundmaterialien. roughness 1 = komplett
// matt (wie Lambert), 0 = Spiegel. Die Werte sind bewusst hoch gehalten: das
// hier ist ein Schloss aus Stein/Holz/Schiefer, kein Autolack — ein zu
// niedriger Wert lässt alles nach nassem Plastik aussehen.
const PBR = {
  // 0.96 ist der Wert, den das Mauerwerk seit jeher hat. Er steht hier
  // absichtlich unverändert: 'stone' war schon vor der Episch-Stufe das
  // einzige Standard-Material, wird also in ALLEN drei Stufen benutzt — jede
  // Änderung hier würde auch 'Schön' und 'Schnell' verändern, und die sollen
  // sich nicht anfassen lassen.
  stone:   { roughness: 0.96, metalness: 0.0 },
  roof:    { roughness: 0.72, metalness: 0.05 }, // Schiefer glänzt leicht
  wood:    { roughness: 0.85, metalness: 0.0 },
  deco:    { roughness: 0.68, metalness: 0.12 }, // Gold/Beschläge fangen Licht
  terrain: { roughness: 0.98, metalness: 0.0 },
};

// G2: Relief-Stärke je Material. Gelände bewusst schwach — man sieht es fast
// immer im flachen Winkel, dort wirkt starkes Relief schnell wie Bildrauschen.
const NORMAL_STRENGTH = { stone: 1.0, roof: 0.85, wood: 0.7, terrain: 0.45 };

// Hängt in 'episch' eine aus der Farbtextur abgeleitete Normal-Map an. Wird
// NUR dort aufgerufen — die Sobel-Ableitung kostet beim Start einmalig etwas
// Rechenzeit, die sich in den anderen Stufen nicht auszahlen würde (Lambert
// wertet normalMap gar nicht aus).
function withNormal(mat, kind, tex) {
  if (tier !== 'episch') return mat;
  mat.normalMap = makeNormalMap(tex);
  const s = NORMAL_STRENGTH[kind];
  mat.normalScale = new THREE.Vector2(s, s);
  return mat;
}

// Baut je nach Stufe ein Lambert- (schnell/schoen) oder Standard-Material
// (episch). Ausserhalb von 'episch' bleibt exakt das bisherige Verhalten —
// dieselbe Klasse, dieselben Parameter, kein zusätzlicher Shader-Aufwand.
function lit(kind, params) {
  if (tier !== 'episch') return new THREE.MeshLambertMaterial(params);
  return new THREE.MeshStandardMaterial({ ...params, ...PBR[kind] });
}

export function getMaterials() {
  if (cache) return cache;
  const stoneTex = makeStoneTexture();
  const roofTex = makeRoofTexture();
  const woodTex = makeWoodTexture();
  const groundTex = makeGroundTexture();

  cache = {
    // Mauerwerk: Blöcke ~1.2 m breit. War schon immer Standard (einziges
    // PBR-Material vor der Episch-Stufe) — bekommt jetzt nur noch seine
    // Kennwerte aus derselben PBR-Tabelle wie alle anderen.
    stone: worldMapped(withNormal(new THREE.MeshStandardMaterial({
      vertexColors: true, map: stoneTex, ...PBR.stone,
    }), 'stone', stoneTex), 1 / 6),
    // Dächer: Schindelreihen ~0.35 m
    roof: worldMapped(withNormal(lit('roof', { vertexColors: true, map: roofTex }), 'roof', roofTex), 1 / 4),
    // Holz
    wood: worldMapped(withNormal(lit('wood', { vertexColors: true, map: woodTex }), 'wood', woodTex), 1 / 3),
    // Deko ohne Textur (Gold, Fahnen, Hecken, Kürbisse …) — ohne Farbtextur
    // gibt es auch nichts, woraus sich ein Relief ableiten liesse.
    deco: lit('deco', { vertexColors: true }),
    // Fenster (unbeleuchtet, glüht nachts über color-Multiplikator)
    window: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // Gelände: Detail von oben projiziert, Kachel ~7 m
    terrain: worldMapped(withNormal(lit('terrain', { vertexColors: true, map: groundTex }), 'terrain', groundTex), 1 / 7, 'topdown'),
  };
  return cache;
}
