// Spieler: Ego-Steuerung (Pointer-Lock), WASD + Sprint + Sprung, Schwerkraft,
// Kollision mit Gelände/Blockern/Plattformen, Schwimmen im See, Kopfwippen.

import * as THREE from 'three';
import { platformGround, resolveBlockers } from './geo.js';
import { terrainHeight, WATER_LEVEL, WORLD_BOUND } from './terrain.js';
import { clamp } from './noise.js';
import { BROOM_FLIGHT, updateFlight, clampFlightHeight } from './flight.js';

const EYE = 1.7;
const RADIUS = 0.45;
const GRAVITY = 24;
const JUMP_V = 8.6;
const WALK = 6.4;
const SPRINT = 11.5;

// Boden-Mount Hippogreif (S5) — "bewusst simpel" laut Plan: gleiche
// Kollision/Sprung/Schwerkraft wie zu Fuß, nur andere Zielgeschwindigkeit.
const RIDE_WALK = 15;
const RIDE_SPRINT = 19;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 20, 150);  // Füße; Spawn auf dem Damm
    this.vel = new THREE.Vector3();
    this.yaw = 0;          // Blick nach Norden (aufs Schloss)
    this.pitch = 0;
    this.grounded = false;
    this.swimming = false;
    this.enabled = false;
    this.slowFactor = 1; // Frost-Aura der Dementoren setzt dies auf 0.75
    this.flying = false; // Besenflug (W7) ODER Mount-Flug (S6)
    this.flightTuning = null; // von flight.js — welches Tuning gerade gilt (Default: Besen)
    this._noAscendT = 0;
    this.onLandFlight = null; // Callback: Auto-Abstieg beendet den Flug
    this.riding = false; // Boden-Mount (S5) — Taste R, nur wenn mounts.hippo
    this.mountSpeedBoost = 0; // +2 mit Sattel (S3-Kauf), von mount.js gesetzt
    this.onDismount = null; // Callback: Schwimmen erzwingt Absitzen

    this.keys = new Set();
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.stepAccum = 0;
    this.onStep = null;   // Callback für Schritt-Sounds
    this.onJump = null;
    this.onLand = null;
    this._baseFov = camera.fov;
    this._wasAirborne = false;

    // Spawnhöhe ans Gelände anpassen
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);

    this.dragLook = false;   // Fallback ohne Pointer-Lock: Umsehen per Ziehen
    this._dragging = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousedown', () => { this._dragging = true; });
    document.addEventListener('mouseup', () => { this._dragging = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (!document.pointerLockElement && this.dragLook && !this._dragging) return;
      this.yaw -= e.movementX * 0.0021;
      this.pitch = clamp(this.pitch - e.movementY * 0.0021, -1.52, 1.52);
    });
  }

  // An Position (x,z) auf den Boden setzen (Gelände oder Plattform)
  teleport(x, z, yaw = null) {
    const terr = terrainHeight(x, z);
    const plat = platformGround(x, z, 10000);
    this.pos.set(x, Math.max(terr, plat), z);
    this.vel.set(0, 0, 0);
    if (yaw !== null) this.yaw = yaw;
  }

  get heading() {
    // Kompass: 0 = Norden, im Uhrzeigersinn
    let h = -this.yaw % (Math.PI * 2);
    if (h < 0) h += Math.PI * 2;
    return h;
  }

  update(dt) {
    const keys = this.keys;
    let fwd = 0, strafe = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) strafe -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) strafe += 1;
    const sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && fwd > 0;

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    // Blickrichtung (XZ): yaw=0 → -z
    const dirX = -sinY * fwd + cosY * strafe;
    const dirZ = -cosY * fwd - sinY * strafe;
    const dLen = Math.hypot(dirX, dirZ) || 1;

    if (this.flying) {
      // Blickrichtungsflug (inkl. Pitch): W treibt entlang der vollen 3D-
      // Kamerarichtung, S bremst/rückwärts, Leertaste = sanft steigen,
      // Shift = Boost. Trägheit je nach Tuning (Besen/Hippogreif/Thestral,
      // siehe flight.js) — ausgelagert, damit Besen UND Mounts denselben,
      // regressionssicher getesteten Code nutzen (Patronus-Lehre).
      updateFlight(this, dt, fwd, sprinting, keys.has('Space'), this.flightTuning || BROOM_FLIGHT);
    } else {
      let speed;
      if (this.riding) {
        speed = sprinting ? RIDE_SPRINT + this.mountSpeedBoost : RIDE_WALK;
      } else {
        speed = sprinting ? SPRINT : WALK;
      }
      if (this.swimming) speed *= 0.45;
      speed *= this.slowFactor;
      const targetVX = (dirX / dLen) * speed * (fwd || strafe ? 1 : 0);
      const targetVZ = (dirZ / dLen) * speed * (fwd || strafe ? 1 : 0);

      // sanfte Beschleunigung
      const accel = this.grounded || this.swimming ? 1 - Math.exp(-11 * dt) : 1 - Math.exp(-3.5 * dt);
      this.vel.x += (targetVX - this.vel.x) * accel;
      this.vel.z += (targetVZ - this.vel.z) * accel;

      // Springen / Schwerkraft
      if (this.swimming) {
        this.vel.y = 0;
      } else {
        if (keys.has('Space') && this.grounded) {
          this.vel.y = JUMP_V;
          this.grounded = false;
          if (this.onJump) this.onJump();
        }
        this.vel.y -= GRAVITY * dt;
      }
    }

    // Bewegung anwenden
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Weltgrenze (weiche Wand vor den Bergen)
    const d0 = Math.hypot(this.pos.x, this.pos.z);
    if (d0 > WORLD_BOUND) {
      const f = WORLD_BOUND / d0;
      this.pos.x *= f;
      this.pos.z *= f;
    }

    // Blocker (Wände, Türme, Bäume …)
    resolveBlockers(this.pos, RADIUS, this.pos.y);

    // Boden: Gelände oder Plattform
    const terr = terrainHeight(this.pos.x, this.pos.z);
    const plat = platformGround(this.pos.x, this.pos.z, this.pos.y);
    const ground = Math.max(terr, plat);

    // Schwimmen, wenn tiefes Wasser
    const deepWater = terr < WATER_LEVEL - 1.2 && plat === -Infinity;
    if (deepWater && this.pos.y < WATER_LEVEL - 0.9) {
      this.swimming = true;
      this.pos.y = WATER_LEVEL - 1.05 + Math.sin(performance.now() * 0.0021) * 0.07;
      this.grounded = true;
      // Schwimmen + Fliegen schließen sich aus — Wasser erzwingt den Abstieg.
      if (this.flying) { this.flying = false; this._noAscendT = 0; this.onLandFlight?.(); }
      // Schwimmen erzwingt auch das Absitzen vom Boden-Mount (S5-Plan-Vorgabe).
      if (this.riding) { this.riding = false; this.onDismount?.(); }
    } else {
      this.swimming = false;
      const wasAir = !this.grounded;
      if (this.pos.y <= ground + 0.001 && this.vel.y <= 0) {
        // Landen / auf Boden bleiben (sanftes Hochsteigen an Hängen)
        this.pos.y = ground;
        this.vel.y = 0;
        this.grounded = true;
        if (wasAir && this._fallSpeed > 6 && this.onLand) this.onLand();
      } else {
        this.grounded = false;
      }
      this._fallSpeed = -Math.min(0, this.vel.y);
    }

    // Flughöhen-Clamp — als Positions-Clamp UNBEDINGT am Ende der Bewegungs-
    // logik (Lehre 14/24), kein Zurücksteuern. Ausgelagert (flight.js).
    if (this.flying) {
      clampFlightHeight(this, terr, this.flightTuning || BROOM_FLIGHT);
    }

    // Kopfwippen + Schritt-Events
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && !this.swimming && hSpeed > 0.5) {
      this.bobPhase += hSpeed * dt * 1.55;
      this.bobAmount += (1 - this.bobAmount) * Math.min(1, 8 * dt);
      this.stepAccum += hSpeed * dt;
      const stride = sprinting ? 3.4 : 2.5;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        if (this.onStep) this.onStep(sprinting);
      }
    } else {
      this.bobAmount += (0 - this.bobAmount) * Math.min(1, 6 * dt);
    }
    const bobY = Math.sin(this.bobPhase * 2) * 0.05 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.03 * this.bobAmount;

    // Kamera
    this.camera.position.set(
      this.pos.x + cosY * bobX,
      this.pos.y + EYE + bobY,
      this.pos.z - sinY * bobX
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    // FOV-Kick beim Sprinten ODER schnellem Flug
    const speed3D = Math.hypot(this.vel.x, this.vel.y, this.vel.z);
    const flyKick = this.flying ? Math.min(6, (speed3D / (this.flightTuning || BROOM_FLIGHT).boost) * 6) : 0;
    const targetFov = this._baseFov + (sprinting && hSpeed > 7 ? 7 : 0) + flyKick;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();

    return { hSpeed, sprinting, speed3D };
  }
}
