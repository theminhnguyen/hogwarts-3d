// Ambient-Massen (E9, PLAN-EPISCHE-WELT.md): reine Atmosphäre, kein Kampf,
// keine Interaktion, kein Save-Feld nötig (genau wie props.js' LifeSystem —
// Vögel/Glühwürmchen/Rauch haben dort auch keinen persistenten Zustand).
// Vier Bausteine, jeder so billig wie möglich gehalten ("Instancing +
// Streaming, minimale CPU" laut Plan):
//   1) EINE wandernde Reh-Herde (instanced, 14 Tiere, gemeinsames Wander-Ziel)
//   2) 3 zusätzliche Vogelschwärme (Muster aus props.js' LifeSystem übernommen)
//   3) Fischschwärme im großen See UND in Schwarzwasser (je 1 InstancedMesh)
//   4) Eine gelegentliche Wildmark-Karawane (Silberauen-Fahlholz-Kate-Route)
// Die ferne Drachen-Silhouette (Plan 6.6) hängt thematisch hier mit dran,
// lebt aber als eigene Funktion, da sie mit den restlichen Bausteinen nichts
// teilt.

import * as THREE from 'three';
import {
  terrainHeight, LAKE, SCHWARZWASSER, SILBERAUEN, FAHLHOLZ, KATE, ASCHENKLAMM,
  WATER_LEVEL, PATHS,
} from './terrain.js';
import { GeoBatch } from './geo.js';
import { getMaterials } from './materials.js';
import { buildFigure, animateFigure } from './npc.js';
import { makeDragonSilhouetteTexture } from './textures.js';
import { mulberry32 } from './noise.js';

function rand(a, b) { return a + Math.random() * (b - a); }
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// Baut eine einzelne, LOKAL zentrierte Geometrie aus einem GeoBatch (statt
// eines fertigen Mesh) — Hilfsfunktion, damit Herde/Fische ihre Silhouette
// aus mehreren Primitiven zusammensetzen können, aber trotzdem als EINE
// InstancedMesh-Geometrie enden (nötig für viele billige Instanzen).
function batchGeometry(build) {
  const batch = new GeoBatch();
  build(batch);
  const mesh = batch.build(getMaterials().deco, {});
  return mesh ? mesh.geometry : new THREE.BufferGeometry();
}

// ============================================================ 1) Reh-Herde ============
// (30,140): offene Wiese zwischen Quidditch-Feld, Hagrids Hütte, Bootshaus
// und dem großen See — gegen alle vier nachgerechnet (>25m Puffer zum
// jeweiligen Zonenrand, auch bei maximalem Herden-Wanderradius). Erster
// Versuch (100,-30) lag versehentlich fast auf dem Eulerei-Turm (W4,
// 95,-25) — beim Browser-Test bemerkt (Spieler stand plötzlich vor einer
// Turmwand statt auf offener Wiese).
const HERD_CENTER = { x: 30, z: 140 };
const HERD_RADIUS = 65;
const HERD_COUNT = 14;
const HERD_TUNING = { speed: 1.6, wanderSpeed: 0.9, jitterR: 7, retarget: 6 };

function buildDeerBlobGeometry() {
  return batchGeometry((batch) => {
    batch.add(new THREE.BoxGeometry(0.5, 0.55, 1.05), 0x5a3f28, 0, 0.5, 0);
    batch.add(new THREE.ConeGeometry(0.16, 0.42, 5).rotateX(Math.PI / 2.1), 0x4a3220, 0, 0.72, 0.62);
    for (const s of [-1, 1]) {
      batch.add(new THREE.ConeGeometry(0.07, 0.2, 4), 0x4a3220, s * 0.1, 0.95, 0.68);
    }
  });
}

