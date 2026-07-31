// Gemeinsame Materialien mit Welt-Koordinaten-Mapping:
// Texturen werden über die Weltposition projiziert (triplanar bzw. von oben),
// dadurch sitzt das Mauerwerk auf jeder Form gleichmäßig — ganz ohne UV-Arbeit.

import * as THREE from 'three';
import {
  makeStoneTexture, makeRoofTexture, makeWoodTexture, makeGroundTexture,
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
      .replace('#include <map_fragment>', mode === 'triplanar' ? TRIPLANAR : TOPDOWN);
  };
  // eigener Cache-Key, sonst teilt three den Shader mit ungepatchten Materialien
  mat.customProgramCacheKey = () => `worldmap-${mode}-${scale}`;
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
  stone:   { roughness: 0.94, metalness: 0.0 },
  roof:    { roughness: 0.72, metalness: 0.05 }, // Schiefer glänzt leicht
  wood:    { roughness: 0.85, metalness: 0.0 },
  deco:    { roughness: 0.68, metalness: 0.12 }, // Gold/Beschläge fangen Licht
  terrain: { roughness: 0.98, metalness: 0.0 },
};

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
    stone: worldMapped(new THREE.MeshStandardMaterial({
      vertexColors: true, map: stoneTex, ...PBR.stone,
    }), 1 / 6),
    // Dächer: Schindelreihen ~0.35 m
    roof: worldMapped(lit('roof', { vertexColors: true, map: roofTex }), 1 / 4),
    // Holz
    wood: worldMapped(lit('wood', { vertexColors: true, map: woodTex }), 1 / 3),
    // Deko ohne Textur (Gold, Fahnen, Hecken, Kürbisse …)
    deco: lit('deco', { vertexColors: true }),
    // Fenster (unbeleuchtet, glüht nachts über color-Multiplikator)
    window: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // Gelände: Detail von oben projiziert, Kachel ~7 m
    terrain: worldMapped(lit('terrain', { vertexColors: true, map: groundTex }), 1 / 7, 'topdown'),
  };
  return cache;
}
