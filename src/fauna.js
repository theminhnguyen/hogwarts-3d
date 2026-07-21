// S2 (PLAN-SCHATTEN-UND-SCHWINGEN.md): Wild-Ökosystem der Silberauen — Rehe,
// Hasen, Füchse (jagen Hasen), Niffler (Glitzerstaub), Bowtruckles (an
// echten Baum-Positionen), wilde Hippogreife. Bewusst KEINE creatures.js-
// Bürger: kein hp/hitY, Zauber-Bolzen ignorieren sie komplett (kein
// registerTarget, kein applyHit) — reines Ambiente-Ökosystem, keine
// Kampf-Ziele. Distanz-Culling 140/160 wie creatures.js (eigene Kopie,
// dort nicht exportiert), harte Silberauen-Leine als Positions-Clamp
// (Lehre 14 — läuft VOR jedem Culling-Return).

import * as THREE from 'three';
import { terrainHeight, SILBERAUEN, FAHLHOLZ, GROVE } from './terrain.js';
import { mulberry32 } from './noise.js';
import { buildPatronusModel } from './patronus.js';

const CULL_FULL = 140;
const CULL_HIDE = 160;
const LEASH = SILBERAUEN.r + 15; // 55 — reicht über den Flatten-Kern hinaus in den Waldrand hinein
// Füchse leben laut Plan an den "Waldrändern", nicht in der Silberauen-
// Ebene selbst — eigenes, breiteres Revier auf halbem Weg zwischen
// Silberauen und dem Spinnenhain (GROVE, 150,60; Abstand 150m). Das ist
// KEIN Stilmerkmal, sondern Voraussetzung für die Akromantula-Kopplung
// (creatures.js): mit einem reinen Silberauen-Fuchs (Leine 55 um 300,60)
// bliebe eine unüberbrückbare 60m-Lücke zur Spinnen-Leine (35 um 150,60)
// — Spinnen könnten Beute dann NIE erreichen. Fuchs-Revier x∈[130,320]
// überlappt die Spinnen-Leine (x≤185) UND die Silberauen-Hasen (x≥245).
const FOX_HOME = { x: (SILBERAUEN.x + GROVE.x) / 2, z: 60 };
const FOX_LEASH = 95;

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}
function leashClamp(pos, cx, cz, r) {
  const dx = pos.x - cx, dz = pos.z - cz;
  const d = Math.hypot(dx, dz);
  if (d > r) {
    const f = r / d;
    pos.x = cx + dx * f;
    pos.z = cz + dz * f;
  }
}
// Zufallspunkt in einem Ring [rMin,rMax] um ein Zentrum (Kreisfläche-korrekt).
function ringSpot(rng, cx, cz, rMin, rMax) {
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng() * (rMax * rMax - rMin * rMin) + rMin * rMin);
  return { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r };
}

// ============================================================ Reh ============
const DEER_TUNING = { speed: 1.5, fleeSpeed: 5, fleeRange: 8, wanderR: 14 };

class Deer {
  constructor(scene, spot, seed) {
    const model = buildPatronusModel(null, { solid: true, color: 0x5a3f28 });
    model.group.scale.setScalar(0.42);
    model.group.visible = true;
    this.group = model.group;
    this.legs = model.legs;
    this.pos = this.group.position;
    this.pos.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    this.home = { x: spot.x, z: spot.z };
    this.target = { x: spot.x, z: spot.z };
    this.state = 'graze';
    this.stateT = rand(0, 4);
    this.gaitT = seed;
    this.rng = mulberry32(seed);
    scene.add(this.group);
  }

  update(dt, player) {
    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return;

    const dist = Math.sqrt(distSq);
    if (this.state === 'graze' && dist < DEER_TUNING.fleeRange) { this.state = 'flee'; this.stateT = 0; }
    else if (this.state === 'flee' && dist > DEER_TUNING.fleeRange * 1.9) { this.state = 'graze'; this.stateT = 0; }

    let speed = 0, moving = false;
    if (this.state === 'flee') {
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.target.x = this.pos.x + (dx / d) * 10;
      this.target.z = this.pos.z + (dz / d) * 10;
      speed = DEER_TUNING.fleeSpeed; moving = true;
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = rand(3, 7);
        const s = ringSpot(this.rng, this.home.x, this.home.z, 0, DEER_TUNING.wanderR);
        this.target.x = s.x; this.target.z = s.z;
      }
      const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (d > 0.5) { speed = DEER_TUNING.speed; moving = true; }
    }

