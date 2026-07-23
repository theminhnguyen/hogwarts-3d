// Natur & Leben: Wälder (instanziert, in Regionen für Culling), Felsen, Gras,
// Fackel-Flammen, Glühwürmchen, Vögel, Kaminrauch.

import * as THREE from 'three';
import { tint, addCircleBlocker } from './geo.js';
import {
  terrainHeight, distToPaths, distToPolyline, WATER_LEVEL,
  PLATEAU, LAKE, QUIDDITCH, HAGRID, STONES, BOATHOUSE, MOOR, DORF, TRASSE,
  SILBERAUEN, FAHLHOLZ, HUEGELGRAB, KATE, ASCHENKLAMM, FROSTZINNEN, SILBERHAIN,
  SCHWARZWASSER,
} from './terrain.js';
import { fbm, mulberry32 } from './noise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGlowTexture } from './textures.js';

export { makeGlowTexture };

// ---------- Baum-Geometrien (facettiert, mit Form-Jitter) ----------

function jitter(geo, amount, seed) {
  const rng = mulberry32(seed);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) + (rng() - 0.5) * amount,
      pos.getY(i) + (rng() - 0.5) * amount * 0.6,
      pos.getZ(i) + (rng() - 0.5) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

function coniferGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.20, 0.40, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  parts.push(tint(trunk, 0x6b4f30));
  const tiers = [
    [2.6, 3.2, 1.5, 0x2c4a26],
    [2.15, 2.9, 3.3, 0x33552c],
    [1.65, 2.5, 5.1, 0x3b6132],
    [1.1, 2.1, 6.8, 0x437039],
  ];
  let k = 0;
  for (const [r, h, y, col] of tiers) {
    const cone = jitter(new THREE.ConeGeometry(r, h, 7), 0.22, 100 + k++);
    cone.translate(0, y + h / 2 - 0.8, 0);
    parts.push(tint(cone, col));
  }
  return mergeGeometries(parts, false);
}

function broadleafGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.26, 0.48, 3.0, 6);
  trunk.translate(0, 1.5, 0);
  parts.push(tint(trunk, 0x7a5c3c));
  const blobs = [
    [0, 4.8, 0, 2.5, 0x4f7636],
    [1.5, 3.9, 0.6, 1.7, 0x456b30],
    [-1.3, 4.2, -0.7, 1.6, 0x57813c],
    [0.2, 3.6, -1.4, 1.4, 0x4a7033],
  ];
  let k = 0;
  for (const [x, y, z, r, col] of blobs) {
    const s = jitter(new THREE.SphereGeometry(r, 6, 5), 0.3, 200 + k++);
    s.translate(x, y, z);
    parts.push(tint(s, col));
  }
  return mergeGeometries(parts, false);
}

function rockGeo() {
  const g = jitter(new THREE.IcosahedronGeometry(1, 1), 0.35, 300);
  g.scale(1, 0.72, 0.85);
  return tint(g, 0x9a958c);
}

function grassGeo() {
  // Drei schlanke Halm-Spitzen — liest sich aus jeder Entfernung als Büschel
  const parts = [];
  const greens = [0x7a9e4e, 0x88ac58, 0x6f9447];
  const offs = [[0, 0], [0.16, 0.10], [-0.13, 0.14]];
  for (let k = 0; k < 3; k++) {
    const h = 0.55 - k * 0.1;
    const spike = new THREE.ConeGeometry(0.10, h, 4, 1, true);
    spike.translate(offs[k][0], h / 2, offs[k][1]);
    spike.rotateY(k * 2.1);
    parts.push(tint(spike, greens[k]));
  }
  return mergeGeometries(parts, false);
}

// Wald-Dichte-Maske (dieselbe Formel wie beim Platzieren der Bäume in
// buildNature()) — exportiert, damit weather.js weiß, wo "Waldnähe" für
// fallende Blätter beginnt, ohne die Platzierungs-Arrays selbst zu kennen.
export function forestDensity(x, z) {
  return fbm(x * 0.006 + 3.7, z * 0.006 - 1.2, 3);
}

