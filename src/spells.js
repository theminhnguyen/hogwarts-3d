// Zauber-System: Projektil-Pool (Stupor/Incendio), Leviosa-Greifmodus mit
// Feder-Physik, Lumos-Toggle. Kollision gegen Gelände/Wasser/Blocker/
// Kreaturen mit Strecken- statt Punktprüfung (Tunneling-Schutz). Ziel-
// Registry ist das Bindeglied zu den Rätseln (Phase 5/6): puzzles.js
// registriert sich hier, spells.js bleibt dumm/generisch.

import * as THREE from 'three';
import { pointBlocked, addCircleBlocker, platformGround } from './geo.js';
import { terrainHeight, WATER_LEVEL, LAKE } from './terrain.js';
import { SPELLS, SPELL_ORDER } from './wand.js';
import { buildPatronusModel } from './patronus.js';

const POOL_SIZE = 24;
const LIGHT_POOL_SIZE = 3;
const BOLT_RADIUS = 0.35;

export const TUNING = {
  stupor:   { speed: 46, dmg: 1, cooldown: 0.45, ttl: 2.2 },
  incendio: { speed: 34, dmg: 2, cooldown: 0.9, ttl: 2.0, gravity: -9 },
  leviosa: {
    range: 7, holdDist: 4, cooldown: 0.2, coneAngle: 12 * Math.PI / 180,
    springK: 8, damp: 0.85, minHeight: 0.5, maxHeight: 4, gravity: 24,
  },
  lumos: { cooldown: 0.3 },
  patronum: { cooldown: 8, range: 26, dur: 2.8, repelRadius: 10 },
};