    if (moving) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / d) * speed * dt;
      this.pos.z += (dz / d) * speed * dt;
      this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 4));
    }
    leashClamp(this.pos, SILBERAUEN.x, SILBERAUEN.z, LEASH);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);

    this.gaitT += dt * (moving ? (this.state === 'flee' ? 6 : 2) : 0.6);
    const amp = moving ? (this.state === 'flee' ? 0.4 : 0.12) : 0.03;
    for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.x = Math.sin(this.gaitT + i * 1.5) * amp;
  }
}

// ============================================================ Hase ============
const RABBIT_TUNING = { hopSpeed: 2.2, wanderR: 10, respawnDur: 60 };

// Exportiert (S4): der Wilderer-Käfig braucht eine der 4 Modelle als reine
// Deko-Kreatur (kein AI-Zustand) — Extraktion statt Duplikat.
export function buildRabbitModel() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x9a8265, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), mat);
  body.scale.set(1, 0.85, 1.3);
  body.position.y = 0.13;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), mat);
  head.position.set(0, 0.19, 0.14);
  group.add(head);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.16, 4), mat);
    ear.position.set(s * 0.03, 0.31, 0.13);
    ear.rotation.z = s * 0.15;
    group.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), mat);
  tail.position.set(0, 0.14, -0.16);
  group.add(tail);
  return { group, body };
}

class Rabbit {
  constructor(scene, spot, seed, denPos) {
    const m = buildRabbitModel();
    this.group = m.group;
    this.body = m.body;
    this.pos = this.group.position;
    this.den = denPos || { x: spot.x, z: spot.z };
    this.pos.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    this.target = { x: spot.x, z: spot.z };
    this.state = 'idle'; // idle|hop|hidden
    this.stateT = rand(0, 3);
    this.hopT = 0;
    this.rng = mulberry32(seed);
    this.huntedBy = null; // von Fuchs/Spinne gesetzt: aktives Jagd-Ziel
    scene.add(this.group);
  }

  huntedDespawn() {
    if (this.state === 'hidden') return;
    this.state = 'hidden';
    this.stateT = 0;
    this.huntedBy = null;
    this.group.visible = false;
  }

  update(dt, player) {
    if (this.state === 'hidden') {
      this.stateT += dt;
      if (this.stateT >= RABBIT_TUNING.respawnDur) {
        this.state = 'idle'; this.stateT = 0;
        this.pos.set(this.den.x, terrainHeight(this.den.x, this.den.z), this.den.z);
      }
      return;
    }

    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return;

    let speed = 0, moving = false;
    if (this.huntedBy) {
      const dx = this.pos.x - this.huntedBy.pos.x, dz = this.pos.z - this.huntedBy.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.target.x = this.pos.x + (dx / d) * 6;
      this.target.z = this.pos.z + (dz / d) * 6;
      speed = RABBIT_TUNING.hopSpeed * 1.6; moving = true;
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = rand(2, 5);
        const s = ringSpot(this.rng, this.den.x, this.den.z, 0, RABBIT_TUNING.wanderR);
        this.target.x = s.x; this.target.z = s.z;
      }
      const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (d > 0.4) { speed = RABBIT_TUNING.hopSpeed; moving = true; }
    }

    if (moving) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / d) * speed * dt;
      this.pos.z += (dz / d) * speed * dt;
      this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      this.hopT += dt * (this.huntedBy ? 12 : 7);
      this.body.position.y = 0.13 + Math.abs(Math.sin(this.hopT)) * 0.09;
    } else {
      this.body.position.y = 0.13;
    }
    leashClamp(this.pos, SILBERAUEN.x, SILBERAUEN.z, LEASH);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
  }
}

// ============================================================ Fuchs ============
const FOX_TUNING = { speed: 2.0, huntSpeed: 4.8, huntRange: 20, touchRange: 1.4, satiatedDur: 90, respawnDur: 60 };