// Wind-Schwanken für Gras/Baumkronen: verschiebt `transformed` VOR der
// Instanz-Transformation (lokale Höhe = Ansatzpunkt für den Biege-Falloff),
// Phase pro Instanz aus der Übersetzungsspalte von instanceMatrix gehasht —
// dadurch schwanken alle Instanzen einer Charge nicht im Gleichschritt.
// uTime/uWind werden von außen (updateSway) pro Frame gesetzt.
function attachSway(mat, ampBase, heightNorm) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: 0.2 };
    shader.uniforms.uSwayAmp = { value: ampBase };
    shader.uniforms.uSwayH = { value: heightNorm };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
uniform float uWind;
uniform float uSwayAmp;
uniform float uSwayH;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float swayPhase = dot(instanceMatrix[3].xyz, vec3(1.7, 0.0, 1.3));
  float hr = clamp(transformed.y / uSwayH, 0.0, 1.0);
  hr *= hr;
  float sway = sin(uTime * 1.6 + swayPhase) * uWind * uSwayAmp * hr;
  transformed.x += sway;
  transformed.z += sway * 0.6;
#endif`);
    mat.userData.shader = shader;
  };
}

// Von main.js pro Frame aufgerufen: aktualisiert uTime/uWind aller Sway-
// Materialien (überlebt auch Shader-Neukompilierungen, da attachSway()
// userData.shader bei jedem onBeforeCompile-Aufruf neu setzt).
export function updateSway(materials, time, wind) {
  for (const m of materials) {
    const sh = m.userData.shader;
    if (!sh) continue;
    sh.uniforms.uTime.value = time;
    sh.uniforms.uWind.value = wind;
  }
}

// Platz frei? (nicht auf Wegen, im Schloss, im See, auf Spielflächen …)
function spotFree(x, z, h) {
  if (h < 1.6 || h > 34) return false;
  if (distToPaths(x, z) < 7) return false;
  const dPlat = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
  if (dPlat < 100) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) return false;
  // Schwarzwasser (E7): wie beim großen See reicht der reine Höhen-Gate für
  // Felsen/Gras (terrainHeight taucht dort ohnehin unter deren Schwellwerte)
  // — nur Bäume brauchen den expliziten Radius-Ausschluss (Muster LAKE oben).
  if (Math.hypot(x - SCHWARZWASSER.x, z - SCHWARZWASSER.z) < SCHWARZWASSER.r + 8) return false;
  if (Math.hypot(x - QUIDDITCH.x, z - QUIDDITCH.z) < 62) return false;
  if (Math.hypot(x - HAGRID.x, z - HAGRID.z) < 24) return false;
  if (Math.hypot(x - STONES.x, z - STONES.z) < 30) return false;
  if (Math.hypot(x - BOATHOUSE.x, z - BOATHOUSE.z) < 20) return false;
  if (Math.abs(x) < 12 && z > 28 && z < 190) return false; // Damm & Viadukt
  if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) return false; // totes Moor
  if (Math.hypot(x - DORF.x, z - DORF.z) < DORF.r + 10) return false; // Dorfplatz
  if (distToPolyline(x, z, TRASSE) < 8) return false; // Gleis-Trasse
  // Silberauen: nur der Kern bleibt frei ("einzelne Solitärbäume" entstehen
  // von selbst außerhalb — der bereits vorhandene 14%-Sparse-Zweig oben
  // reicht dafür, keine eigene Dichte-Logik nötig).
  if (Math.hypot(x - SILBERAUEN.x, z - SILBERAUEN.z) < SILBERAUEN.r * 0.45) return false;
  if (Math.hypot(x - FAHLHOLZ.x, z - FAHLHOLZ.z) < FAHLHOLZ.r + 5) return false; // eigener Mini-Batch
  if (Math.hypot(x - HUEGELGRAB.x, z - HUEGELGRAB.z) < HUEGELGRAB.r + 8) return false; // Grashügel frei
  if (Math.hypot(x - KATE.x, z - KATE.z) < KATE.r + 6) return false; // Gebäude-Grundstück
  if (Math.hypot(x - ASCHENKLAMM.x, z - ASCHENKLAMM.z) < ASCHENKLAMM.r + 10) return false; // Lavaklamm frei
  if (Math.hypot(x - FROSTZINNEN.x, z - FROSTZINNEN.z) < FROSTZINNEN.r + 10) return false; // Eisplateau frei
  // Silberhain (E6): wie Silberauen nur der Kern frei — soll ein dichter,
  // lebendiger Hain bleiben (Silberbaum + Pilzring), kein kahles Bossgelände.
  if (Math.hypot(x - SILBERHAIN.x, z - SILBERHAIN.z) < SILBERHAIN.r * 0.5) return false;
  return true;
}