function buildHerd(scene) {
  const geo = buildDeerBlobGeometry();
  const mesh = new THREE.InstancedMesh(geo, getMaterials().deco, HERD_COUNT);
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  const rng = mulberry32(4242);
  const leader = { x: HERD_CENTER.x, z: HERD_CENTER.z, tx: HERD_CENTER.x, tz: HERD_CENTER.z, retargetT: 0 };
  const members = [];
  for (let i = 0; i < HERD_COUNT; i++) {
    const a = rng() * Math.PI * 2, r = rng() * HERD_TUNING.jitterR;
    members.push({
      offX: Math.cos(a) * r, offZ: Math.sin(a) * r,
      x: HERD_CENTER.x + Math.cos(a) * r, z: HERD_CENTER.z + Math.sin(a) * r,
      yaw: a, bobPhase: rng() * Math.PI * 2, jitterT: rng() * 3,
    });
  }

  const dummy = new THREE.Object3D();
  return {
    update(dt) {
      leader.retargetT -= dt;
      if (leader.retargetT <= 0) {
        leader.retargetT = HERD_TUNING.retarget + rng() * 4;
        const a = rng() * Math.PI * 2, r = rng() * HERD_RADIUS;
        leader.tx = HERD_CENTER.x + Math.cos(a) * r;
        leader.tz = HERD_CENTER.z + Math.sin(a) * r;
      }
      {
        const dx = leader.tx - leader.x, dz = leader.tz - leader.z;
        const d = Math.hypot(dx, dz) || 1;
        leader.x += (dx / d) * HERD_TUNING.wanderSpeed * dt;
        leader.z += (dz / d) * HERD_TUNING.wanderSpeed * dt;
      }
      for (let i = 0; i < members.length; i++) {
        const m = members[i];
        m.jitterT -= dt;
        if (m.jitterT <= 0) {
          m.jitterT = rand(4, 9);
          const a = rng() * Math.PI * 2, r = rng() * HERD_TUNING.jitterR;
          m.offX = Math.cos(a) * r; m.offZ = Math.sin(a) * r;
        }
        const tx = leader.x + m.offX, tz = leader.z + m.offZ;
        const dx = tx - m.x, dz = tz - m.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          m.x += (dx / d) * HERD_TUNING.speed * dt;
          m.z += (dz / d) * HERD_TUNING.speed * dt;
          m.yaw = angleLerp(m.yaw, Math.atan2(dx, dz), Math.min(1, dt * 3));
        }
        const y = terrainHeight(m.x, m.z) + Math.abs(Math.sin(m.bobPhase + m.jitterT * 3)) * 0.05;
        dummy.position.set(m.x, y, m.z);
        dummy.rotation.set(0, m.yaw, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ============================================================ 2) Vogelschwärme ============
// Dasselbe Muster wie props.js' LifeSystem.birds (6 Vögel, kreisen ums
// Schloss) — hier 3 weitere, unabhängige Schwärme über anderen Wahrzeichen,
// damit auch abseits des Schlosses etwas am Himmel lebt. Bewusst eigene,
// einfache Meshes statt Instancing (nur 6 Stück je Schwarm, geteilte
// Geometrie/Material — für diese Größenordnung lohnt sich Instancing nicht).
const BIRD_SWARM_SPOTS = [
  { cx: LAKE.x, cz: LAKE.z, r: 70, h: 60 },
  { cx: SILBERAUEN.x, cz: SILBERAUEN.z, r: 55, h: 50 },
  { cx: (FAHLHOLZ.x + KATE.x) / 2, cz: (FAHLHOLZ.z + KATE.z) / 2, r: 45, h: 45 },
];
const BIRDS_PER_SWARM = 6;

function buildBirdGeometry() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -0.6, 0, 0, 0, 0.08, 0.25, 0, 0.08, -0.25,
    0.6, 0, 0, 0, 0.08, -0.25, 0, 0.08, 0.25,
  ]), 3));
  geo.computeVertexNormals();
  return geo;
}

function buildBirdSwarms(scene) {
  const geo = buildBirdGeometry();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1d222c, side: THREE.DoubleSide });
  const rng = mulberry32(5151);
  const birds = [];
  for (const spot of BIRD_SWARM_SPOTS) {
    for (let i = 0; i < BIRDS_PER_SWARM; i++) {
      const bird = new THREE.Mesh(geo, mat);
      bird.userData = {
        cx: spot.cx, cz: spot.cz, h: spot.h + rng() * 15,
        r: spot.r * (0.5 + rng() * 0.5), speed: 0.15 + rng() * 0.1,
        a: rng() * Math.PI * 2, flap: rng() * Math.PI * 2,
      };
      scene.add(bird);
      birds.push(bird);
    }
  }
  return {
    update(dt, skyState) {
      const visible = skyState.daylight > 0.4;
      for (const bird of birds) {
        bird.visible = visible;
        if (!visible) continue;
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
    },
  };
}