export function buildFoxModel() {
  const mat = new THREE.MeshLambertMaterial({ color: 0xc06a30, flatShading: true });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a221c, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), mat);
  body.scale.set(1.2, 0.9, 1.9);
  body.position.y = 0.22;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), mat);
  head.position.set(0, 0.3, 0.28);
  group.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), darkMat);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.27, 0.42);
  group.add(snout);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 4), mat);
    ear.position.set(s * 0.07, 0.42, 0.26);
    group.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 6), mat);
  tail.rotation.x = Math.PI / 2.3;
  tail.position.set(0, 0.28, -0.42);
  group.add(tail);
  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), new THREE.MeshLambertMaterial({ color: 0xe8e0d0, flatShading: true }));
  tailTip.position.set(0, 0.24, -0.66);
  group.add(tailTip);
  const legs = [];
  for (const [lx, lz] of [[-0.11, 0.22], [0.11, 0.22], [-0.11, -0.22], [0.11, -0.22]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.24, 5), darkMat);
    leg.position.set(lx, 0.12, lz);
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs };
}

class Fox {
  constructor(scene, spot, seed) {
    const m = buildFoxModel();
    this.group = m.group;
    this.legs = m.legs;
    this.pos = this.group.position;
    this.pos.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    this.home = { x: spot.x, z: spot.z };
    this.target = { x: spot.x, z: spot.z };
    this.state = 'wander';
    this.stateT = rand(0, 4);
    this.satiatedT = 0;
    this.gaitT = seed;
    this.rng = mulberry32(seed);
    this.huntTarget = null; // Rabbit/Fox-ähnliches Beute-Objekt mit .pos/.state/.huntedDespawn()
    scene.add(this.group);
  }

  // Symmetrisch zu Rabbit.huntedDespawn() — Füchse sind selbst Beute für
  // Akromantulas (Ökosystem-Kette Akromantula>Fuchs>Hase, creatures.js).
  huntedDespawn() {
    if (this.state === 'hidden') return;
    if (this.huntTarget) { this.huntTarget.huntedBy = null; this.huntTarget = null; }
    this.state = 'hidden';
    this.stateT = 0;
    this.group.visible = false;
  }

  // fx/audio optional (S2 nutzt sie für den Fang-Effekt) — kein Riss auf dem
  // Bildschirm: nur ein dezenter Staub-Puff, das Beutetier verschwindet still.
  update(dt, player, prey, fx) {
    if (this.state === 'hidden') {
      this.stateT += dt;
      if (this.stateT >= FOX_TUNING.respawnDur) {
        this.state = 'wander'; this.stateT = 0;
        this.pos.set(this.home.x, terrainHeight(this.home.x, this.home.z), this.home.z);
      }
      return;
    }

    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return;

    if (this.satiatedT > 0) {
      this.satiatedT -= dt;
      if (this.huntTarget) { this.huntTarget.huntedBy = null; this.huntTarget = null; }
      this.state = 'wander';
    }

    let speed = 0, moving = false;
    if (this.satiatedT <= 0) {
      if (!this.huntTarget || this.huntTarget.state === 'hidden') {
        this.huntTarget = null;
        let best = null, bestD = FOX_TUNING.huntRange;
        for (const r of prey) {
          if (r.state === 'hidden' || (r.huntedBy && r.huntedBy !== this)) continue;
          const d = Math.hypot(r.pos.x - this.pos.x, r.pos.z - this.pos.z);
          if (d < bestD) { bestD = d; best = r; }
        }
        if (best) { this.huntTarget = best; best.huntedBy = this; this.state = 'hunt'; }
      }
    }

    if (this.huntTarget && this.satiatedT <= 0) {
      const dx = this.huntTarget.pos.x - this.pos.x, dz = this.huntTarget.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      this.target.x = this.huntTarget.pos.x; this.target.z = this.huntTarget.pos.z;
      speed = FOX_TUNING.huntSpeed; moving = true;
      if (d < FOX_TUNING.touchRange) {
        fx?.burst({ x: this.huntTarget.pos.x, y: this.huntTarget.pos.y + 0.2, z: this.huntTarget.pos.z }, 0xcbb896, 10, 2, { gravity: -1, life: 0.5 });
        this.huntTarget.huntedDespawn();
        this.huntTarget = null;
        this.state = 'wander';
        this.satiatedT = FOX_TUNING.satiatedDur;
      }
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = rand(3, 6);
        const s = ringSpot(this.rng, this.home.x, this.home.z, 0, 10);
        this.target.x = s.x; this.target.z = s.z;
      }
      const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (d > 0.5) { speed = FOX_TUNING.speed; moving = true; }
    }

