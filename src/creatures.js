// Kreaturen: gemeinsame Basis-FSM + Wichtel/Pixies (frech, tags- und nachts
// aktiv, klauen nicht eingesammelte Schnätze) + Schattengeister (unheimlich,
// nur nachts, fliehen vor Lumos) + Troll-Miniboss (Bonus, Schluchtboden,
// bewacht eine Herz-Upgrade-Truhe). Distanz-Culling: volle FSM nur < 140m,
// sichtbar bis 160m.

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
  ghost: {
    hp: 3, wanderSpeed: 1.2, aggroSpeed: 2.6, aggroRange: 20, leaveAggroRange: 26,
    coldRange: 6, touchRange: 1.1, dmg: 1, fleeSpeed: 5, fleeMinDist: 16,
    lumosFearRange: 9, knockbackDist: 8, fadeDur: 3, dyingDur: 0.7,
  },
};

const PIXIE_SWARMS = [
  { x: 95, z: 105 },
  { x: -30, z: 80 },
  { x: 150, z: 170 },
];
const PIXIE_PER_SWARM = 5;
const GHOST_SPAWNS = [
  { x: 150, z: -95 },
  { x: 0, z: -75 },
  { x: -20, z: 94 },
];
const GHOST_PER_SPAWN = 2;
const CULL_FULL = 140;
const CULL_HIDE = 160;

const TROLL_POS = { x: -40, z: 94 };
const TROLL_TUNING = {
  hp: 12, patrolSpeed: 1.4, chaseSpeed: 3.4, patrolRadius: 13,
  aggroRange: 16, leaveAggroRange: 22, slamRange: 3.5,
  telegraphDur: 0.8, slamDmg: 1.5, staggerDur: 0.6,
  attackCdMin: 2.5, attackCdMax: 4,
};

function rand(a, b) { return a + Math.random() * (b - a); }

// Verzerrt Vertices zufällig für organische Formen (eigenständige Kopie der
// kleinen Hilfsfunktion aus props.js — dort nicht exportiert).
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