// ============================================================ 3) Fischschwärme ============
function buildFishGeometry() {
  return batchGeometry((batch) => {
    batch.add(new THREE.ConeGeometry(0.09, 0.22, 5).rotateX(-Math.PI / 2), 0x6a8a9a, 0, 0, 0.06);
    batch.add(new THREE.ConeGeometry(0.09, 0.14, 5).rotateX(Math.PI / 2), 0x5a7a8a, 0, 0, -0.13);
  });
}

function buildFishSwarm(scene, geo, mat, center, radius, count, depthMin, depthMax, seed) {
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const rng = mulberry32(seed);
  const fish = [];
  for (let i = 0; i < count; i++) {
    fish.push({
      a: rng() * Math.PI * 2, r: rng() * radius * 0.75,
      speed: 0.25 + rng() * 0.25, dir: rng() > 0.5 ? 1 : -1,
      depth: rand(depthMin, depthMax), phase: rng() * Math.PI * 2,
    });
  }
  const dummy = new THREE.Object3D();
  return {
    update(dt, t) {
      for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        f.a += f.speed * f.dir * dt * 0.3;
        const x = center.x + Math.cos(f.a) * f.r;
        const z = center.z + Math.sin(f.a) * f.r;
        const y = WATER_LEVEL - f.depth + Math.sin(t * 0.8 + f.phase) * 0.15;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, -f.a * f.dir + (f.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 3 + f.phase) * 0.2, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function buildFishSwarms(scene) {
  const geo = buildFishGeometry();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.85 });
  const lakeSwarm = buildFishSwarm(scene, geo, mat, LAKE, LAKE.r, 12, 1.2, 3.5, 6161);
  const swSwarm = buildFishSwarm(scene, geo, mat, SCHWARZWASSER, SCHWARZWASSER.r, 6, 1.5, 4.5, 6262);
  return {
    update(dt, t) {
      lakeSwarm.update(dt, t);
      swSwarm.update(dt, t);
    },
  };
}

// ============================================================ 4) Wildmark-Karawane ============
// Route: Silberauen -> Fahlholz -> Kate (echte PATHS-Segmente aus S1), im
// Wechsel aktiv/unterwegs und für längere Zeit "andernorts" (Plan: "gelegentliche"
// Karawane) — rein Session-Zustand, kein Save-Feld nötig (wie Kyrians Duell
// in silberhain.js: Sichtbarkeit ist reiner Zeit-Zyklus, kein Fortschritt).
const CARAVAN_PATH = [...PATHS[11], ...PATHS[12].slice(1)];
const CARAVAN_CYCLE = 220; // s: Gesamtzyklus
const CARAVAN_ACTIVE = 130; // s: davon unterwegs sichtbar
const CARAVAN_SPEED = 2.0;

function buildWagon(scene) {
  const mats = getMaterials();
  const group = new THREE.Group();
  const batch = new GeoBatch();
  batch.add(new THREE.BoxGeometry(1.5, 0.9, 2.4), 0x6a4a2e, 0, 0.85, 0);
  batch.add(new THREE.BoxGeometry(1.7, 0.5, 2.6), 0xc9b27a, 0, 1.45, 0);
  batch.add(new THREE.ConeGeometry(1.15, 0.6, 4), 0xc9b27a, 0, 1.75, 0, Math.PI / 4, 1.06, 1, 1.13);
  const body = batch.build(mats.wood, { castShadow: true });
  if (body) group.add(body);

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.16, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1c, flatShading: true });
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 0.7], [0.85, 0.7], [-0.85, -0.7], [0.85, -0.7]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.38, wz);
    wheel.castShadow = true;
    group.add(wheel);
    wheels.push(wheel);
  }

  const merchant = buildFigure(0x8a4a2a, 0x3a2c1c, 0x4a3323, 0x6a5a3a, false, 2);
  for (const m of merchant.mats) m.opacity = 1;
  merchant.group.position.set(-1.7, 0, 0.2);
  group.add(merchant.group);

  scene.add(group);
  group.visible = false;
  return { group, wheels, merchant };
}