    if (moving) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / d) * speed * dt;
      this.pos.z += (dz / d) * speed * dt;
      this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
    }
    leashClamp(this.pos, FOX_HOME.x, FOX_HOME.z, FOX_LEASH);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);

    this.gaitT += dt * (moving ? (this.state === 'hunt' ? 9 : 3) : 1);
    const amp = moving ? (this.state === 'hunt' ? 0.6 : 0.25) : 0.05;
    for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.x = Math.sin(this.gaitT + i * 1.5) * amp;
  }
}

// ============================================================ Niffler ============
const NIFFLER_TUNING = { pickupRange: 2.5, cooldown: 25 };

export function buildNifflerModel() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x1c1a1e, flatShading: true });
  const billMat = new THREE.MeshLambertMaterial({ color: 0x3a3238, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), mat);
  body.scale.set(1, 0.9, 1.6);
  body.position.y = 0.16;
  group.add(body);
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 6), billMat);
  bill.rotation.x = Math.PI / 2;
  bill.position.set(0, 0.13, 0.24);
  group.add(bill);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 5), mat);
  tail.rotation.x = -1.0;
  tail.position.set(0, 0.14, -0.24);
  group.add(tail);
  return { group, body };
}

class Niffler {
  constructor(scene, spot, seed, onGlitter) {
    const m = buildNifflerModel();
    this.group = m.group;
    this.body = m.body;
    this.pos = this.group.position;
    this.pos.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    this.home = { x: spot.x, z: spot.z };
    this.t = seed;
    this.cooldown = 0;
    this.onGlitter = onGlitter;
    scene.add(this.group);
  }

  update(dt, player, fx, audio) {
    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return;

    this.t += dt;
    this.body.position.y = 0.16 + Math.sin(this.t * 1.6) * 0.03; // gräbt/wühlt vor sich hin
    this.group.rotation.y = Math.sin(this.t * 0.4) * 0.6;

    if (this.cooldown > 0) this.cooldown -= dt;
    else if (distSq < NIFFLER_TUNING.pickupRange * NIFFLER_TUNING.pickupRange) {
      this.cooldown = NIFFLER_TUNING.cooldown;
      fx?.burst({ x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z }, 0xffd54a, 16, 2.5, { gravity: -1, life: 0.6 });
      audio?.chime?.();
      this.onGlitter?.();
    }
  }
}

// ============================================================ Bowtruckle ============
export function buildBowtruckleModel() {
  const mat = new THREE.MeshLambertMaterial({ color: 0x3c5a2e, flatShading: true });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1c2418, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 5), mat);
  body.position.y = 0.11;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat);
  head.position.y = 0.24;
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.01, 4, 4), eyeMat);
    eye.position.set(s * 0.02, 0.245, 0.038);
    group.add(eye);
  }
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 4), mat);
    arm.position.set(s * 0.05, 0.16, 0);
    arm.rotation.z = s * 0.9;
    group.add(arm);
  }
  return { group };
}

class Bowtruckle {
  constructor(scene, spot, seed) {
    const m = buildBowtruckleModel();
    this.group = m.group;
    this.pos = this.group.position;
    const y = terrainHeight(spot.x, spot.z) + 1.1 + (seed % 3) * 0.4;
    this.pos.set(spot.x, y, spot.z);
    this.perchAngle = (seed * 1.7) % (Math.PI * 2);
    this.group.rotation.y = this.perchAngle;
    this.hideF = 0; // 0=sichtbar, 1=ganz hinterm Stamm versteckt
    this.t = seed;
    scene.add(this.group);
  }

  update(dt, player, lumosOn) {
    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return;

    this.t += dt;
    const dist = Math.sqrt(distSq);
    const scared = dist < 5 && !lumosOn;
    const targetHide = scared ? 1 : 0;
    this.hideF += ((targetHide - this.hideF) > 0 ? 1 : -1) * Math.min(Math.abs(targetHide - this.hideF), dt * 1.5);
    // Versteck-Trick: um den Stamm herum auf die abgewandte Seite drehen +
    // leicht kleiner werden (wirkt wie "duckt sich hinter den Ast").
    this.group.rotation.y = this.perchAngle + this.hideF * Math.PI * 0.85;
    const s = 1 - this.hideF * 0.4;
    this.group.scale.setScalar(s);
    if (this.hideF < 0.95) {
      const sway = Math.sin(this.t * 0.9) * 0.06;
      this.group.rotation.z = sway * (1 - this.hideF);
    }
  }
}

// ============================================================ Hippogreif (wild) ============
const HIPPO_TUNING = { speed: 1.8, fleeSpeed: 6, fleeRange: 12, wanderR: 16 };

