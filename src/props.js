// Natur & Leben: Wälder (instanziert, in Regionen für Culling), Felsen, Gras,
// Fackel-Flammen, Glühwürmchen, Vögel, Kaminrauch.

import * as THREE from 'three';
import { tint, addCircleBlocker } from './geo.js';
import {
  terrainHeight, distToPaths, WATER_LEVEL,
  PLATEAU, LAKE, QUIDDITCH, HAGRID, STONES, BOATHOUSE, MOOR,
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

// Platz frei? (nicht auf Wegen, im Schloss, im See, auf Spielflächen …)
function spotFree(x, z, h) {
  if (h < 1.6 || h > 34) return false;
  if (distToPaths(x, z) < 7) return false;
  const dPlat = Math.hypot(x - PLATEAU.x, z - PLATEAU.z);
  if (dPlat < 100) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) return false;
  if (Math.hypot(x - QUIDDITCH.x, z - QUIDDITCH.z) < 62) return false;
  if (Math.hypot(x - HAGRID.x, z - HAGRID.z) < 24) return false;
  if (Math.hypot(x - STONES.x, z - STONES.z) < 30) return false;
  if (Math.hypot(x - BOATHOUSE.x, z - BOATHOUSE.z) < 20) return false;
  if (Math.abs(x) < 12 && z > 28 && z < 190) return false; // Damm & Viadukt
  if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) return false; // totes Moor
  return true;
}

// Instanzen in 3×3 Regionen aufteilen → Frustum-/Schatten-Culling greift
function buildChunkedInstances(scene, geo, placements, { castShadow = true, doubleSide = false } = {}) {
  const chunks = new Map();
  for (const p of placements) {
    const key = `${Math.floor((p.x + 480) / 320)}_${Math.floor((p.z + 480) / 320)}`;
    if (!chunks.has(key)) chunks.set(key, []);
    chunks.get(key).push(p);
  }
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
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
      col.setScalar(0.85 + ((p.tint ?? 0.5)) * 0.3);
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

  // Bäume (Wald-Cluster über Noise-Maske)
  let tries = 0;
  while ((conifers.length < 660 || broadleaf.length < 260) && tries < 40000) {
    tries++;
    const x = (rng() * 2 - 1) * 410;
    const z = (rng() * 2 - 1) * 410;
    const h = terrainHeight(x, z);
    if (!spotFree(x, z, h)) continue;
    const forest = fbm(x * 0.006 + 3.7, z * 0.006 - 1.2, 3);
    const dense = forest > 0.52;
    if (!dense && rng() > 0.14) continue;
    const s = 0.75 + rng() * 0.85;
    const p = { x, y: h - 0.15, z, ry: rng() * Math.PI * 2, s, sy: 0.9 + rng() * 0.35, tint: rng() };
    if (forest > 0.58 || h > 20) {
      if (conifers.length < 660) { conifers.push(p); addCircleBlocker(x, z, 0.45 * s + 0.15, h - 1, h + 3); }
    } else if (broadleaf.length < 260) {
      broadleaf.push(p); addCircleBlocker(x, z, 0.5 * s + 0.15, h - 1, h + 3);
    }
  }

  // Felsen
  for (let i = 0; i < 400 && rocks.length < 150; i++) {
    const x = (rng() * 2 - 1) * 420;
    const z = (rng() * 2 - 1) * 420;
    const h = terrainHeight(x, z);
    if (h < 0.8 || h > 60) continue;
    if (distToPaths(x, z) < 5) continue;
    if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < 95) continue;
    if (Math.abs(x) < 12 && z > 28 && z < 190) continue;
    if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) continue;
    const s = 0.5 + rng() * rng() * 2.2;
    rocks.push({ x, y: h + s * 0.2, z, ry: rng() * Math.PI * 2, s, tint: rng() });
    if (s > 1.0) addCircleBlocker(x, z, s * 0.85, h - 1, h + s);
  }

  // Gras-Büschel
  for (let i = 0; i < 9000 && grass.length < 2400; i++) {
    const x = (rng() * 2 - 1) * 360;
    const z = (rng() * 2 - 1) * 360;
    const h = terrainHeight(x, z);
    if (h < 1.4 || h > 26) continue;
    if (distToPaths(x, z) < 3.2) continue;
    if (Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < 92) continue;
    if (Math.hypot(x - MOOR.x, z - MOOR.z) < MOOR.r + 10) continue;
    grass.push({ x, y: h, z, ry: rng() * Math.PI, s: 0.7 + rng() * 0.7, tint: rng() });
  }

  buildChunkedInstances(scene, coniferGeo(), conifers);
  buildChunkedInstances(scene, broadleafGeo(), broadleaf);
  buildChunkedInstances(scene, rockGeo(), rocks);
  buildChunkedInstances(scene, grassGeo(), grass, { castShadow: false });

  return { treeCount: conifers.length + broadleaf.length, rockCount: rocks.length, grassCount: grass.length };
}

// ---------- Bewegtes Leben ----------

export class LifeSystem {
  constructor(scene, glowTex, flamePositions) {
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
