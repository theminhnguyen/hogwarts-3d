// Rätsel-System: R1 Feuerprobe (Incendio) am Viadukt, R2 Schwebender Garten
// (Leviosa) im Nordgarten. Jedes Rätsel belohnt mit einer Truhe → Artefakt
// fliegt in einer Bogen-Animation zum Spieler. puzzles.js besitzt den
// kompletten Weltzustand (Flammen, Hecke, Grotten-Deckel) und kann ihn
// jederzeit synchron auf einen Zielzustand setzen (restore()) — für
// Save-Reload und den Reset-Button. R3/R4 + Finale folgen in Phase 6.

import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, platformGround } from './geo.js';
import { terrainHeight } from './terrain.js';
import { getMaterials } from './materials.js';

export const ARTIFACT_ORDER = ['flamme', 'krone', 'stein', 'karte'];
const ARTIFACT_NAMES = {
  flamme: 'Ewige Flamme', krone: 'Krone der Gründer',
  stein: 'Singender Stein', karte: 'Sternenkarte',
};

const GOLD = 0xd8b02f;
const HEDGE_GREEN = 0x3c5a2e;

// ---------- R1 · Feuerprobe (Incendio) — auf dem Viadukt ----------
const SIGN_R1 = { x: 0, z: 58 };
const FIREBOWLS = [
  { x: -2.8, z: 72 },
  { x: 2.8, z: 94 },
  { x: -2.8, z: 114 },
];
const FIRE_TIMER = 45;
// Kleine Nische neben dem mittleren Viadukt-Pfeiler (Schluchtboden, x>3 damit
// sie nicht mit dem Pfeiler-Blocker (x∈[-3,3]) kollidiert)
const GROTTO = { x: 8, z: 91, openDX: 2.3 };

// ---------- R2 · Schwebender Garten (Leviosa) — Nordgarten ----------
const SIGN_R2 = { x: 0, z: -54 };
const PLATES = [
  { x: -6, z: -60 },
  { x: 6, z: -60 },
];
const PLATE_RADIUS = 1.0;
// Schließt die Ost-Tasche der bestehenden Hecken-Reihe (castle.js, x∈[13,27],
// z∈[-58,-66]) an ihrer offenen Westseite — die Truhe steht dahinter.
const GATE = { x: 13, z: -62, halfW: 4, thick: 1, h: 2.2 };
const BED = { x: 20, z: -62 };

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function smooth(t) { const c = clamp01(t); return c * c * (3 - 2 * c); }

export class PuzzleSystem {
  constructor(scene, spells, fx, audio, hud, glowTex) {
    this.scene = scene;
    this.spells = spells;
    this.fx = fx;
    this.audio = audio;
    this.hud = hud;
    this.glowTex = glowTex;
    this.onArtifact = null; // main.js hängt hier den Toast+persist()-Callback ein

    this.artifacts = new Set();
    this.flying = []; // Artefakte, die gerade zum Spieler fliegen
    this.chests = []; // { group, lidPivot, glow, opened, openT }
    this._signSeen = { r1: false, r2: false };

    const mats = getMaterials();
    this.stoneMat = mats.stone;

    this._buildFireProbe();
    this._buildFloatingGarden();
  }

