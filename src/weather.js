// Wetter: Zustandsmaschine (klar/bewölkt/regen/sturm), Regen-Partikel,
// Blitz+Donner im Sturm, fallende Blätter in Waldnähe. windStrength und
// gloom sind die zentralen Ausgabegrößen — andere Systeme (sky.js, audio.js,
// props.js-Sway) lesen sie, ohne selbst etwas über Wetter-Zustände zu wissen.

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { forestDensity } from './props.js';
import { mulberry32 } from './noise.js';

const STATES = ['klar', 'bewölkt', 'regen', 'sturm'];
// Ziel-Werte pro Zustand: [windStrength, gloom, regenOpacity]
const TARGETS = {
  klar: [0.2, 0, 0],
  bewölkt: [0.4, 0.12, 0],
  regen: [0.65, 0.5, 0.32],
  sturm: [1.0, 0.82, 0.48],
};
const BLEND_T = 15; // s, Übergangsdauer

// Große Halle (castle.js: x0=-42,x1=-22,z0=-15,z1=31) — geschlossener
// Innenraum mit Dach. Kein generischer "Dach über mir"-Test nötig (die
// Blocker-/Plattform-Registry ist für Boden-Landung gedacht, nicht für
// Sichtlinien nach oben) — eine feste Ausschlusszone reicht hier völlig.
function isIndoor(x, z) {
  return x > -42 && x < -22 && z > -15 && z < 31;
}

const RAIN_COUNT = 700;
const RAIN_RADIUS = 25;
const RAIN_FALL_SPEED = 22;
const RAIN_STREAK = 1.1;
const LEAF_COUNT = 60;

export class WeatherSystem {
  constructor(scene, hud, audio) {
    this.scene = scene;
    this.hud = hud;
    this.audio = audio;
    this.rng = mulberry32(31337);

    this.state = 'klar';
    this._stateT = 0;
    this._stateDur = 150 + this.rng() * 60;
    this.windStrength = TARGETS.klar[0];
    this.gloom = TARGETS.klar[1];
    this._rainOpacity = 0;

    this._thunderTimer = 8 + this.rng() * 12;
    this._thunderPending = -1;
    this.lightningBoost = 0;

    // ---------- Regen (LineSegments, player-zentrierte Gruppe) ----------
    this.rainGroup = new THREE.Group();
    scene.add(this.rainGroup);
    const positions = new Float32Array(RAIN_COUNT * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xaec4d8, transparent: true, opacity: 0, depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(geo, mat);
    this.rainLines.frustumCulled = false;
    this.rainGroup.add(this.rainLines);
    this.rainGeo = geo;
    this.rainMat = mat;

    this.rainLX = new Float32Array(RAIN_COUNT);
    this.rainLZ = new Float32Array(RAIN_COUNT);
    this.rainY = new Float32Array(RAIN_COUNT);
    this.rainGroundY = new Float32Array(RAIN_COUNT);
    this.rainHidden = new Uint8Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) this._resetDrop(i, { x: 0, y: 0, z: 0 });

    // ---------- Fallende Blätter (kleiner Pool, nur in Waldnähe) ----------
    const leafMat = new THREE.SpriteMaterial({
      color: 0x8a6a2e, transparent: true, opacity: 0, depthWrite: false,
    });
    this.leaves = [];
    for (let i = 0; i < LEAF_COUNT; i++) {
      const s = new THREE.Sprite(leafMat.clone());
      s.scale.setScalar(0.22);
      s.visible = false;
      scene.add(s);
      this.leaves.push({ sprite: s, active: false, t: 0, dur: 1, x: 0, z: 0, topY: 0, groundY: 0, phase: this.rng() * Math.PI * 2, r: 0.6 + this.rng() * 0.8 });
    }
    this._leafSpawnT = 0;
  }

  _resetDrop(i, player) {
    const a = this.rng() * Math.PI * 2, r = this.rng() * RAIN_RADIUS;
    const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
    const wx = player.x + lx, wz = player.z + lz;
    this.rainLX[i] = lx;
    this.rainLZ[i] = lz;
    this.rainGroundY[i] = terrainHeight(wx, wz);
    this.rainY[i] = player.y + 16 + this.rng() * 6;
    this.rainHidden[i] = isIndoor(wx, wz) ? 1 : 0;
  }

  // Sofortiger Wechsel für Tests (__game.weather.set('sturm'))
  set(state) {
    if (!STATES.includes(state)) return;
    this.state = state;
    this._stateT = 0;
    this._stateDur = 150 + this.rng() * 60;
  }