// ---------- Gemeinsame Schattengeist-Geometrie ----------
function buildGhostParts(glowTex) {
  const cloakGeo = jitter(new THREE.ConeGeometry(0.5, 1.6, 8, 3, true), 0.12, 555);
  cloakGeo.translate(0, 0.8, 0); // Saum bei y=0, Spitze bei y=1.6
  const hoodGeo = new THREE.SphereGeometry(0.22, 8, 6);
  hoodGeo.translate(0, 1.52, 0.02);

  // Dunkel bleibt Absicht (unheimlich!), aber ein reiner Nahe-Schwarz-Ton war
  // gegen den ebenso dunklen Nachthimmel praktisch unsichtbar — leicht ins
  // Blaue verschoben, damit die Silhouette noch lesbar bleibt.
  const cloakMatTemplate = new THREE.MeshLambertMaterial({
    color: 0x171c30, transparent: true, opacity: 0.88, flatShading: true, side: THREE.DoubleSide,
  });
  // Leuchtende Augen sind der eigentliche "ich sehe etwas im Dunkeln"-Hinweis
  // (klassisches Horror-Genre-Mittel) — deutlich größer/heller als ursprünglich.
  const eyeMatTemplate = new THREE.SpriteMaterial({
    map: glowTex, color: 0xafd8ff, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glowMatTemplate = new THREE.SpriteMaterial({
    map: glowTex, color: 0x4a70c0, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  return { cloakGeo, hoodGeo, cloakMatTemplate, eyeMatTemplate, glowMatTemplate };
}

class Ghost {
  constructor(system, parts, homePos, seed) {
    this.system = system;
    this.species = 'ghost';
    this.hp = TUNING.ghost.hp;
    this.maxHp = TUNING.ghost.hp;
    this.alive = false;
    this.radius = 0.35;
    this.state = 'dead'; // 'dead' deckt sowohl Tag-Inaktivität als auch Tod ab
    this.stateT = 0;
    this.homePos = homePos;
    this.vel = new THREE.Vector3();
    this.fadeFactor = 0;
    this._sawLow = true; // erlaubt sofortige Erstaktivierung, egal wann das Spiel startet

    const rng = mulberry32(seed * 613 + 7);
    this.phaseA = rng() * Math.PI * 2;
    this.phaseB = rng() * Math.PI * 2;

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(homePos.x, terrainHeight(homePos.x, homePos.z) + 0.85, homePos.z);
    this.group.visible = false;

    this.cloakMat = parts.cloakMatTemplate.clone();
    this.cloakMat.opacity = 0;
    this.cloak = new THREE.Mesh(parts.cloakGeo, this.cloakMat);
    this.group.add(this.cloak);
    const hood = new THREE.Mesh(parts.hoodGeo, this.cloakMat);
    this.group.add(hood);

    this.eyeMat = parts.eyeMatTemplate.clone();
    this.eyeMat.opacity = 0;
    // Augen deutlich VOR die Kapuzen-Kugel setzen (Hood: Zentrum y=1.52,z=0.02,
    // Radius 0.22) — sonst liegt der Sprite-Anker innerhalb der Kugel und der
    // Tiefentest der Kapuze verdeckt ihn (additives Blending ändert nur die
    // Farbmischung, nicht den Tiefentest).
    const eyeL = new THREE.Sprite(this.eyeMat);
    eyeL.scale.setScalar(0.13);
    eyeL.position.set(-0.08, 1.5, 0.32);
    this.group.add(eyeL);
    const eyeR = new THREE.Sprite(this.eyeMat);
    eyeR.scale.setScalar(0.13);
    eyeR.position.set(0.08, 1.5, 0.32);
    this.group.add(eyeR);

    this.glowMat = parts.glowMatTemplate.clone();
    this.glowMat.opacity = 0;
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(2.6);
    glow.position.y = 0.55;
    this.group.add(glow);

    system.scene.add(this.group);
  }

  _steerXZ(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  _applyFade() {
    const f = this.fadeFactor;
    this.cloakMat.opacity = 0.88 * f;
    this.eyeMat.opacity = 0.95 * f;
    this.glowMat.opacity = 0.3 * f;
  }

  applyHit(spellId, _boltVel) {
    if (!this.alive) return;
    const dmg = (spellId === 'stupor' || spellId === 'incendio') ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg;
    if (this.hp <= 0) this._die();
  }

  _die() {
    this.alive = false;
    this.state = 'dying';
    this.stateT = 0;
    this.system.fx.burst(this.pos, 0x8fb0ff, 30, 3.5, { gravity: -1, life: 1.0 });
    this.system.audio.chime();
  }

  _activate() {
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'wander';
    this.stateT = 0;
    this.fadeFactor = 0;
    this.cloak.scale.y = 1;
    this.group.visible = true;
    this.pos.set(this.homePos.x, terrainHeight(this.homePos.x, this.homePos.z) + 0.85, this.homePos.z);
  }

  update(dt, player, skyState, lumosOn) {
    const night = skyState.nightGlow;

    if (this.state === 'dead') {
      if (night < 0.2) this._sawLow = true;
      if (night > 0.5 && this._sawLow) this._activate();
      else return; // unsichtbar & inaktiv
    }

    // Sterbeanimation läuft IMMER zu Ende, unabhängig vom Distanz-Culling weiter
    // unten — sonst bliebe ein Geist für immer in 'dying' hängen, falls der
    // Spieler direkt nach dem Todesstoß wegläuft/teleportiert.
    if (this.state === 'dying') {
      this.stateT += dt;
      const k = Math.max(0, 1 - this.stateT / TUNING.ghost.dyingDur);
      this.cloak.scale.y = k;
      this.fadeFactor = k;
      this._applyFade();
      if (this.stateT >= TUNING.ghost.dyingDur) {
        this.state = 'dead';
        this._sawLow = false;
        this.group.visible = false;
      }
      return;
    }

    // Tagesanbruch während aktiv: sanft ausfaden und deaktivieren
    if (night < 0.35) {
      this.fadeFactor = Math.max(0, this.fadeFactor - dt / TUNING.ghost.fadeDur);
      if (this.fadeFactor <= 0) {
        this.state = 'dead';
        this.alive = false;
        this._sawLow = false;
        this.group.visible = false;
        return;
      }
    } else {
      this.fadeFactor = Math.min(1, this.fadeFactor + dt / TUNING.ghost.fadeDur);
    }

    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) { this._applyFade(); return; } // eingefroren, aber sichtbar

    // Kälte-Näherungsmeldung ans System (für HUD-Vignette & Drone-Sound)
    const dist = Math.sqrt(distSq);
    if (dist < this.system._nearestGhostDist) this.system._nearestGhostDist = dist;

    // Lumos-Furcht hat Vorrang vor normalem Verhalten
    if (lumosOn && (this.state === 'wander' || this.state === 'aggro')
      && distSq < TUNING.ghost.lumosFearRange * TUNING.ghost.lumosFearRange) {
      this.state = 'flee';
      this.stateT = 0;
    }

    switch (this.state) {
      case 'wander': {
        const t = this.system.time;
        const lx = this.homePos.x + Math.sin(t * 0.15 + this.phaseA) * 14;
        const lz = this.homePos.z + Math.cos(t * 0.12 + this.phaseB) * 14;
        this._steerXZ(lx, lz, TUNING.ghost.wanderSpeed, dt);
        if (distSq < TUNING.ghost.aggroRange * TUNING.ghost.aggroRange) {
          this.state = 'aggro';
          this.stateT = 0;
        }
        break;
      }
      case 'aggro': {
        this.stateT += dt;
        this._steerXZ(player.pos.x, player.pos.z, TUNING.ghost.aggroSpeed, dt);
        if (Math.sqrt(distSq) < TUNING.ghost.touchRange) {
          const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
          const d = Math.hypot(dx, dz) || 1;
          const dirX = dx / d, dirZ = dz / d;
          if (!this.system.peaceful) {
            this.system.health.damage(TUNING.ghost.dmg, { x: dirX, y: 0, z: dirZ });
            this.system.fx.shake(0.3);
          }
          // 8m radial vom Spieler wegteleportieren, damit er nicht dauerschadet
          this.pos.x = player.pos.x + dirX * TUNING.ghost.knockbackDist;
          this.pos.z = player.pos.z + dirZ * TUNING.ghost.knockbackDist;
        }
        if (distSq > TUNING.ghost.leaveAggroRange * TUNING.ghost.leaveAggroRange) {
          this.state = 'wander';
          this.stateT = 0;
        }
        break;
      }
      case 'flee': {
        this.stateT += dt;
        const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this._steerXZ(this.pos.x + (dx / d) * 10, this.pos.z + (dz / d) * 10, TUNING.ghost.fleeSpeed, dt);
        if (!lumosOn || distSq > TUNING.ghost.fleeMinDist * TUNING.ghost.fleeMinDist) {
          this.state = 'wander';
          this.stateT = 0;
        }
        break;
      }
    }

    // Bodenschweben (0.6–1.1m) + wehender Umhangsaum
    const groundY = terrainHeight(this.pos.x, this.pos.z);
    this.pos.y = groundY + 0.85 + Math.sin(this.system.time * 0.8 + this.phaseA) * 0.25;
    this.cloak.rotation.y += 0.3 * dt;
    this._applyFade();
  }
}

// ---------- Troll-Miniboss (Bonus) ----------
class Troll {
  constructor(system, glowTex) {
    this.system = system;
    this.species = 'troll';
    this.hp = TROLL_TUNING.hp;
    this.maxHp = TROLL_TUNING.hp;
    this.alive = true;
    this.radius = 0.9;
    this.state = 'patrol'; // patrol|aggro|telegraph|slam|stagger|dying|dead
    this.stateT = 0;
    this.homePos = TROLL_POS;
    this.vel = new THREE.Vector3();
    this.attackCd = rand(TROLL_TUNING.attackCdMin, TROLL_TUNING.attackCdMax);
    this.phaseA = Math.random() * Math.PI * 2;
    this._slamApplied = false;

    const SKIN = 0x6b7a5e, SKIN_DARK = 0x566349, CLUB = 0x5a4632;
    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(TROLL_POS.x, terrainHeight(TROLL_POS.x, TROLL_POS.z), TROLL_POS.z);

    const b = new GeoBatch();
    for (const s of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.34, 0.4, 1.3, 7);
      leg.translate(s * 0.4, 0.65, 0);
      b.addRaw(leg, SKIN_DARK);
    }
    const torso = new THREE.SphereGeometry(0.85, 8, 6);
    torso.scale(1.15, 1.3, 0.95);
    torso.translate(0, 2.0, 0);
    b.addRaw(torso, SKIN);
    const head = new THREE.SphereGeometry(0.42, 8, 6);
    head.scale(0.9, 0.85, 0.95);
    head.translate(0, 3.05, 0.12);
    b.addRaw(head, SKIN);
    for (const s of [-1, 1]) {
      const ear = new THREE.ConeGeometry(0.14, 0.3, 5);
      ear.rotateZ(s * 0.9);
      ear.translate(s * 0.42, 3.15, 0.05);
      b.addRaw(ear, SKIN_DARK);
    }
    const arm = new THREE.CylinderGeometry(0.2, 0.24, 1.0, 6);
    arm.rotateZ(0.25);
    arm.translate(-0.95, 1.75, 0.1);
    b.addRaw(arm, SKIN_DARK);
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const bodyMesh = b.build(bodyMat, { castShadow: true, receiveShadow: true });
    this.group.add(bodyMesh);

    // Keulenarm als eigene Gruppe mit Schulter-Pivot — rotiert beim Hebe-/Schlag-Telegraph
    this.clubArmGroup = new THREE.Group();
    this.clubArmGroup.position.set(0.9, 2.15, 0.1);
    const darkMat = new THREE.MeshLambertMaterial({ color: SKIN_DARK, flatShading: true });
    const clubMat = new THREE.MeshLambertMaterial({ color: CLUB, flatShading: true });
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.55, 6), darkMat);
    upperArm.position.set(0, -0.28, 0);
    this.clubArmGroup.add(upperArm);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.55, 6), darkMat);
    forearm.position.set(0, -0.75, 0);
    this.clubArmGroup.add(forearm);
    const clubHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 6), clubMat);
    clubHandle.position.set(0, -1.35, 0);
    this.clubArmGroup.add(clubHandle);
    const clubHead = new THREE.Mesh(new THREE.SphereGeometry(0.34, 7, 5), clubMat);
    clubHead.position.set(0, -1.75, 0);
    this.clubArmGroup.add(clubHead);
    this.group.add(this.clubArmGroup);

    system.scene.add(this.group);

    // Boden-Ring: Telegraph-Warnung vor dem Keulenschlag
    const ringGeo = new THREE.RingGeometry(TROLL_TUNING.slamRange - 0.3, TROLL_TUNING.slamRange, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3030, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.frustumCulled = false;
    system.scene.add(this.ring);

    this._buildChest(glowTex);
  }

  _buildChest(glowTex) {
    const cx = this.homePos.x + 4, cz = this.homePos.z + 2;
    const cy = terrainHeight(cx, cz);
    const group = new THREE.Group();
    group.position.set(cx, cy, cz);
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6d5236, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), woodMat);
    body.position.y = 0.275;
    body.castShadow = true;
    group.add(body);
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.55, -0.27);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.22, 0.58), woodMat);
    lid.position.set(0, 0.11, 0.27);
    lidPivot.add(lid);
    group.add(lidPivot);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xff5a6a, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(0.1);
    glow.position.set(0, 0.65, 0);
    group.add(glow);
    group.visible = false;
    this.system.scene.add(group);
    this.chest = { group, lidPivot, glow, opened: false, openT: -1, collected: false };
  }

  _steerXZ(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  applyHit(spellId, _boltVel) {
    if (!this.alive) return;
    const dmg = spellId === 'incendio' ? 2 : spellId === 'stupor' ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg;
    this.system.fx.burst(this.pos, 0x8a9878, 10, 3, { gravity: -2, life: 0.4 });
    if (this.hp <= 0) { this._die(); return; }
    // Stupor unterbricht jede laufende Aktion (auch den Telegraph!) — der
    // taktische Konter gegen den Keulenschlag.
    if (spellId === 'stupor' && this.state !== 'dying') {
      this.state = 'stagger';
      this.stateT = 0;
    }
  }

  _die() {
    this.alive = false;
    this.state = 'dying';
    this.stateT = 0;
    this.system.fx.burst(this.pos, 0x8a9878, 40, 6, { gravity: -2, life: 1.0 });
    this.system.audio.chime?.();
    this.system.hud?.showToast('Der Troll ist besiegt! Eine Truhe erscheint … 🧌', 3.5);
  }

  update(dt, player) {
    // Die Truhe bleibt auch nach 'dead' interaktiv (Spieler kommt evtl. erst
    // später vorbei) — läuft daher VOR dem frühen Return für 'dead' weiter.
    if (this.state === 'dead') { this._updateChest(dt, player); return; }

    // Sterbeanimation IMMER zu Ende, unabhängig vom Distanz-Culling (gleiche
    // Lehre wie beim Schattengeist aus Phase 3).
    if (this.state === 'dying') {
      this.stateT += dt;
      this.group.scale.setScalar(Math.max(0, 1 - this.stateT / 1.0));
      this.pos.y -= dt * 0.3;
      this.ringMat.opacity = Math.max(0, this.ringMat.opacity - dt * 2);
      if (this.stateT >= 1.0) {
        this.state = 'dead';
        this.group.visible = false;
        this.chest.group.visible = true;
      }
      this._updateChest(dt, player);
      return;
    }

    const distSq = this.pos.distanceToSquared(player.pos);
    if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; this._updateChest(dt, player); return; }
    this.group.visible = true;
    if (distSq > CULL_FULL * CULL_FULL) { this._updateChest(dt, player); return; }

    switch (this.state) {
      case 'patrol': {
        const t = this.system.time;
        const lx = this.homePos.x + Math.sin(t * 0.2 + this.phaseA) * TROLL_TUNING.patrolRadius;
        const lz = this.homePos.z + Math.cos(t * 0.17 + this.phaseA) * TROLL_TUNING.patrolRadius;
        this._steerXZ(lx, lz, TROLL_TUNING.patrolSpeed, dt);
        if (distSq < TROLL_TUNING.aggroRange * TROLL_TUNING.aggroRange) {
          this.state = 'aggro';
          this.stateT = 0;
          this.system.audio.trollRoar?.();
        }
        break;
      }
      case 'aggro': {
        this.stateT += dt;
        this.attackCd -= dt;
        const dist = Math.sqrt(distSq);
        if (dist > TROLL_TUNING.slamRange * 0.7) {
          this._steerXZ(player.pos.x, player.pos.z, TROLL_TUNING.chaseSpeed, dt);
        } else {
          this.vel.set(0, 0, 0);
        }
        if (this.attackCd <= 0 && dist < TROLL_TUNING.slamRange + 1.5) {
          this.state = 'telegraph';
          this.stateT = 0;
        }
        if (distSq > TROLL_TUNING.leaveAggroRange * TROLL_TUNING.leaveAggroRange) {
          this.state = 'patrol';
          this.stateT = 0;
        }
        break;
      }
      case 'telegraph': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / TROLL_TUNING.telegraphDur);
        this.clubArmGroup.rotation.x = -f * 2.3;
        this.ringMat.opacity = f * 0.6;
        this.ring.scale.setScalar(0.6 + f * 0.4);
        if (this.stateT >= TROLL_TUNING.telegraphDur) {
          this.state = 'slam';
          this.stateT = 0;
          this._slamApplied = false;
        }
        break;
      }
      case 'slam': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / 0.25);
        this.clubArmGroup.rotation.x = -2.3 + f * 2.6;
        if (this.stateT >= 0.02 && !this._slamApplied) {
          this._slamApplied = true;
          this.system.audio.trollSlam?.();
          this.system.fx.burst(this.pos, 0x8a7250, 24, 5, { gravity: -3, life: 0.5 });
          this.ringMat.opacity = 1;
          const distNow = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
          if (distNow < TROLL_TUNING.slamRange && !this.system.peaceful) {
            const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
            const d = Math.hypot(dx, dz) || 1;
            this.system.health.damage(TROLL_TUNING.slamDmg, { x: dx / d, y: 0.3, z: dz / d });
            this.system.fx.shake(0.5);
          }
        }
        if (this.stateT >= 0.35) {
          this.state = 'aggro';
          this.stateT = 0;
          this.attackCd = rand(TROLL_TUNING.attackCdMin, TROLL_TUNING.attackCdMax);
        }
        break;
      }
      case 'stagger': {
        this.stateT += dt;
        this.clubArmGroup.rotation.x *= Math.max(0, 1 - dt * 3);
        if (this.stateT >= TROLL_TUNING.staggerDur) {
          this.state = 'aggro';
          this.stateT = 0;
        }
        break;
      }
    }

    if (this.state !== 'telegraph' && this.state !== 'slam') {
      this.ringMat.opacity = Math.max(0, this.ringMat.opacity - dt * 3);
    }
    this.ring.position.set(this.pos.x, terrainHeight(this.pos.x, this.pos.z) + 0.05, this.pos.z);

    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.2) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      this.group.rotation.y = angleLerp(this.group.rotation.y, targetYaw, Math.min(1, dt * 4));
    }

    this._updateChest(dt, player);
  }

  // Truhe: proximity-getriggert (kein Zauber nötig), gibt das Herz-Upgrade
  _updateChest(dt, player) {
    const chest = this.chest;
    if (!chest.group.visible || chest.collected) return;
    if (!chest.opened) {
      const dx = player.pos.x - chest.group.position.x, dz = player.pos.z - chest.group.position.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        chest.opened = true;
        chest.openT = 0;
        this.system.audio.chime?.('fanfare');
        this.system.fx.burst(chest.group.position, 0xff5a6a, 24, 4, { gravity: -1, life: 1.0 });
      }
    }
    if (chest.openT >= 0) {
      chest.openT += dt;
      const f = Math.min(1, chest.openT / 1.0);
      chest.lidPivot.rotation.x = -1.9 * f;
      chest.glow.scale.setScalar(0.1 + f * 1.1);
      chest.glow.material.opacity = f < 0.5 ? f * 1.6 : (1 - f) * 1.6;
      if (chest.openT >= 1.0 && !chest.collected) {
        chest.collected = true;
        chest.openT = -1;
        this.system.health.upgradeMaxHearts(6);
        this.system.hud?.setHearts(this.system.health.hearts, this.system.health.maxHearts);
        this.system.hud?.showToast('❤️ Herz-Upgrade! Maximale Herzen: 6', 4);
        this.system.onTrollChest?.();
      }
    }
  }

  // Setzt den Troll-Zustand SOFORT (ohne Animation/Sound) — für Save-Reload
  // und den Reset-Button, analog zu puzzles.js' restore().
  restore(defeated, chestCollected) {
    if (defeated) {
      this.alive = false;
      this.state = 'dead';
      this.hp = 0;
      this.group.visible = false;
    } else {
      this.alive = true;
      this.state = 'patrol';
      this.hp = this.maxHp;
      this.group.visible = true;
      this.pos.set(this.homePos.x, terrainHeight(this.homePos.x, this.homePos.z), this.homePos.z);
    }
    this.ringMat.opacity = 0;
    this.chest.collected = !!chestCollected;
    this.chest.opened = !!chestCollected;
    this.chest.openT = -1;
    this.chest.lidPivot.rotation.x = chestCollected ? -1.9 : 0;
    this.chest.glow.material.opacity = 0;
    this.chest.group.visible = defeated;
    if (chestCollected) this.system.health.maxHearts = Math.max(this.system.health.maxHearts, 6);
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
    this._nearestGhostDist = Infinity;
    this.onTrollChest = null; // main.js hängt hier persist() ein
    this.list = [];

    const pixieParts = buildPixieParts(glowTex);
    let seed = 1;
    for (const swarm of PIXIE_SWARMS) {
      for (let i = 0; i < PIXIE_PER_SWARM; i++) {
        this.list.push(new Pixie(this, pixieParts, swarm, seed++));
      }
    }

    const ghostParts = buildGhostParts(glowTex);
    seed = 1;
    for (const spawn of GHOST_SPAWNS) {
      for (let i = 0; i < GHOST_PER_SPAWN; i++) {
        this.list.push(new Ghost(this, ghostParts, spawn, seed++));
      }
    }

    this.troll = new Troll(this, glowTex);
    this.list.push(this.troll);
  }

  get trollDefeated() { return this.troll.state === 'dead'; }

  saveTroll() {
    return { defeated: this.trollDefeated, chestCollected: this.troll.chest.collected };
  }

  restoreTroll(defeated, chestCollected) {
    this.troll.restore(!!defeated, !!chestCollected);
  }

  update(dt, player, skyState, lumosOn) {
    this.time += dt;
    this._nearestGhostDist = Infinity;
    for (const c of this.list) c.update(dt, player, skyState, lumosOn);

    // Getragene Schnätze hängen unterm Wichtel — pro Frame nachziehen
    for (const c of this.list) {
      if (c.carrying) c.carrying.group.position.set(c.pos.x, c.pos.y - 0.4, c.pos.z);
    }

    // Kälte-Aura (HUD-Vignette) & Schatten-Drone: reagieren auf den NÄCHSTEN
    // Geist, nicht auf jeden einzeln (sonst Last-Write-Wins-Flackern)
    const nd = this._nearestGhostDist;
    const coldFrac = nd < TUNING.ghost.coldRange ? 1 - nd / TUNING.ghost.coldRange : 0;
    this.hud?.setCold?.(coldFrac);
    const droneFrac = nd < TUNING.ghost.aggroRange ? Math.max(0, 1 - nd / TUNING.ghost.aggroRange) : 0;
    this.audio?.setGhostDrone?.(droneFrac);
  }
}
