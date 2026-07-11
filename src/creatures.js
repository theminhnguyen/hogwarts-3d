// Kreaturen: gemeinsame Basis-FSM + Wichtel/Pixies (frech, tags- und nachts
// aktiv, klauen nicht eingesammelte Schnätze). Schattengeister & Troll folgen
// in Phase 3 / Bonus. Distanz-Culling: volle FSM nur < 140m, sichtbar bis 160m.

import * as THREE from 'three';
import { GeoBatch } from './geo.js';
import { terrainHeight } from './terrain.js';
import { mulberry32 } from './noise.js';

const TUNING = {
  pixie: {
    hp: 2, wanderSpeed: 3, orbitR: 6, orbitY: 2.5, diveSpeed: 14,
    aggroRange: 14, leaveAggroRange: 20, hitRange: 0.8, dmg: 0.5,
    respawn: 90, attackMin: 3.5, attackMax: 5, giggleMin: 2, giggleMax: 4,
  },
};

const PIXIE_SWARMS = [
  { x: 95, z: 105 },
  { x: -30, z: 80 },
  { x: 150, z: 170 },
];
const PIXIE_PER_SWARM = 5;
const CULL_FULL = 140;
const CULL_HIDE = 160;

function rand(a, b) { return a + Math.random() * (b - a); }

// Kürzester Winkel-Diff für sanftes Eindrehen (Blickrichtung folgt der Geschwindigkeit)
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Gemeinsame Wichtel-Geometrie (einmal gebaut, von allen geteilt) ----------
function buildPixieParts(glowTex) {
  const b = new GeoBatch();
  const body = new THREE.SphereGeometry(0.16, 6, 5);
  body.scale(1, 0.8, 0.9);
  b.addRaw(body, 0x3fb8d4);
  const head = new THREE.SphereGeometry(0.09, 6, 5);
  head.translate(0, 0.14, 0.09);
  b.addRaw(head, 0x4fc8e0);
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.018, 5, 4);
    eye.translate(s * 0.035, 0.155, 0.155);
    b.addRaw(eye, 0x142028);
    const ear = new THREE.ConeGeometry(0.025, 0.09, 4);
    ear.rotateZ(s * 0.7);
    ear.translate(s * 0.10, 0.20, 0.05);
    b.addRaw(ear, 0x3fb8d4);
  }
  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const bodyTemplate = b.build(bodyMat, { castShadow: true, receiveShadow: false });

  const wingGeo = new THREE.PlaneGeometry(0.22, 0.12);
  const wingMat = new THREE.MeshBasicMaterial({
    color: 0xf3fbff, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
  });

  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x3fb8d4, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  return { bodyGeo: bodyTemplate.geometry, bodyMat, wingGeo, wingMat, glowMat };
}

class Pixie {
  constructor(system, parts, homePos, seed) {
    this.system = system;
    this.species = 'pixie';
    this.hp = TUNING.pixie.hp;
    this.maxHp = TUNING.pixie.hp;
    this.alive = true;
    this.radius = 0.28;
    this.state = 'wander';
    this.stateT = 0;
    this.homePos = homePos;
    this.respawnT = 0;
    this.vel = new THREE.Vector3();
    this.carrying = null;
    this.orbitAngle = 0;
    this.attackT = rand(TUNING.pixie.attackMin, TUNING.pixie.attackMax);
    this.giggleT = rand(TUNING.pixie.giggleMin, TUNING.pixie.giggleMax);
    this._flapT = seed * 3.1;

    const rng = mulberry32(seed * 977 + 1);
    this.phaseA = rng() * Math.PI * 2;
    this.phaseB = rng() * Math.PI * 2;
    this.phaseC = rng() * Math.PI * 2;

    this.group = new THREE.Group();
    this.pos = this.group.position; // Alias: Mutationen bewegen die Gruppe direkt
    this.pos.set(homePos.x, terrainHeight(homePos.x, homePos.z) + 2.5, homePos.z);

    const body = new THREE.Mesh(parts.bodyGeo, parts.bodyMat);
    body.castShadow = true;
    this.group.add(body);
    this.wingL = new THREE.Mesh(parts.wingGeo, parts.wingMat);
    this.wingL.position.set(-0.13, 0.06, 0);
    this.group.add(this.wingL);
    this.wingR = new THREE.Mesh(parts.wingGeo, parts.wingMat);
    this.wingR.position.set(0.13, 0.06, 0);
    this.group.add(this.wingR);
    const glow = new THREE.Sprite(parts.glowMat);
    glow.scale.setScalar(0.5);
    this.group.add(glow);

    system.scene.add(this.group);
  }