function buildCaravan(scene) {
  const wagon = buildWagon(scene);
  let idx = 1, dir = 1, active = false, rollT = 0;

  function resetJourney() {
    const [sx, sz] = CARAVAN_PATH[0];
    wagon.group.position.set(sx, terrainHeight(sx, sz), sz);
    idx = 1; dir = 1;
  }
  resetJourney();

  return {
    update(dt, t) {
      const phase = t % CARAVAN_CYCLE;
      const shouldBeActive = phase < CARAVAN_ACTIVE;
      if (shouldBeActive && !active) { active = true; resetJourney(); }
      else if (!shouldBeActive && active) { active = false; }
      wagon.group.visible = active;
      if (!active) return;

      const [tx, tz] = CARAVAN_PATH[idx];
      const dx = tx - wagon.group.position.x, dz = tz - wagon.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) {
        idx += dir;
        if (idx >= CARAVAN_PATH.length) { idx = CARAVAN_PATH.length - 2; dir = -1; }
        else if (idx < 0) { idx = 1; dir = 1; }
      } else {
        const nx = dx / d, nz = dz / d;
        wagon.group.position.x += nx * CARAVAN_SPEED * dt;
        wagon.group.position.z += nz * CARAVAN_SPEED * dt;
        wagon.group.position.y = terrainHeight(wagon.group.position.x, wagon.group.position.z);
        wagon.group.rotation.y = Math.atan2(nx, nz);
        rollT += dt * CARAVAN_SPEED * 2.2;
        for (const w of wagon.wheels) w.rotation.x = rollT;
        animateFigure(wagon.merchant, dt, true);
      }
    },
  };
}

// ============================================================ 5) Ferne Drachen-Silhouette ============
// Nur Deko, bewusst UNABHÄNGIG vom echten Drachen-Zustand in aschenklamm.js
// (Plan 6.6: "weithin sichtbares Ansteuer-Ziel") — würde man sie an
// dragon.state koppeln, bräuchte main.js eine Referenz quer durch zwei
// unabhängige Regionen/Module für einen rein kosmetischen Effekt.
// Beim Browser-Test verschwand die Silhouette (ursprünglich y=190, normaler
// Tiefentest) von mehreren Spielerpositionen aus HINTER dem näheren Bergring
// (terrain.js, d0 520-660, türmt sich stellenweise bis ~110-120m auf) — der
// Kamm liegt näher an der Kamera und gewinnt den Tiefentest trotz geringerer
// absoluter Höhe. Fix (siehe buildDragonSilhouette): depthTest:false auf dem
// Sprite-Material, exakt wie Mond/Sonne/Sterne in sky.js schon "unendlich
// fern" wirken — die Silhouette wird dadurch NIE vom Bergring verdeckt,
// unabhängig von Blickwinkel oder Spielerposition. y=300 bleibt trotzdem
// bei einer plausiblen "hoch fliegend"-Höhe statt exakt auf Kammhöhe.
const DRAGON_SIL_BEARING = Math.atan2(ASCHENKLAMM.z, ASCHENKLAMM.x);
const DRAGON_SIL_DIST = 800;
const DRAGON_SIL_CENTER = {
  x: Math.cos(DRAGON_SIL_BEARING) * DRAGON_SIL_DIST,
  z: Math.sin(DRAGON_SIL_BEARING) * DRAGON_SIL_DIST,
  y: 300,
};

function buildDragonSilhouette(scene) {
  const mat = new THREE.SpriteMaterial({
    map: makeDragonSilhouetteTexture(), transparent: true, opacity: 0.8,
    depthWrite: false, depthTest: false, fog: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(220, 220, 1);
  sprite.position.set(DRAGON_SIL_CENTER.x, DRAGON_SIL_CENTER.y, DRAGON_SIL_CENTER.z);
  scene.add(sprite);
  return {
    update(t) {
      const a = t * 0.05;
      sprite.position.x = DRAGON_SIL_CENTER.x + Math.cos(a) * 35;
      sprite.position.z = DRAGON_SIL_CENTER.z + Math.sin(a) * 35;
      sprite.position.y = DRAGON_SIL_CENTER.y + Math.sin(t * 0.2) * 14;
    },
  };
}

// ============================================================ Aufbau ============
export function buildAmbient(scene) {
  const herd = buildHerd(scene);
  const birds = buildBirdSwarms(scene);
  const fish = buildFishSwarms(scene);
  const caravan = buildCaravan(scene);
  const dragonSil = buildDragonSilhouette(scene);
  let time = 0;

  return {
    update(dt, skyState) {
      time += dt;
      herd.update(dt);
      birds.update(dt, skyState);
      fish.update(dt, time);
      caravan.update(dt, time);
      dragonSil.update(time);
    },
  };
}