  // ================= R1 · Feuerprobe =================
  _buildFireProbe() {
    const batch = new GeoBatch();

    // Hinweis-Schild am Viaduktanfang (2 Pfosten + Planke)
    const sy = terrainHeight(SIGN_R1.x, SIGN_R1.z);
    batch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_R1.x - 0.4, sy + 0.8, SIGN_R1.z);
    batch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_R1.x + 0.4, sy + 0.8, SIGN_R1.z);
    batch.add(new THREE.BoxGeometry(1.3, 0.6, 0.06), 0x6d5236, SIGN_R1.x, sy + 1.5, SIGN_R1.z);

    // 3 Feuerschalen: Sockel + Kelch
    this.bowls = [];
    for (let i = 0; i < FIREBOWLS.length; i++) {
      const spot = FIREBOWLS[i];
      const p = platformGround(spot.x, spot.z, 10000);
      const y = (p === -Infinity ? terrainHeight(spot.x, spot.z) : p);
      batch.add(new THREE.CylinderGeometry(0.16, 0.22, 0.85, 8), 0x8b8578, spot.x, y + 0.425, spot.z);
      batch.add(new THREE.CylinderGeometry(0.32, 0.22, 0.22, 10), 0x6f6a61, spot.x, y + 0.94, spot.z);

      const flameMat = new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xff9a3c, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const flame = new THREE.Sprite(flameMat);
      flame.position.set(spot.x, y + 1.15, spot.z);
      flame.scale.set(2.2, 3.0, 1);
      flame.visible = false;
      flame.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(flame);

      const light = new THREE.PointLight(0xff9a3c, 0, 9, 2);
      light.position.set(spot.x, y + 1.2, spot.z);
      this.scene.add(light);

      this.bowls.push({ pos: { x: spot.x, z: spot.z, y }, flame, light, lit: false });
      this.spells.registerTarget({
        kind: 'brazier', radius: 0.85, accepts: ['incendio'],
        getPos: () => ({ x: spot.x, y: y + 1.1, z: spot.z }),
        onSpell: () => this._igniteBowl(i),
      });
    }

    // Grotte: 3 Wände (Rückwand + 2 Seiten), Öffnung nach Westen (-x)
    const gy = terrainHeight(GROTTO.x, GROTTO.z);
    const backX = GROTTO.x + 2.6;
    batch.add(new THREE.BoxGeometry(0.5, 2.4, 3.6), 0x776e60, backX, gy + 1.2, GROTTO.z);
    batch.add(new THREE.BoxGeometry(2.6, 2.4, 0.5), 0x776e60, GROTTO.x + 1.3, gy + 1.2, GROTTO.z - 1.6);
    batch.add(new THREE.BoxGeometry(2.6, 2.4, 0.5), 0x776e60, GROTTO.x + 1.3, gy + 1.2, GROTTO.z + 1.6);

    // Truhe (Körper Teil des statischen Batches, Deckel separat für Animation)
    const chestPos = { x: GROTTO.x + 1.6, y: gy, z: GROTTO.z };
    batch.add(new THREE.BoxGeometry(0.9, 0.55, 0.55), 0x6d5236, chestPos.x, gy + 0.275, chestPos.z);
    this.fireChest = this._makeChestLid(chestPos, gy);
    this.fireChest.group.visible = false;

    // Fackel in der Grotte
    const torchMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xff9a3c, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.grottoTorch = new THREE.Sprite(torchMat);
    this.grottoTorch.position.set(backX - 0.3, gy + 1.9, GROTTO.z);
    this.grottoTorch.scale.set(1.1, 1.5, 1);
    this.grottoTorch.visible = false;
    this.scene.add(this.grottoTorch);
    this.grottoLight = new THREE.PointLight(0xff9a3c, 0, 8, 2);
    this.grottoLight.position.copy(this.grottoTorch.position);
    this.scene.add(this.grottoLight);

    // Schiebe-Deckel vor der Öffnung (blockiert Zugang UND Sicht)
    const slabGeo = new THREE.BoxGeometry(0.5, 2.4, 3.6);
    this.fireSlab = new THREE.Mesh(slabGeo, this.stoneMat);
    this.fireSlab.castShadow = true; this.fireSlab.receiveShadow = true;
    this._slabClosedX = GROTTO.x;
    this._slabOpenX = GROTTO.x - GROTTO.openDX;
    this.fireSlab.position.set(this._slabClosedX, gy + 1.2, GROTTO.z);
    this.scene.add(this.fireSlab);
    this.fireSlabBlocker = addBoxBlocker(
      this._slabClosedX - 0.25, this._slabClosedX + 0.25, gy, gy + 2.4, GROTTO.z - 1.8, GROTTO.z + 1.8
    );

    this._fireBatchMesh = batch.build(this.stoneMat);
    if (this._fireBatchMesh) this.scene.add(this._fireBatchMesh);

    this.fireActive = false;
    this.fireTimer = 0;
    this.fireDone = false;
    this.slabAnimT = -1; // -1 = keine Animation aktiv
  }

  _igniteBowl(i) {
    const bowl = this.bowls[i];
    if (!bowl || bowl.lit || this.fireDone) return;
    bowl.lit = true;
    bowl.flame.visible = true;
    bowl.light.intensity = 12;
    if (!this.fireActive) { this.fireActive = true; this.fireTimer = FIRE_TIMER; }
    const litCount = this.bowls.filter(b => b.lit).length;
    if (litCount === this.bowls.length) {
      this._solveFire();
    } else {
      this.hud.setPuzzleStatus(`🔥 ${litCount}/${this.bowls.length} — ${Math.ceil(this.fireTimer)}s`);
    }
  }

  _extinguishAll() {
    for (const b of this.bowls) { b.lit = false; b.flame.visible = false; b.light.intensity = 0; }
    this.fireActive = false;
    this.hud.setPuzzleStatus(null);
    this.fx.burst({ x: FIREBOWLS[0].x, y: 20, z: FIREBOWLS[0].z }, 0xbfe4ff, 6, 2, { life: 0.4 });
  }

  _solveFire() {
    this.fireActive = false;
    this.fireDone = true;
    this.hud.setPuzzleStatus(null);
    this.slabAnimT = 0;
    this.audio.puzzleRumble(2);
    this.grottoTorch.visible = true;
    this.grottoLight.intensity = 10;
  }

  _updateFireProbe(dt) {
    // Flammen-Flacker (gleiche Formel wie props.js/LifeSystem, ×2 Scale)
    const t = performance.now() * 0.001;
    for (const b of this.bowls) {
      if (!b.lit) continue;
      const flick = 0.85 + Math.sin(t * 11 + b.pos.x) * 0.1 + Math.sin(t * 23 + b.pos.z) * 0.06;
      b.flame.scale.set(2.0 * flick, 2.9 * flick, 1);
      b.light.intensity = 12 * flick;
    }
    if (this.grottoTorch.visible) {
      const flick = 0.85 + Math.sin(t * 11 + 1.7) * 0.1 + Math.sin(t * 23 + 3.1) * 0.06;
      this.grottoTorch.scale.set(1.0 * flick, 1.45 * flick, 1);
      this.grottoLight.intensity = 10 * flick;
    }

    if (this.fireActive) {
      this.fireTimer -= dt;
      const litCount = this.bowls.filter(b => b.lit).length;
      if (this.fireTimer <= 0) {
        this._extinguishAll();
      } else {
        this.hud.setPuzzleStatus(`🔥 ${litCount}/${this.bowls.length} — ${Math.ceil(this.fireTimer)}s`);
      }
    }

    if (this.slabAnimT >= 0) {
      this.slabAnimT += dt / 2; // 2s Animation
      const f = smooth(Math.min(1, this.slabAnimT));
      this.fireSlab.position.x = lerp(this._slabClosedX, this._slabOpenX, f);
      if (this.slabAnimT >= 1) {
        this.slabAnimT = -1;
        this.fireSlabBlocker.disabled = true;
        this.fireChest.group.visible = true;
        this._openChest(this.fireChest, 'flamme');
      }
    }
  }

  // ================= R2 · Schwebender Garten =================
  _buildFloatingGarden() {
    const batch = new GeoBatch();

    const sy = terrainHeight(SIGN_R2.x, SIGN_R2.z);
    batch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_R2.x - 0.4, sy + 0.8, SIGN_R2.z);
    batch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_R2.x + 0.4, sy + 0.8, SIGN_R2.z);
    batch.add(new THREE.BoxGeometry(1.3, 0.6, 0.06), 0x6d5236, SIGN_R2.x, sy + 1.5, SIGN_R2.z);

    // 2 Druckplatten
    this.plates = [];
    for (const spot of PLATES) {
      const y = terrainHeight(spot.x, spot.z);
      batch.add(new THREE.CylinderGeometry(1.1, 1.15, 0.16, 14), 0x8b8578, spot.x, y + 0.08, spot.z);
      const glowMat = new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xb08cff, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(1.9, 1.9, 1);
      glow.position.set(spot.x, y + 0.18, spot.z);
      this.scene.add(glow);
      const light = new THREE.PointLight(0xb08cff, 0, 5, 2);
      light.position.set(spot.x, y + 0.5, spot.z);
      this.scene.add(light);
      this.plates.push({ x: spot.x, z: spot.z, y, glow, light, active: false });
    }

    // Truhe im versteckten Beet
    const by = terrainHeight(BED.x, BED.z);
    this._bedY = by;
    batch.add(new THREE.BoxGeometry(0.9, 0.55, 0.55), 0x6d5236, BED.x, by + 0.275, BED.z);
    this.gardenChest = this._makeChestLid({ x: BED.x, y: by, z: BED.z }, by);
    this.gardenChest.group.visible = false;
    // Ein paar sanft schwebende Glitzer-Motten als "Glühwürmchen"-Ersatz (ganztägig)
    this.bedMotes = [];
    const moteMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: 0xd9c4ff, transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Sprite(moteMat.clone());
      m.scale.setScalar(0.18);
      m.userData.phase = Math.random() * Math.PI * 2;
      m.userData.r = 0.6 + Math.random() * 0.8;
      m.visible = false;
      this.scene.add(m);
      this.bedMotes.push(m);
    }

    // Mittlere Hecke: schließt die Westseite der bestehenden rechten
    // Hecken-Tasche (castle.js Nordgarten, x∈[13,27], z∈[-58,-66])
    const gy = terrainHeight(GATE.x, GATE.z);
    const hedgeGeo = new THREE.BoxGeometry(GATE.thick, GATE.h, GATE.halfW * 2);
    const hedgeMat = new THREE.MeshLambertMaterial({ color: HEDGE_GREEN, flatShading: true });
    this.hedge = new THREE.Mesh(hedgeGeo, hedgeMat);
    this.hedge.castShadow = true; this.hedge.receiveShadow = true;
    this._hedgeBaseY = gy;
    this._hedgeH = GATE.h;
    this.hedge.position.set(GATE.x, gy + GATE.h / 2, GATE.z);
    this.scene.add(this.hedge);
    this.hedgeBlocker = addBoxBlocker(
      GATE.x - GATE.thick / 2, GATE.x + GATE.thick / 2, gy, gy + GATE.h,
      GATE.z - GATE.halfW, GATE.z + GATE.halfW
    );

    this._gardenBatchMesh = batch.build(this.stoneMat);
    if (this._gardenBatchMesh) this.scene.add(this._gardenBatchMesh);

    this.gardenDone = false;
    this.hedgeAnimT = -1;
  }

  _updateFloatingGarden(dt) {
    if (!this.gardenDone) {
      let filled = 0;
      for (const plate of this.plates) {
        let onPlate = false;
        for (const obj of this.spells.leviosaObjects) {
          if (obj === this.spells.leviosaHeld || obj.falling) continue;
          const dx = obj.pos.x - plate.x, dz = obj.pos.z - plate.z;
          if (dx * dx + dz * dz < PLATE_RADIUS * PLATE_RADIUS) { onPlate = true; break; }
        }
        if (onPlate && !plate.active) {
          plate.active = true;
          plate.glow.material.opacity = 0.85;
          plate.light.intensity = 4;
          this.audio.puzzleClonk();
        } else if (!onPlate && plate.active) {
          plate.active = false;
          plate.glow.material.opacity = 0.15;
          plate.light.intensity = 0;
        }
        if (onPlate) filled++;
      }
      if (filled === this.plates.length) this._solveGarden();
    }

    if (this.hedgeAnimT >= 0) {
      this.hedgeAnimT += dt / 1.5; // 1.5s Animation
      const f = smooth(Math.min(1, this.hedgeAnimT));
      const scaleY = lerp(1, 0.05, f);
      this.hedge.scale.y = scaleY;
      this.hedge.position.y = this._hedgeBaseY + (this._hedgeH * scaleY) / 2;
      if (this.hedgeAnimT >= 1) {
        this.hedgeAnimT = -1;
        this.hedgeBlocker.disabled = true;
        this.gardenChest.group.visible = true;
        for (const m of this.bedMotes) m.visible = true;
        this._openChest(this.gardenChest, 'krone');
      }
    }

    if (this.bedMotes[0]?.visible) {
      const t = performance.now() * 0.001;
      for (const m of this.bedMotes) {
        const p = m.userData.phase, r = m.userData.r;
        m.position.set(
          BED.x + Math.cos(t * 0.6 + p) * r,
          this._bedY + 0.5 + Math.sin(t * 0.9 + p * 1.7) * 0.3,
          BED.z + Math.sin(t * 0.5 + p) * r
        );
      }
    }
  }

  _solveGarden() {
    this.gardenDone = true;
    this.hud.showToast('Die Erde weicht zurück … 🪨', 2.5);
    this.hedgeAnimT = 0;
    this.audio.puzzleRumble(1.5);
  }

  // ================= Gemeinsam: Truhe & Artefakt =================
  _makeChestLid(pos, groundY) {
    const mats = getMaterials();
    const group = new THREE.Group();
    group.position.set(pos.x, groundY, pos.z);
    this.scene.add(group);

    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.55, -0.27);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.22, 0.58), mats.wood);
    lid.position.set(0, 0.11, 0.27);
    lid.castShadow = true;
    lidPivot.add(lid);
    group.add(lidPivot);

    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: GOLD, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.1);
    glow.position.set(0, 0.65, 0);
    group.add(glow);

    const chest = { group, lidPivot, glow, opened: false, openT: -1 };
    this.chests.push(chest);
    return chest;
  }

  _openChest(chest, artifactId) {
    if (chest.opened) return;
    chest.opened = true;
    chest.openT = 0;
    this.audio.chime('fanfare');
    const wp = new THREE.Vector3();
    chest.group.getWorldPosition(wp);
    wp.y += 0.55;
    this.fx.burst(wp, GOLD, 26, 4, { gravity: -1, life: 1.0 });
    this._spawnArtifact(wp, artifactId);
  }

  _spawnArtifact(fromPos, id) {
    const mat = new THREE.SpriteMaterial({
      map: this.glowTex, color: GOLD, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.55);
    sprite.position.copy(fromPos);
    this.scene.add(sprite);
    this.flying.push({ sprite, from: fromPos.clone(), t: 0, id });
  }

  _updateFlying(dt, player) {
    if (this.flying.length === 0 || !player) return;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt / 0.8;
      if (f.t >= 1) {
        this.scene.remove(f.sprite);
        this.artifacts.add(f.id);
        this.hud.setArtifacts(this.artifacts.size, ARTIFACT_ORDER.length);
        this.onArtifact?.(f.id, ARTIFACT_NAMES[f.id] || f.id, this.artifacts.size, ARTIFACT_ORDER.length);
        this.flying.splice(i, 1);
        continue;
      }
      const target = { x: player.pos.x, y: player.pos.y + 1.5, z: player.pos.z };
      const arc = Math.sin(f.t * Math.PI) * 2.2;
      sprite_pos(f.sprite, f.from, target, f.t, arc);
    }
  }

  // ================= Öffentliche API =================
  update(dt, player, skyState) {
    this._updateFireProbe(dt);
    this._updateFloatingGarden(dt);
    this._updateFlying(dt, player);
    this._updateChestLids(dt);
    this._updateSigns(player);
  }

  _updateChestLids(dt) {
    for (const c of this.chests) {
      if (c.openT < 0) continue;
      c.openT += dt / 1.0;
      const f = smooth(Math.min(1, c.openT));
      c.lidPivot.rotation.x = -1.9 * f;
      c.glow.scale.setScalar(0.1 + f * 1.1);
      c.glow.material.opacity = f < 0.5 ? f * 1.6 : (1 - f) * 1.6;
      if (c.openT >= 1) c.openT = -1;
    }
  }

  _updateSigns(player) {
    if (!player) return;
    if (!this._signSeen.r1) {
      const dx = player.pos.x - SIGN_R1.x, dz = player.pos.z - SIGN_R1.z;
      if (dx * dx + dz * dz < 25) {
        this._signSeen.r1 = true;
        this.hud.showToast('„Drei Wächterinnen aus Stein frieren. Wärme sie schnell — sie sind ungeduldig.“', 4.5);
      }
    }
    if (!this._signSeen.r2) {
      const dx = player.pos.x - SIGN_R2.x, dz = player.pos.z - SIGN_R2.z;
      if (dx * dx + dz * dz < 25) {
        this._signSeen.r2 = true;
        this.hud.showToast('„Was der Erde zu schwer, hebt der Wille empor. Zwei Wächter, zwei Betten.“', 4.5);
      }
    }
  }

  get artifactCount() { return this.artifacts.size; }

  // Setzt den kompletten Rätsel-Weltzustand SOFORT (ohne Animation/Sound) —
  // für Save-Reload und den Reset-Button (pz={} → alles auf Anfang).
  restore(pz = {}, artifactIds = []) {
    this.artifacts = new Set(artifactIds);
    this.hud.setArtifacts(this.artifacts.size, ARTIFACT_ORDER.length);
    this.hud.setPuzzleStatus(null);

    // R1
    this.fireActive = false;
    this.fireTimer = 0;
    this.fireDone = !!pz.feuer;
    for (const b of this.bowls) {
      b.lit = this.fireDone;
      b.flame.visible = this.fireDone;
      b.light.intensity = this.fireDone ? 12 : 0;
    }
    this.slabAnimT = -1;
    this.fireSlab.position.x = this.fireDone ? this._slabOpenX : this._slabClosedX;
    this.fireSlabBlocker.disabled = this.fireDone;
    this.fireChest.group.visible = this.fireDone;
    this.grottoTorch.visible = this.fireDone;
    this.grottoLight.intensity = this.fireDone ? 10 : 0;
    this._setChestInstant(this.fireChest, this.fireDone);

    // R2
    this.gardenDone = !!pz.garten;
    this.hedgeAnimT = -1;
    const f = this.gardenDone ? 0.05 : 1;
    this.hedge.scale.y = f;
    this.hedge.position.y = this._hedgeBaseY + (this._hedgeH * f) / 2;
    this.hedgeBlocker.disabled = this.gardenDone;
    this.gardenChest.group.visible = this.gardenDone;
    for (const m of this.bedMotes) m.visible = this.gardenDone;
    for (const plate of this.plates) {
      plate.active = false;
      plate.glow.material.opacity = 0.15;
      plate.light.intensity = 0;
    }
    this._setChestInstant(this.gardenChest, this.gardenDone);

    // Fliegende Artefakte abbrechen (z.B. mitten im Reset)
    for (const f2 of this.flying) this.scene.remove(f2.sprite);
    this.flying.length = 0;
  }

  _setChestInstant(chest, open) {
    chest.opened = open;
    chest.openT = -1;
    chest.lidPivot.rotation.x = open ? -1.9 : 0;
    chest.glow.material.opacity = 0;
    chest.glow.scale.setScalar(0.1);
  }

  save() {
    return {
      art: [...this.artifacts],
      pz: { feuer: this.fireDone ? 1 : 0, garten: this.gardenDone ? 1 : 0 },
    };
  }
}

// Kleine freie Hilfsfunktion: setzt sprite.position entlang einer Bogenkurve
// von `from` zu `to` (t 0..1, arc = Zusatzhöhe am Scheitelpunkt)
function sprite_pos(sprite, from, to, t, arc) {
  sprite.position.set(
    lerp(from.x, to.x, t),
    lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * arc,
    lerp(from.z, to.z, t)
  );
}