  _steerTo(tx, ty, tz, speed, dt) {
    const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    this.vel.set((dx / d) * speed, (dy / d) * speed, (dz / d) * speed);
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
  }

  applyHit(spellId, boltVel) {
    if (!this.alive) return;
    const dmg = spellId === 'incendio' ? 2 : spellId === 'stupor' ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg;
    const knock = boltVel.lengthSq() > 1e-6
      ? boltVel.clone().normalize()
      : new THREE.Vector3(0, 1, 0);
    if (this.hp <= 0) {
      this._die();
    } else {
      this.state = 'hitstun';
      this.stateT = 0;
      this.vel.copy(knock).multiplyScalar(10);
      this.vel.y += 4;
    }
  }

  _die() {
    this.alive = false;
    this.state = 'dying';
    this.stateT = 0;
    if (this.carrying) {
      const item = this.carrying;
      item.carriedBy = null;
      item.baseY = terrainHeight(this.pos.x, this.pos.z) + 1.5;
      item.group.position.set(this.pos.x, item.baseY, this.pos.z);
      this.carrying = null;
    }
    this.system.fx.burst(this.pos, 0x5fd0e8, 24, 4.5, { gravity: -6, life: 0.6 });
    this.system.audio.pixieGiggle?.();
  }

  _respawn() {
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'wander';
    this.stateT = 0;
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.group.rotation.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.pos.set(this.homePos.x, terrainHeight(this.homePos.x, this.homePos.z) + 2.5, this.homePos.z);
  }

  update(dt, player) {
    if (this.state === 'dead') {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this._respawn();
      return;
    }

    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) return; // eingefroren, aber sichtbar

    switch (this.state) {
      case 'wander': {
        const t = this.system.time;
        const lx = this.homePos.x + Math.sin(t * 0.6 + this.phaseA) * 12;
        const lz = this.homePos.z + Math.cos(t * 0.45 + this.phaseB) * 12;
        const ly = terrainHeight(lx, lz) + 2.5 + Math.sin(t * 0.9 + this.phaseC) * 1.2;
        this._steerTo(lx, ly, lz, TUNING.pixie.wanderSpeed, dt);
        this._checkTheft();
        if (distSq < TUNING.pixie.aggroRange * TUNING.pixie.aggroRange) {
          this.state = 'aggro';
          this.stateT = 0;
          this.orbitAngle = Math.atan2(this.pos.z - player.pos.z, this.pos.x - player.pos.x);
        }
        break;
      }
      case 'aggro': {
        this.stateT += dt;
        this.orbitAngle += (0.9 + this.phaseA * 0.3) * dt;
        const r = TUNING.pixie.orbitR;
        const tx = player.pos.x + Math.cos(this.orbitAngle) * r;
        const tz = player.pos.z + Math.sin(this.orbitAngle) * r;
        const ty = player.pos.y + TUNING.pixie.orbitY;
        this._steerTo(tx, ty, tz, TUNING.pixie.wanderSpeed * 1.3, dt);
        this._checkTheft();

        this.giggleT -= dt;
        if (this.giggleT <= 0) {
          this.system.audio.pixieGiggle?.();
          this.giggleT = rand(TUNING.pixie.giggleMin, TUNING.pixie.giggleMax);
        }
        if (!this.system.peaceful) {
          this.attackT -= dt;
          if (this.attackT <= 0) { this.state = 'attack'; this.stateT = 0; }
        }
        if (distSq > TUNING.pixie.leaveAggroRange * TUNING.pixie.leaveAggroRange) {
          this.state = 'wander';
          this.stateT = 0;
        }
        break;
      }
      case 'attack': {
        this.stateT += dt;
        const hx = player.pos.x, hy = player.pos.y + 1.7, hz = player.pos.z;
        this._steerTo(hx, hy, hz, TUNING.pixie.diveSpeed, dt);
        const dHit = (this.pos.x - hx) ** 2 + (this.pos.y - hy) ** 2 + (this.pos.z - hz) ** 2;
        if (dHit < TUNING.pixie.hitRange * TUNING.pixie.hitRange) {
          const away = new THREE.Vector3(this.pos.x - hx, this.pos.y - hy, this.pos.z - hz);
          if (away.lengthSq() < 1e-6) away.set(0, 1, 0); else away.normalize();
          if (!this.system.peaceful) {
            this.system.health.damage(TUNING.pixie.dmg, away);
            this.system.fx.shake(0.12);
          }
          this.vel.copy(away).multiplyScalar(8);
          this.state = 'aggro';
          this.stateT = 0;
          this.attackT = rand(TUNING.pixie.attackMin, TUNING.pixie.attackMax);
        } else if (this.stateT > 1.5) {
          this.state = 'aggro';
          this.stateT = 0;
          this.attackT = rand(TUNING.pixie.attackMin, TUNING.pixie.attackMax);
          this.orbitAngle = Math.atan2(this.pos.z - player.pos.z, this.pos.x - player.pos.x);
        }
        break;
      }
      case 'hitstun': {
        this.stateT += dt;
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
        this.pos.x += this.vel.x * dt;
        this.pos.y += this.vel.y * dt;
        this.pos.z += this.vel.z * dt;
        const minY = terrainHeight(this.pos.x, this.pos.z) + 0.3;
        if (this.pos.y < minY) this.pos.y = minY;
        if (this.stateT > 0.4) {
          this.state = 'aggro';
          this.stateT = 0;
          this.attackT = rand(TUNING.pixie.attackMin, TUNING.pixie.attackMax);
          this.orbitAngle = Math.atan2(this.pos.z - player.pos.z, this.pos.x - player.pos.x);
        }
        break;
      }
      case 'dying': {
        this.stateT += dt;
        this.group.rotation.x += dt * 8;
        this.group.rotation.z += dt * 5;
        this.group.scale.setScalar(Math.max(0, 1 - this.stateT / 0.5));
        this.pos.y -= dt * 1.5;
        if (this.stateT >= 0.5) {
          this.state = 'dead';
          this.group.visible = false;
          this.respawnT = TUNING.pixie.respawn;
        }
        break;
      }
    }