// Exportiert (S5): mount.js baut den gerittenen Hippogreif aus DERSELBEN
// Geometrie (gezähmt ist er kein neues Modell, nur ein neuer Zustand).
export function buildWildHippoModel() {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8a7860, flatShading: true });
  const featherMat = new THREE.MeshLambertMaterial({ color: 0x5a4a38, flatShading: true, side: THREE.DoubleSide });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0x3a3228, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), bodyMat);
  body.scale.set(1, 0.85, 1.9);
  body.position.y = 1.1;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), featherMat);
  head.position.set(0, 1.55, 1.15);
  group.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), beakMat);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 1.5, 1.5);
  group.add(beak);
  const legs = [];
  for (const [lx, lz] of [[-0.32, 0.65], [0.32, 0.65], [-0.32, -0.65], [0.32, -0.65]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 1.1, 6), bodyMat);
    leg.position.set(lx, 0.55, lz);
    group.add(leg);
    legs.push(leg);
  }
  // Flügel als Pivot-Gruppe (Astketten-Muster aus willow.js/creatures.js-
  // Spinnenbeinen): die Pivot-Rotation um die lokale Z-Achse hebt/senkt die
  // Flügelspitze für den Schlag, die Fläche selbst liegt (durch die eigene
  // X-Rotation von 90°) flach statt wie eine aufrecht stehende Finne.
  const wings = [];
  for (const s of [-1, 1]) {
    const root = new THREE.Group();
    root.position.set(s * 0.3, 1.35, -0.05);
    group.add(root);
    const wingMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85, 3, 1), featherMat);
    wingMesh.rotation.x = Math.PI / 2;
    wingMesh.position.x = s * 0.72;
    root.add(wingMesh);
    root.userData.baseZ = s * -0.15; // leichte Dihedral-Ruhehaltung
    root.userData.sign = s; // Vorzeichen fürs symmetrische Schlagen (beide Spitzen gemeinsam auf/ab)
    root.rotation.z = root.userData.baseZ;
    wings.push(root);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 6), featherMat);
  tail.rotation.x = Math.PI / 2.2;
  tail.position.set(0, 1.15, -1.6);
  group.add(tail);
  return { group, legs, wings };
}

class WildHippogriff {
  constructor(scene, spot, seed) {
    const m = buildWildHippoModel();
    this.group = m.group;
    this.legs = m.legs;
    this.wings = m.wings;
    this.pos = this.group.position;
    this.pos.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    this.home = { x: spot.x, z: spot.z };
    this.target = { x: spot.x, z: spot.z };
    this.state = 'graze';
    this.stateT = rand(0, 4);
    this.gaitT = seed;
    this.rng = mulberry32(seed);
    this.tamed = false; // S5: gezähmte Tiere verlassen den wilden Bestand dauerhaft
    scene.add(this.group);
  }

  // S5: von mount.js nach erfolgreicher Zähmung aufgerufen — verschwindet
  // dauerhaft aus der Silberauen-Wildpopulation (er ist jetzt DEIN Mount,
  // der eigene, unabhängige "kein Weltstandort"-Zustand lebt in mount.js).
  tame() {
    this.tamed = true;
    this.group.visible = false;
  }

  update(dt, player, sprinting) {
    if (this.tamed) { this.group.visible = false; return; }
    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return;

    const dist = Math.sqrt(distSq);
    // Fliehen nur vor RENNENDEN Spielern (Zähm-Vorschau für S5) — ruhiges
    // Gehen ist ungefährlich, der Hippogreif bleibt gelassen stehen.
    const threatened = sprinting && dist < HIPPO_TUNING.fleeRange;
    if (this.state === 'graze' && threatened) { this.state = 'flee'; this.stateT = 0; }
    else if (this.state === 'flee' && (!threatened && dist > HIPPO_TUNING.fleeRange * 1.6)) { this.state = 'graze'; this.stateT = 0; }

    let speed = 0, moving = false;
    if (this.state === 'flee') {
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.target.x = this.pos.x + (dx / d) * 12;
      this.target.z = this.pos.z + (dz / d) * 12;
      speed = HIPPO_TUNING.fleeSpeed; moving = true;
    } else {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = rand(4, 9);
        const s = ringSpot(this.rng, this.home.x, this.home.z, 0, HIPPO_TUNING.wanderR);
        this.target.x = s.x; this.target.z = s.z;
      }
      const d = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (d > 0.6) { speed = HIPPO_TUNING.speed; moving = true; }
    }