// Instanzen in Regionen aufteilen → Frustum-/Schatten-Culling greift.
// PLAN-EPISCHE-WELT.md (E0): Offset 480->720 (= neuer WORLD_BOUND 660 + 60
// Marge, gleiches Muster wie vorher 430+50) nachgezogen. Die 320er-Chunkgröße
// selbst bleibt unverändert — sie bestimmt nur, wie fein Culling greift, nicht
// die Weltgröße; bei größerem Radius entstehen automatisch mehr Chunks
// (vorher 3×3, jetzt 5×5), keine "Riesen-Chunks".
function buildChunkedInstances(scene, geo, placements, { castShadow = true, doubleSide = false, sway = null, swayMaterials = null } = {}) {
  const chunks = new Map();
  for (const p of placements) {
    const key = `${Math.floor((p.x + 720) / 320)}_${Math.floor((p.z + 720) / 320)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(p);
  }
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (sway) {
    attachSway(mat, sway.amp, sway.height);
    swayMaterials?.push(mat);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const meshes = [];
  for (const list of chunks.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => {
      e.set(0, p.ry || 0, 0);
      q.setFromEuler(e);
      v.set(p.x, p.y, p.z);
      s.set(p.s, p.s * (p.sy || 1), p.s);
      m.compose(v, q, s);
      im.setMatrixAt(i, m);
      // E3 (PLAN-EPISCHE-WELT.md): "bessere Rinde/Laub-Töne" — statt reiner
      // Grauwert-Helligkeit jetzt ein leichter Warm/Kalt-Farbstich pro
      // Instanz (manche Bäume/Felsen minimal wärmer, andere kühler), on top
      // der bereits vorhandenen Helligkeits-Streuung.
      const b = 0.85 + ((p.tint ?? 0.5)) * 0.3;
      const warmth = ((p.tint ?? 0.5) - 0.5) * 0.12;
      col.setRGB(b + warmth, b, b - warmth * 0.6);
      im.setColorAt(i, col);
    });
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    im.matrixAutoUpdate = false;
    scene.add(im);
    meshes.push(im);
  }
  return meshes;
}

export function buildNature(scene) {
  const rng = mulberry32(4242);
  const conifers = [], broadleaf = [], rocks = [], grass = [];

  // Bäume (Wald-Cluster über Noise-Maske). PLAN-EPISCHE-WELT.md (E0):
  // Streuradius 410->640, Zielzahlen ~×2 (660->1320 / 260->520). tries-Limit
  // entsprechend hochgesetzt — die Trefferquote pro Versuch bleibt etwa
  // gleich (spotFree()/Dichte-Schwelle unverändert), aber die Fläche wächst
  // um Faktor ~2,4 UND die Zielzahl verdoppelt sich, macht zusammen ~×5.
  let tries = 0;
  while ((conifers.length < 1320 || broadleaf.length < 520) && tries < 200000) {
    tries++;
    const x = (rng() * 2 - 1) * 640;
    const z = (rng() * 2 - 1) * 640;
    const h = terrainHeight(x, z);
    if (!spotFree(x, z, h)) continue;
    const forest = fbm(x * 0.006 + 3.7, z * 0.006 - 1.2, 3);
    const dense = forest > 0.52;
    if (!dense && rng() > 0.14) continue;
    const s = 0.75 + rng() * 0.85;
    const p = { x, y: h - 0.15, z, ry: rng() * Math.PI * 2, s, sy: 0.9 + rng() * 0.35, tint: rng() };
    if (forest > 0.58 || h > 20) {
      if (conifers.length < 1320) { conifers.push(p); addCircleBlocker(x, z, 0.45 * s + 0.15, h - 1, h + 3); }
    } else if (broadleaf.length < 520) {
      broadleaf.push(p); addCircleBlocker(x, z, 0.5 * s + 0.15, h - 1, h + 3);
    }
  }

  // Felsen: Streuradius 420->650, Zielzahl ~×2 (150->300).
  for (let i = 0; i < 900 && rocks.length < 300; i++) {
    const x = (rng() * 2 - 1) * 650;
    const z = (rng() * 2 - 1) * 650;
    const h = terrainHeight(x, z);
    if (h < 0.8 || h > 60) continue;
    if (distToPaths(x, z) < 5) continue;
    if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < 95) continue;
    if (Math.abs(x) < 12 && z > 28 && z < 190) continue;
    if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) continue;
    if (Math.hypot(x - DORF.x, z - DORF.z) < DORF.r + 10) continue;
    if (distToPolyline(x, z, TRASSE) < 8) continue;
    // Silberauen: freies Grasland (keine Felsbrocken im Kern); Fahlholz/
    // Hügelgrab/Kate: Grundstück/Steinkranz-Fläche freihalten.
    if (Math.hypot(x - SILBERAUEN.x, z - SILBERAUEN.z) < SILBERAUEN.r * 0.45) continue;
    if (Math.hypot(x - FAHLHOLZ.x, z - FAHLHOLZ.z) < FAHLHOLZ.r + 5) continue;
    if (Math.hypot(x - HUEGELGRAB.x, z - HUEGELGRAB.z) < HUEGELGRAB.r + 5) continue;
    if (Math.hypot(x - KATE.x, z - KATE.z) < KATE.r + 6) continue;
    if (Math.hypot(x - ASCHENKLAMM.x, z - ASCHENKLAMM.z) < ASCHENKLAMM.r + 10) continue;
    if (Math.hypot(x - FROSTZINNEN.x, z - FROSTZINNEN.z) < FROSTZINNEN.r + 10) continue;
    if (Math.hypot(x - SILBERHAIN.x, z - SILBERHAIN.z) < SILBERHAIN.r * 0.5) continue;
    const s = 0.5 + rng() * rng() * 2.2;
    rocks.push({ x, y: h + s * 0.2, z, ry: rng() * Math.PI * 2, s, tint: rng() });
    if (s > 1.0) addCircleBlocker(x, z, s * 0.85, h - 1, h + s);
  }

  // Gras-Büschel: Streuradius 360->560, Zielzahl ~×2 (2400->4800).
  for (let i = 0; i < 20000 && grass.length < 4800; i++) {
    const x = (rng() * 2 - 1) * 560;
    const z = (rng() * 2 - 1) * 560;
    const h = terrainHeight(x, z);
    if (h < 1.4 || h > 26) continue;
    if (distToPaths(x, z) < 3.2) continue;
    if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < 92) continue;
    if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) continue;
    if (Math.hypot(x - DORF.x, z - DORF.z) < DORF.r + 10) continue;
    if (distToPolyline(x, z, TRASSE) < 8) continue;
    // Silberauen ("weites Grasland") und Hügelgrab ("Grashügel") bekommen
    // BEWUSST kein Gras-Ausschluss — nur Fahlholz (dunkler Waldboden ohne
    // Wiese) und Kate (staubiges Grundstück) bleiben grasfrei.
    if (Math.hypot(x - FAHLHOLZ.x, z - FAHLHOLZ.z) < FAHLHOLZ.r + 5) continue;
    if (Math.hypot(x - KATE.x, z - KATE.z) < KATE.r + 6) continue;
    if (Math.hypot(x - ASCHENKLAMM.x, z - ASCHENKLAMM.z) < ASCHENKLAMM.r + 10) continue;
    if (Math.hypot(x - FROSTZINNEN.x, z - FROSTZINNEN.z) < FROSTZINNEN.r + 10) continue;
    grass.push({ x, y: h, z, ry: rng() * Math.PI, s: 0.7 + rng() * 0.7, tint: rng() });
  }

  // Wind-Schwanken: Bäume dezent (×0.4 der Gras-Amplitude), Felsen gar nicht.
  const swayMaterials = [];
  buildChunkedInstances(scene, coniferGeo(), conifers, { sway: { amp: 0.14, height: 8 }, swayMaterials });
  buildChunkedInstances(scene, broadleafGeo(), broadleaf, { sway: { amp: 0.14, height: 8 }, swayMaterials });
  buildChunkedInstances(scene, rockGeo(), rocks);
  buildChunkedInstances(scene, grassGeo(), grass, { castShadow: false, sway: { amp: 0.35, height: 0.55 }, swayMaterials });

  // Baum-Positionen exportieren (S2-Bowtruckles brauchen echte Stämme, an
  // denen sie sitzen können — die Instanzen selbst sind gemergt/nicht
  // einzeln adressierbar, siehe W4-Kürbis-Lehre).
  const treeSpots = [];
  for (const p of conifers) treeSpots.push({ x: p.x, z: p.z });
  for (const p of broadleaf) treeSpots.push({ x: p.x, z: p.z });

  return {
    treeCount: conifers.length + broadleaf.length, rockCount: rocks.length, grassCount: grass.length,
    swayMaterials, treeSpots,
  };
}

// ---------- Bewegtes Leben ----------

export class LifeSystem {
  constructor(scene, glowTex, flamePositions, owlPerches = []) {
    this.scene = scene;
    this.time = 0;

    // Fackel-Flammen als Sprites
    this.flames = [];
    const flameMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const [x, y, z] of flamePositions) {
      const s = new THREE.Sprite(flameMat);
      s.position.set(x, y, z);
      s.scale.set(1.1, 1.5, 1);
      s.userData.phase = Math.random() * Math.PI * 2;
      scene.add(s);
      this.flames.push(s);
    }
    this.flameMat = flameMat;

    // Glühwürmchen (nachts in Waldnähe / am See)
    const rng = mulberry32(77);
    const N = 130;
    this.fireflyBase = new Float32Array(N * 3);
    this.fireflyPhase = new Float32Array(N);
    const pos = new Float32Array(N * 3);
    let placed = 0, guard = 0;
    while (placed < N && guard++ < 4000) {
      const x = (rng() * 2 - 1) * 330;
      const z = (rng() * 2 - 1) * 330;
      const h = terrainHeight(x, z);
      if (h < 0.8 || h > 24) continue;
      const i = placed++;
      this.fireflyBase[i * 3] = x;
      this.fireflyBase[i * 3 + 1] = Math.max(h, WATER_LEVEL) + 0.8 + rng() * 2.2;
      this.fireflyBase[i * 3 + 2] = z;
      this.fireflyPhase[i] = rng() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.fireflyGeo = g;
    this.fireflyMat = new THREE.PointsMaterial({
      map: glowTex, color: 0xb8e86a, size: 0.55, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    const points = new THREE.Points(g, this.fireflyMat);
    points.frustumCulled = false;
    scene.add(points);

    // Vögel (tagsüber, kreisen ums Schloss)
    this.birds = [];
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -0.6, 0, 0, 0, 0.08, 0.25, 0, 0.08, -0.25,
      0.6, 0, 0, 0, 0.08, -0.25, 0, 0.08, 0.25,
    ]), 3));
    birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1d222c, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const bird = new THREE.Mesh(birdGeo, birdMat);
      bird.userData = {
        r: 55 + rng() * 45, h: 55 + rng() * 25,
        speed: 0.18 + rng() * 0.12, a: rng() * Math.PI * 2,
        cx: (rng() - 0.5) * 60, cz: -20 + (rng() - 0.5) * 60,
        flap: rng() * Math.PI * 2,
      };
      scene.add(bird);
      this.birds.push(bird);
    }

    // Eulen (Eulerei): tags auf der Sitzstange, nachts kreisend um den Turm
    this.owls = [];
    if (owlPerches.length) {
      const eyeMat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xffcf6b, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const owlWingMat = new THREE.MeshBasicMaterial({ color: 0x4a3a28, side: THREE.DoubleSide });
      const owlHeadGeo = new THREE.SphereGeometry(0.14, 7, 5);
      const owlHeadMat = new THREE.MeshLambertMaterial({ color: 0x5a4632, flatShading: true });
      const OWL_COUNT = 4;
      for (let i = 0; i < OWL_COUNT; i++) {
        const perch = owlPerches[i % owlPerches.length];
        const group = new THREE.Group();
        const wings = new THREE.Mesh(birdGeo, owlWingMat);
        wings.scale.set(1.4, 1.4, 1.4);
        group.add(wings);
        const head = new THREE.Mesh(owlHeadGeo, owlHeadMat);
        head.position.set(0, 0.1, 0.42);
        group.add(head);
        const eyes = new THREE.Sprite(eyeMat.clone());
        eyes.scale.set(0.18, 0.11, 1);
        eyes.position.set(0, 0.1, 0.5);
        group.add(eyes);
        scene.add(group);
        this.owls.push({
          group, wings, eyes,
          sitX: perch.x + (i - (OWL_COUNT - 1) / 2) * 0.7,
          sitY: perch.y, sitZ: perch.z,
          cx: perch.x, cz: perch.z, cy: perch.y + 5,
          r: 5 + (i % 3) * 1.6, speed: 0.09 + rng() * 0.05, a: rng() * Math.PI * 2,
          flap: rng() * Math.PI * 2,
        });
      }
    }

    // Rauch aus Hagrids Schornstein
    this.smoke = [];
    const smokeMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x9aa0a8, transparent: true, opacity: 0.25, depthWrite: false,
    });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData.t = i / 8;
      this.scene.add(s);
      this.smoke.push(s);
    }
  }

  update(dt, skyState) {
    this.time += dt;
    const t = this.time;
    const night = skyState.nightGlow;

    // Flammen flackern
    for (const f of this.flames) {
      const p = f.userData.phase;
      const flick = 0.85 + Math.sin(t * 11 + p) * 0.1 + Math.sin(t * 23 + p * 2) * 0.06;
      f.scale.set(1.0 * flick, 1.45 * flick, 1);
    }
    this.flameMat.opacity = 0.45 + night * 0.5;

    // Glühwürmchen
    this.fireflyMat.opacity = night * 0.9;
    if (night > 0.02) {
      const pos = this.fireflyGeo.attributes.position.array;
      for (let i = 0; i < this.fireflyPhase.length; i++) {
        const p = this.fireflyPhase[i];
        pos[i * 3] = this.fireflyBase[i * 3] + Math.sin(t * 0.7 + p) * 1.6;
        pos[i * 3 + 1] = this.fireflyBase[i * 3 + 1] + Math.sin(t * 1.1 + p * 2) * 0.6;
        pos[i * 3 + 2] = this.fireflyBase[i * 3 + 2] + Math.cos(t * 0.6 + p) * 1.6;
      }
      this.fireflyGeo.attributes.position.needsUpdate = true;
    }

    // Vögel
    const day = skyState.daylight;
    for (const bird of this.birds) {
      bird.visible = day > 0.4;
      if (!bird.visible) continue;
      const u = bird.userData;
      u.a += u.speed * dt;
      u.flap += dt * 9;
      bird.position.set(
        u.cx + Math.cos(u.a) * u.r,
        u.h + Math.sin(u.a * 2.3) * 3,
        u.cz + Math.sin(u.a) * u.r
      );
      bird.rotation.y = -u.a;
      bird.scale.y = 0.4 + Math.abs(Math.sin(u.flap)) * 1.4;
    }

    // Eulen: sanfter Übergang Sitzstange → Kreisflug mit einsetzender Nacht
    for (const o of this.owls) {
      const flyT = Math.max(0, Math.min(1, (night - 0.3) / 0.25));
      o.a += o.speed * dt * flyT;
      o.flap += dt * 7;
      const cx = o.cx + Math.cos(o.a) * o.r, cz = o.cz + Math.sin(o.a) * o.r;
      const cy = o.cy + Math.sin(o.a * 1.7) * 1.2;
      o.group.position.set(
        o.sitX + (cx - o.sitX) * flyT,
        o.sitY + Math.sin(t * 0.3 + o.flap) * 0.02 + (cy - o.sitY) * flyT,
        o.sitZ + (cz - o.sitZ) * flyT
      );
      const sitYaw = Math.sin(t * 0.25 + o.flap) * 0.3;
      const flyYaw = -o.a + Math.PI / 2;
      o.group.rotation.y = sitYaw + (flyYaw - sitYaw) * flyT;
      o.wings.scale.y = 1.4 * (0.35 + flyT * (Math.abs(Math.sin(o.flap)) * 1.1 - 0.35));
      o.eyes.material.opacity = flyT * 0.9;
    }

    // Rauch steigt auf
    for (const s of this.smoke) {
      s.userData.t += dt * 0.12;
      if (s.userData.t > 1) s.userData.t -= 1;
      const k = s.userData.t;
      s.position.set(
        HAGRID.x + 3.4 + Math.sin(k * 9 + t * 0.3) * (0.4 + k * 2.2),
        HAGRID.h + 7.4 + k * 9,
        HAGRID.z + 1.5 + Math.cos(k * 7) * (0.3 + k * 1.6)
      );
      const sc = 0.8 + k * 3.2;
      s.scale.set(sc, sc, 1);
      s.material.opacity = 0.22 * (1 - k);
    }
  }
}