    // Flügelschlag + sanftes Eindrehen in Bewegungsrichtung (nicht beim Sterben)
    this._flapT += dt;
    const flap = Math.sin(this._flapT * 28) * 0.9;
    this.wingL.rotation.z = flap;
    this.wingR.rotation.z = -flap;
    if (this.state !== 'dying') {
      const hSpeed = Math.hypot(this.vel.x, this.vel.z);
      if (hSpeed > 0.3) {
        const targetYaw = Math.atan2(this.vel.x, this.vel.z);
        this.group.rotation.y = angleLerp(this.group.rotation.y, targetYaw, Math.min(1, dt * 6));
      }
    }
  }

  // Klaut einen nicht eingesammelten, noch nicht getragenen Schnatz in der Nähe
  _checkTheft() {
    if (this.carrying || !this.system.collectibles) return;
    for (const item of this.system.collectibles.items) {
      if (item.collected || item.carriedBy) continue;
      const dx = item.group.position.x - this.pos.x;
      const dz = item.group.position.z - this.pos.z;
      if (dx * dx + dz * dz < 100) { // 10m
        this.carrying = item;
        item.carriedBy = this;
        if (!this.system._theftToastShown) {
          this.system._theftToastShown = true;
          this.system.hud?.showToast('⚡ Ein Wichtel hat einen Schnatz geklaut! Hol ihn dir zurück!', 4);
        }
        break;
      }
    }
  }
}

export class CreatureSystem {
  constructor(scene, fx, audio, health, collectibles, hud, glowTex) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.health = health;
    this.collectibles = collectibles;
    this.hud = hud;
    this.peaceful = false;
    this.time = 0;
    this._theftToastShown = false;
    this.list = [];

    const parts = buildPixieParts(glowTex);
    let seed = 1;
    for (const swarm of PIXIE_SWARMS) {
      for (let i = 0; i < PIXIE_PER_SWARM; i++) {
        this.list.push(new Pixie(this, parts, swarm, seed++));
      }
    }
  }

  update(dt, player) {
    this.time += dt;
    for (const c of this.list) c.update(dt, player);

    // Getragene Schnätze hängen unterm Wichtel — pro Frame nachziehen
    for (const c of this.list) {
      if (c.carrying) c.carrying.group.position.set(c.pos.x, c.pos.y - 0.4, c.pos.z);
    }
  }
}