// Die beiden Leviosa-Steinblöcke im Nordgarten (Rätsel-Setup folgt in Phase 5,
// hier nur der Greifmechanismus selbst — siehe PLAN-MAGIE.md Abschnitt 3.3)
const LEVIOSA_SPOTS = [
  { x: -14, z: -62 },
  { x: 14, z: -62 },
];

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
  constructor(scene, wand, fx, audio, hud, glowTex, player) {
    this.scene = scene;
    this.wand = wand;
    this.fx = fx;
    this.audio = audio;
    this.hud = hud;
    this._glowTex = glowTex;
    this._player = player;

    this.cooldowns = { stupor: 0, incendio: 0, leviosa: 0, lumos: 0, patronum: 0 };
    // S7 Dunkler-Sud-Trank: Vorbereitung für S8 (verbotene Sprüche) — von
    // main.js pro Frame aus heim.trank gesetzt, hier bislang ungenutzt
    // (wie die dunkler-Pfad-Käfig-Vorbereitung aus S4).
    this.dmgMul = 1;
    this.targets = []; // Ziel-Registry — Rätsel docken hier an (Phase 5/6)
    this._camPos = null;
    this.lumosOn = false;    // Migration: lebt jetzt hier statt in main.js
    this.leviosaHeld = null; // aktuell gegriffenes Leviosa-Objekt (oder null)
    this._buildLeviosaObjects();

    // Expecto Patronum: erst nach dem Hauspokal freigeschaltet (Abschnitt
    // 4.1). Charge-Hirsch wird lazy gebaut (nur falls je gecastet).
    this.epUnlocked = false;
    this._patronusModel = null;
    this._chargeT = -1; // -1 = kein aktiver Charge
    this._chargeStart = new THREE.Vector3();
    this._chargeDir = new THREE.Vector3();

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

  // Schaltet Expecto Patronum frei (Hauspokal gewonnen). Idempotent — mehrfache
  // Aufrufe (z.B. jeden Frame nach dem Finale) sind harmlos.
  unlockPatronum(showToast = true) {
    if (this.epUnlocked) return;
    this.epUnlocked = true;
    if (!SPELL_ORDER.includes('patronum')) SPELL_ORDER.push('patronum');
    this.hud?.buildSpellbar(SPELL_ORDER.map(id => ({ id, ...SPELLS[id] })));
    if (showToast) {
      this.hud?.showToast('🦌 Du spürst eine neue Kraft … EXPECTO PATRONUM! (Taste 5)', 6);
    }
  }

  registerTarget(target) { this.targets.push(target); return target; }

  get isHoldingLeviosa() { return this.leviosaHeld !== null; }

  // Baut die 2 greifbaren Steinblöcke im Nordgarten (Runen-Gravur = zweite,
  // etwas größere Box mit BackSide-Material, ergibt dunkle Kanten am Rand).
  _buildLeviosaObjects() {
    const outerGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const outerMat = new THREE.MeshLambertMaterial({ color: 0x8a8078, flatShading: true });
    const outlineGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
    const outlineMat = new THREE.MeshBasicMaterial({ color: 0x453c32, side: THREE.BackSide });
    const glowMat = new THREE.SpriteMaterial({
      map: this.fx.glowTex, color: SPELLS.leviosa.color, transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.leviosaObjects = [];
    for (const spot of LEVIOSA_SPOTS) {
      const y = terrainHeight(spot.x, spot.z) + 0.45;
      const group = new THREE.Group();
      group.position.set(spot.x, y, spot.z);
      const outer = new THREE.Mesh(outerGeo, outerMat);
      outer.castShadow = true;
      outer.receiveShadow = true;
      group.add(outer);
      group.add(new THREE.Mesh(outlineGeo, outlineMat));
      const glow = new THREE.Sprite(glowMat.clone());
      glow.scale.setScalar(1.4);
      group.add(glow);
      this.scene.add(group);

      const blocker = addCircleBlocker(spot.x, spot.z, 0.7, y - 0.45, y + 0.45);
      this.leviosaObjects.push({
        group, pos: group.position, vel: new THREE.Vector3(),
        falling: false, blocker, glow,
      });
    }
  }

  _leviosaGrab(camera) {
    if (this.leviosaHeld) return;
    camera.getWorldDirection(_dir);
    let best = null, bestAngle = TUNING.leviosa.coneAngle;
    for (const obj of this.leviosaObjects) {
      if (obj.falling) continue;
      const dx = obj.pos.x - camera.position.x, dy = obj.pos.y - camera.position.y, dz = obj.pos.z - camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > TUNING.leviosa.range || dist < 1e-4) continue;
      const dot = (dx * _dir.x + dy * _dir.y + dz * _dir.z) / dist;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle < bestAngle) { best = obj; bestAngle = angle; }
    }
    if (best) {
      this.leviosaHeld = best;
      best.vel.set(0, 0, 0);
      best.blocker.disabled = true;
      best.glow.material.opacity = 0.7;
      this.audio.leviosaHold?.(true);
    }
  }

  _updateLeviosaObjects(dt, camera) {
    const T = TUNING.leviosa;
    // Sicherheitsnetz: Spruch gewechselt, während noch etwas in der Hand ist
    if (this.leviosaHeld && this.wand.activeSpell !== 'leviosa') this.release();

    for (const obj of this.leviosaObjects) {
      if (obj === this.leviosaHeld) {
        camera.getWorldDirection(_dir);
        const tx = camera.position.x + _dir.x * T.holdDist;
        const tz = camera.position.z + _dir.z * T.holdDist;
        const groundY = terrainHeight(tx, tz);
        let ty = camera.position.y + _dir.y * T.holdDist;
        ty = Math.max(groundY + T.minHeight, Math.min(groundY + T.maxHeight, ty));
        obj.vel.x += (tx - obj.pos.x) * T.springK * dt;
        obj.vel.y += (ty - obj.pos.y) * T.springK * dt;
        obj.vel.z += (tz - obj.pos.z) * T.springK * dt;
        obj.vel.multiplyScalar(T.damp);
        obj.pos.addScaledVector(obj.vel, dt);
        if (Math.random() < 0.5) this.fx.trail(obj.pos, SPELLS.leviosa.color);
      } else if (obj.falling) {
        obj.vel.y -= T.gravity * dt;
        obj.pos.addScaledVector(obj.vel, dt);
        const groundY = Math.max(terrainHeight(obj.pos.x, obj.pos.z), platformGround(obj.pos.x, obj.pos.z, obj.pos.y));
        if (obj.pos.y <= groundY) {
          obj.pos.y = groundY;
          obj.vel.set(0, 0, 0);
          obj.falling = false;
          obj.blocker.disabled = false;
          obj.blocker.x = obj.pos.x;
          obj.blocker.z = obj.pos.z;
          obj.blocker.minY = obj.pos.y - 0.45;
          obj.blocker.maxY = obj.pos.y + 0.45;
          obj.glow.material.opacity = 0;
          this.fx.burst(obj.pos, 0x8a7250, 12, 2.5, { gravity: -3, life: 0.4 });
        }
      }
    }
  }

  // Vom Loslassen der Maustaste — lässt ein gehaltenes Leviosa-Objekt fallen
  release() {
    if (this.leviosaHeld) {
      this.leviosaHeld.falling = true;
      this.leviosaHeld.glow.material.opacity = 0.35;
      this.leviosaHeld = null;
      this.audio.leviosaHold?.(false);
    }
  }

  // Sterne (Sternbild-Rätsel) sind "unendlich weit" — kein Bolzen-Treffer,
  // sondern reiner Blickwinkel-Check (<2°), unabhängig vom normalen Bolzen.
  _checkStarTargets(camera) {
    camera.getWorldDirection(_dir);
    for (const target of this.targets) {
      if (target.kind !== 'star') continue;
      const p = target.getPos();
      const dx = p.x - camera.position.x, dy = p.y - camera.position.y, dz = p.z - camera.position.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 1e-4) continue;
      const dot = (dx * _dir.x + dy * _dir.y + dz * _dir.z) / dist;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle < (2 * Math.PI / 180)) target.onSpell?.('stupor', p);
    }
  }

  cast(camera) {
    // Kein Zaubern im Flug (K8, PLAN-SCHATTEN-UND-SCHWINGEN.md) — gilt für
    // Besen UND Mounts einheitlich, da beide dasselbe player.flying nutzen.
    if (this._player?.flying) return;
    const id = this.wand.activeSpell;
    if (this.cooldowns[id] > 0) return;
    this.cooldowns[id] = TUNING[id].cooldown;
    this.wand.playCast();

    if (id === 'stupor') {
      this.audio.castStupor?.();
      this._fireBolt('stupor', camera);
      this._checkStarTargets(camera);
    } else if (id === 'incendio') {
      this.audio.castIncendio?.();
      this._fireBolt('incendio', camera);
    } else if (id === 'leviosa') {
      this._leviosaGrab(camera);
    } else if (id === 'lumos') {
      this.lumosOn = !this.lumosOn;
      this.audio.lumosToggle?.(this.lumosOn);
    } else if (id === 'patronum') {
      this._castPatronum(camera);
    }
  }

  // Expecto Patronum: materialisiert den Hirsch aus patronus.js 2m vor dem
  // Spieler und lässt ihn 26m geradeaus über 2.8s galoppieren (nur XZ, er
  // läuft am Boden). update() treibt die eigentliche Bewegung + den Dementor-
  // Vertreiben-Check an (siehe unten).
  _castPatronum(camera) {
    if (!this._patronusModel) {
      this._patronusModel = buildPatronusModel(this._glowTex);
      this.scene.add(this._patronusModel.group);
    }
    this.audio.patronusCast?.();
    camera.getWorldDirection(_dir);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, -1); else _dir.normalize();
    this._chargeDir.copy(_dir);
    this._chargeStart.set(camera.position.x + _dir.x * 2, 0, camera.position.z + _dir.z * 2);
    this._chargeT = 0;
    this._patronusModel.group.visible = true;
  }

  // Bewegt den Charge-Hirschen, faded ein/aus, vertreibt Dementoren im
  // Wirkradius. Läuft überall (auch außerhalb des Moors — dann rein dekorativ,
  // die Schattengeister aus Phase 3 ignorieren ihn bewusst).
  _updatePatronusCharge(dt, creatures) {
    if (this._chargeT < 0) return;
    const T = TUNING.patronum;
    this._chargeT += dt;
    if (this._chargeT >= T.dur) {
      this._chargeT = -1;
      this._patronusModel.group.visible = false;
      return;
    }

    const distTraveled = Math.min(T.range, (this._chargeT / T.dur) * T.range);
    const gx = this._chargeStart.x + this._chargeDir.x * distTraveled;
    const gz = this._chargeStart.z + this._chargeDir.z * distTraveled;
    const groundY = terrainHeight(gx, gz);
    const bob = Math.abs(Math.sin(this._chargeT * 14)) * 0.25;
    const g = this._patronusModel.group;
    g.position.set(gx, groundY + 1 + bob, gz);
    g.lookAt(gx + this._chargeDir.x, groundY + 1, gz + this._chargeDir.z);
    for (const leg of this._patronusModel.legs) {
      leg.rotation.x = Math.sin(this._chargeT * 14 + leg.position.x * 3) * 0.5;
    }

    // Fade-in (0.2s) / Fade-out (letzte 0.4s)
    let fade = 1;
    if (this._chargeT < 0.2) fade = this._chargeT / 0.2;
    else if (this._chargeT > T.dur - 0.4) fade = Math.max(0, (T.dur - this._chargeT) / 0.4);
    this._patronusModel.mat.opacity = 0.55 * fade;
    this._patronusModel.glowMat.opacity = 0.4 * fade;

    this.fx.trail(g.position, 0xcfe8ff);
    this.fx.trail(g.position, 0xcfe8ff);

    if (creatures) {
      const r2 = T.repelRadius * T.repelRadius;
      for (const c of creatures) {
        if (c.species !== 'dementor') continue;
        const dx = c.pos.x - gx, dz = c.pos.z - gz;
        if (dx * dx + dz * dz < r2) c.repel?.();
      }
    }
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
    this._updateLeviosaObjects(dt, camera);
    this._updatePatronusCharge(dt, creatures);

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
      // Kreaturen (Phase 2+) — Strecken- statt Punktprüfung gegen Tunneling.
      // c.hitY hebt die Treffer-Kugel vom pos-Anker (oft der FUSSPUNKT) auf
      // die visuelle Mitte — Spieler zielen auf Torso/Augen, nicht auf Füße.
      if (creatures) {
        let hitCreature = false;
        for (const c of creatures) {
          if (!c.alive) continue;
          const r = c.radius + BOLT_RADIUS;
          const d2 = segPointDistSq(
            bolt.prevPos.x, bolt.prevPos.y, bolt.prevPos.z,
            bolt.pos.x, bolt.pos.y, bolt.pos.z,
            c.pos.x, c.pos.y + (c.hitY || 0), c.pos.z
          );
          if (d2 < r * r) {
            // applyHit() kann true zurückgeben (z.B. immune Dementoren), um
            // den normalen farbigen Einschlagseffekt zu unterdrücken — die
            // Kreatur zeigt dann ihr eigenes (schwächeres) Feedback selbst.
            const suppressDefaultFx = c.applyHit(bolt.spellId, bolt.vel);
            this._despawnBolt(bolt, !suppressDefaultFx, bolt.pos);
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
