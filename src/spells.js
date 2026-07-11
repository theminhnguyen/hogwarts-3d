// Zauber-System: Projektil-Pool, Stupor-Bolzen (Phase 1), Kollision gegen
// Gelände/Wasser/Blocker, Einschlag-FX. Der Stab reagiert schon auf alle
// vier Sprüche (Flick-Animation + Cooldown), aber nur Stupor wirkt bereits —
// Incendio/Leviosa/Lumos-Wirkung folgt in Phase 3/4. Ziel-Registry ist das
// Bindeglied zu den Rätseln (Phase 5/6): puzzles.js registriert sich hier,
// spells.js bleibt dumm/generisch.

import * as THREE from 'three';
import { pointBlocked } from './geo.js';
import { terrainHeight, WATER_LEVEL, LAKE } from './terrain.js';
import { SPELLS } from './wand.js';

const POOL_SIZE = 24;
const LIGHT_POOL_SIZE = 3;
const BOLT_RADIUS = 0.35;

export const TUNING = {
  stupor:   { speed: 46, dmg: 1, cooldown: 0.45, ttl: 2.2 },
  incendio: { speed: 34, dmg: 2, cooldown: 0.9, ttl: 2.0, gravity: -9 },
  leviosa:  { range: 7, holdDist: 4, cooldown: 0.2 },
  lumos:    { cooldown: 0.3 },
};

const _dir = new THREE.Vector3();

// Kürzester Abstand ein Punkt P zur Strecke A→B (quadriert). Nötig, weil
// Stupor bei 46 m/s / 60fps ~0.77m pro Frame zurücklegt — mehr als der
// Trefferradius (~0.63m) — reine Punktprüfung würde kleine/schnelle Ziele
// zuverlässig verfehlen ("Tunneling").
function segPointDistSq(ax, ay, az, bx, by, bz, px, py, pz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  let t = abLenSq > 1e-9 ? ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / abLenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return dx * dx + dy * dy + dz * dz;
}

export class SpellSystem {
  constructor(scene, wand, fx, audio) {
    this.scene = scene;
    this.wand = wand;
    this.fx = fx;
    this.audio = audio;

    this.cooldowns = { stupor: 0, incendio: 0, leviosa: 0, lumos: 0 };
    this.targets = []; // Ziel-Registry — Rätsel docken hier an (Phase 5/6)
    this._camPos = null;

    // Bolzen-Pool
    const baseMat = new THREE.SpriteMaterial({
      map: fx.glowTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.bolts = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = new THREE.Sprite(baseMat.clone());
      sprite.visible = false;
      scene.add(sprite);
      this.bolts.push({
        sprite, active: false, spellId: null,
        pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(),
        ttl: 0, light: null,
      });
    }
    this._nextBolt = 0;

    // Licht-Pool: max. 3 gleichzeitige Zauber-Lichter (Performance-Budget)
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL_SIZE; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      scene.add(l);
      this.lights.push({ light: l, life: 0 });
    }
  }

  registerTarget(target) { this.targets.push(target); return target; }

  // Vom Loslassen der Maustaste — für Leviosa relevant (Phase 4)
  release() {}

  cast(camera) {
    const id = this.wand.activeSpell;
    if (this.cooldowns[id] > 0) return;
    this.cooldowns[id] = TUNING[id].cooldown;
    this.wand.playCast();

    if (id === 'stupor') {
      this.audio.castStupor?.();
      this._fireBolt('stupor', camera);
    }
    // incendio/leviosa/lumos: Stab flickt & kühlt schon ab, Wirkung folgt später.
  }

  _fireBolt(spellId, camera) {
    const bolt = this._allocBolt();
    const tuning = TUNING[spellId];
    camera.getWorldDirection(_dir);
    bolt.pos.copy(this.wand.tipWorldPos).addScaledVector(_dir, 0.15);
    bolt.vel.copy(_dir).multiplyScalar(tuning.speed);
    bolt.spellId = spellId;
    bolt.ttl = tuning.ttl;
    bolt.active = true;
    bolt.sprite.visible = true;
    bolt.sprite.material.color.setHex(SPELLS[spellId].color);
    bolt.sprite.scale.setScalar(0.55);
    bolt.sprite.position.copy(bolt.pos);
    this._assignLight(bolt);
  }

  _allocBolt() {
    const bolt = this.bolts[this._nextBolt];
    this._nextBolt = (this._nextBolt + 1) % POOL_SIZE;
    this._despawnBolt(bolt, false);
    return bolt;
  }