    if (moving) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / d) * speed * dt;
      this.pos.z += (dz / d) * speed * dt;
      this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3.5));
    }
    leashClamp(this.pos, SILBERAUEN.x, SILBERAUEN.z, LEASH);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);

    this.gaitT += dt * (moving ? (this.state === 'flee' ? 7 : 2) : 0.5);
    const legAmp = moving ? (this.state === 'flee' ? 0.5 : 0.15) : 0.02;
    for (let i = 0; i < this.legs.length; i++) this.legs[i].rotation.x = Math.sin(this.gaitT + i * 1.5) * legAmp;
    // Flügelschlag-Idle: immer leicht in Bewegung, im Fluchtmodus deutlich
    // schneller. Beide Spitzen heben/senken sich gemeinsam (sign-Vorzeichen
    // gleicht die gespiegelte Pivot-Geometrie der linken/rechten Seite aus).
    const flapSpeed = this.state === 'flee' ? 10 : 1.4;
    const flapAmp = this.state === 'flee' ? 0.5 : 0.1;
    for (const w of this.wings) {
      w.rotation.z = w.userData.baseZ + Math.sin(this.gaitT * flapSpeed) * flapAmp * w.userData.sign;
    }
  }
}

// ============================================================ Aufbau ============
export function buildFauna(scene, fx, audio, treeSpots, onGlitter) {
  const rng = mulberry32(6001);

  const deer = [];
  for (let i = 0; i < 8; i++) deer.push(new Deer(scene, ringSpot(rng, SILBERAUEN.x, SILBERAUEN.z, 0, 28), 100 + i));

  const rabbits = [];
  for (let i = 0; i < 12; i++) {
    const den = ringSpot(rng, SILBERAUEN.x, SILBERAUEN.z, 0, 40);
    rabbits.push(new Rabbit(scene, den, 200 + i, den));
  }

  const foxes = [];
  for (let i = 0; i < 4; i++) foxes.push(new Fox(scene, ringSpot(rng, FOX_HOME.x, FOX_HOME.z, 0, FOX_LEASH - 5), 300 + i));

  const nifflers = [];
  for (let i = 0; i < 3; i++) nifflers.push(new Niffler(scene, ringSpot(rng, SILBERAUEN.x, SILBERAUEN.z, 0, 25), 400 + i, onGlitter));

  // Bowtruckles sitzen an ECHTEN Baum-Positionen (S1-treeSpots-Export),
  // auf die Wildmark-Nähe gefiltert (sonst wirken sie beliebig über die
  // ganze Karte verstreut statt thematisch zur neuen Zone zu gehören).
  const nearWildmark = (treeSpots || []).filter((t) => {
    const dS = Math.hypot(t.x - SILBERAUEN.x, t.z - SILBERAUEN.z);
    const dF = Math.hypot(t.x - FAHLHOLZ.x, t.z - FAHLHOLZ.z);
    return dS < 130 || dF < 90;
  });
  const bowtruckles = [];
  for (let i = 0; i < 6 && nearWildmark.length > 0; i++) {
    const spot = nearWildmark[Math.floor(rng() * nearWildmark.length)];
    bowtruckles.push(new Bowtruckle(scene, spot, 500 + i));
  }

  const hippos = [];
  for (let i = 0; i < 3; i++) hippos.push(new WildHippogriff(scene, ringSpot(rng, SILBERAUEN.x, SILBERAUEN.z, 5, 30), 600 + i));

  const preyForFoxes = rabbits;

  return {
    deer, rabbits, foxes, nifflers, bowtruckles, hippos,
    // Für die Akromantula-Kopplung (creatures.js): jagdbare Beute in
    // Reichweite der Spinnen-Leine — Füchse UND Hasen (K1: Niffler/
    // Bowtruckle bleiben absichtlich draußen, nie in dieser Liste).
    huntableBySpiders: [...rabbits, ...foxes],

    update(dt, player, lumosOn, sprinting) {
      for (const d of deer) d.update(dt, player);
      for (const r of rabbits) r.update(dt, player);
      for (const f of foxes) f.update(dt, player, preyForFoxes, fx);
      for (const n of nifflers) n.update(dt, player, fx, audio);
      for (const b of bowtruckles) b.update(dt, player, lumosOn);
      for (const h of hippos) h.update(dt, player, sprinting);
    },
  };
}