  _updateRain(dt, player) {
    const posArr = this.rainGeo.attributes.position.array;
    // Horizontale Wind-Drift (m/s) — skaliert mit windStrength, feste Richtung
    const windVelX = this.windStrength * 6, windVelZ = this.windStrength * 2;
    for (let i = 0; i < RAIN_COUNT; i++) {
      if (this.rainHidden[i]) {
        // Weit weg parken (unsichtbar) statt jeden Frame neu zu prüfen —
        // gelegentliche Re-Prüfung reicht, falls der Spieler das Gebäude verlässt.
        if (this.rng() < 0.01) this._resetDrop(i, player.pos);
        const b = i * 6;
        posArr[b + 1] = -500; posArr[b + 4] = -500;
        continue;
      }
      this.rainY[i] -= RAIN_FALL_SPEED * dt;
      this.rainLX[i] += windVelX * dt;
      this.rainLZ[i] += windVelZ * dt;
      if (this.rainY[i] < this.rainGroundY[i]) {
        this._resetDrop(i, player.pos);
        continue;
      }
      const b = i * 6;
      const lx = this.rainLX[i], lz = this.rainLZ[i], y = this.rainY[i];
      posArr[b + 0] = lx; posArr[b + 1] = y; posArr[b + 2] = lz;
      posArr[b + 3] = lx + windVelX * 0.05; posArr[b + 4] = y - RAIN_STREAK; posArr[b + 5] = lz + windVelZ * 0.05;
    }
    this.rainGeo.attributes.position.needsUpdate = true;
    this.rainGroup.position.set(player.pos.x, 0, player.pos.z);
    this.rainMat.opacity = this._rainOpacity * 0.4;
  }

  _updateLightning(dt) {
    if (this.state === 'sturm') {
      this._thunderTimer -= dt;
      if (this._thunderTimer <= 0) {
        this._thunderTimer = 8 + this.rng() * 12;
        this.lightningBoost = 3.2;
        this.hud?.flashLightning();
        this._thunderPending = 1 + this.rng() * 2;
      }
    }
    if (this.lightningBoost > 0) this.lightningBoost = Math.max(0, this.lightningBoost - dt * 8);
    if (this._thunderPending >= 0) {
      this._thunderPending -= dt;
      if (this._thunderPending <= 0) {
        this._thunderPending = -1;
        this.audio?.thunder?.();
      }
    }
  }

  _updateLeaves(dt, player) {
    const density = forestDensity(player.pos.x, player.pos.z);
    const canSpawn = density > 0.5 && this.windStrength > 0.25;
    this._leafSpawnT -= dt;
    if (canSpawn && this._leafSpawnT <= 0) {
      this._leafSpawnT = 0.4 / this.windStrength;
      const free = this.leaves.find((l) => !l.active);
      if (free) {
        const a = this.rng() * Math.PI * 2, r = 4 + this.rng() * 20;
        free.x = player.pos.x + Math.cos(a) * r;
        free.z = player.pos.z + Math.sin(a) * r;
        free.groundY = terrainHeight(free.x, free.z);
        free.topY = free.groundY + 5 + this.rng() * 3;
        free.t = 0;
        free.dur = 2.5 + this.rng() * 1.5;
        free.active = true;
        free.sprite.visible = true;
      }
    }
    for (const l of this.leaves) {
      if (!l.active) continue;
      l.t += dt / l.dur;
      if (l.t >= 1) { l.active = false; l.sprite.visible = false; continue; }
      const y = l.topY + (l.groundY - l.topY) * l.t;
      const spiralR = l.r * (1 - l.t * 0.6);
      l.sprite.position.set(
        l.x + Math.cos(l.t * 8 + l.phase) * spiralR,
        y,
        l.z + Math.sin(l.t * 8 + l.phase) * spiralR
      );
      l.sprite.material.opacity = Math.min(1, (1 - l.t) * 1.5) * 0.85;
    }
  }

  update(dt, player) {
    this._stateT += dt;
    if (this._stateT >= this._stateDur) {
      this._stateT = 0;
      this._stateDur = 120 + this.rng() * 180;
      const idx = STATES.indexOf(this.state);
      // Bevorzugt Nachbar-Zustand (klar<->bewölkt<->regen<->sturm) statt Sprung
      const dir = this.rng() < 0.5 ? -1 : 1;
      let next = idx + dir;
      if (next < 0) next = 1; else if (next >= STATES.length) next = STATES.length - 2;
      this.state = STATES[next];
    }

    const [tWind, tGloom, tRain] = TARGETS[this.state];
    const k = Math.min(1, dt / BLEND_T);
    this.windStrength += (tWind - this.windStrength) * k;
    this.gloom += (tGloom - this.gloom) * k;
    this._rainOpacity += (tRain - this._rainOpacity) * k;

    if (player) {
      this._updateRain(dt, player);
      this._updateLeaves(dt, player);
    }
    this._updateLightning(dt);
  }
}