  _assignLight(bolt) {
    let slot = this.lights.find(l => l.life <= 0);
    if (!slot) slot = this.lights.reduce((a, b) => (a.life < b.life ? a : b));
    slot.life = bolt.ttl;
    slot.light.color.setHex(SPELLS[bolt.spellId].color);
    slot.light.intensity = 6;
    slot.light.position.copy(bolt.pos);
    bolt.light = slot;
  }

  _despawnBolt(bolt, withFx = true, hitPos = null) {
    if (!bolt.active) { bolt.sprite.visible = false; return; }
    bolt.active = false;
    bolt.sprite.visible = false;
    if (bolt.light) { bolt.light.life = 0; bolt.light.light.intensity = 0; bolt.light = null; }
    if (withFx) {
      const p = hitPos || bolt.pos;
      this.fx.burst(p, SPELLS[bolt.spellId].color, 16, 6);
      this.audio.spellImpact?.(bolt.spellId);
      if (this._camPos && p.distanceToSquared(this._camPos) < 9) this.fx.shake(0.15);
    }
  }

  update(dt, camera, creatures) {
    for (const id in this.cooldowns) {
      if (this.cooldowns[id] > 0) this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
    }
    this._camPos = camera.position;

    for (const bolt of this.bolts) {
      if (!bolt.active) continue;
      bolt.ttl -= dt;
      if (bolt.ttl <= 0) { this._despawnBolt(bolt); continue; }

      const tuning = TUNING[bolt.spellId];
      if (tuning.gravity) bolt.vel.y += tuning.gravity * dt;
      bolt.prevPos.copy(bolt.pos);
      bolt.pos.addScaledVector(bolt.vel, dt);
      bolt.sprite.position.copy(bolt.pos);
      if (bolt.light) bolt.light.light.position.copy(bolt.pos);
      if (Math.random() < 0.6) this.fx.trail(bolt.pos, SPELLS[bolt.spellId].color);

      // Gelände
      if (bolt.pos.y <= terrainHeight(bolt.pos.x, bolt.pos.z)) {
        this._despawnBolt(bolt, true, bolt.pos);
        continue;
      }
      // Wasser
      const dLake = Math.hypot(bolt.pos.x - LAKE.x, bolt.pos.z - LAKE.z);
      if (dLake < LAKE.r + 55 && bolt.pos.y <= WATER_LEVEL) {
        this.fx.burst(bolt.pos, 0xbfe4ff, 10, 3, { gravity: -2, life: 0.4 });
        this._despawnBolt(bolt, false);
        continue;
      }
      // Blocker (Wände, Türme, Bäume …)
      if (pointBlocked(bolt.pos.x, bolt.pos.y, bolt.pos.z)) {
        this._despawnBolt(bolt, true, bolt.pos);
        continue;
      }
      // Kreaturen (Phase 2+) — Strecken- statt Punktprüfung gegen Tunneling
      if (creatures) {
        let hitCreature = false;
        for (const c of creatures) {
          if (!c.alive) continue;
          const r = c.radius + BOLT_RADIUS;
          const d2 = segPointDistSq(
            bolt.prevPos.x, bolt.prevPos.y, bolt.prevPos.z,
            bolt.pos.x, bolt.pos.y, bolt.pos.z,
            c.pos.x, c.pos.y, c.pos.z
          );
          if (d2 < r * r) {
            c.applyHit(bolt.spellId, bolt.vel);
            this._despawnBolt(bolt, true, bolt.pos);
            hitCreature = true;
            break;
          }
        }
        if (hitCreature) continue;
      }
      // Rätsel-Ziele (Phase 5+)
      for (const target of this.targets) {
        const p = target.getPos();
        const r = (target.radius || 0.9) + BOLT_RADIUS;
        const d2 = segPointDistSq(
          bolt.prevPos.x, bolt.prevPos.y, bolt.prevPos.z,
          bolt.pos.x, bolt.pos.y, bolt.pos.z,
          p.x, p.y, p.z
        );
        if (d2 < r * r && (!target.accepts || target.accepts.includes(bolt.spellId))) {
          target.onSpell?.(bolt.spellId, bolt.pos);
          this._despawnBolt(bolt, true, bolt.pos);
          break;
        }
      }
    }

    // Bolzen-Lichter klingen mit ihrem Bolzen ab (falls despawn sie nicht schon auf 0 setzte)
    for (const slot of this.lights) {
      if (slot.life > 0) slot.life -= dt;
    }
  }
}
