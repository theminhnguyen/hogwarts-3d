// Peitschende Weide: unzerstörbare Umwelt-Gefahr auf dem Hügel bei (60, −150).
// FSM idle → telegraph (Äste heben sich, Knarz-Sound) → swing (schneller
// Rundschlag, Kontakt-Schaden im Radius) → cooldown (Äste schwingen zurück).
// Lehre 5 (FSM-Sackgassen-Falle, aus Geist-Phase3/Troll-Bonus bekannt): der
// Rückschwung MUSS während "cooldown" weiterlaufen — kein blindes
// `if (state === 'cooldown') return;` am Anfang von update().
// Truhe dahinter (einmaliger Herz-Refill + Funken-Konfetti) folgt dem
// Troll-Truhen-Muster aus creatures.js (chest = {group, lidPivot, glow,
// openT, collected}).

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { addCircleBlocker } from './geo.js';
import { getMaterials } from './materials.js';

const WEIDE = { x: 60, z: -150 };
const CHEST_OFFSET = { x: 0, z: -9 };

const TUNING = {
  aggroRange: 7, telegraphDur: 1.0, swingDur: 0.8, cooldownDur: 3.0,
  hitRange: 5, dmg: 0.5, knockback: 6,
  restAngle: 2.35, raisedAngle: 0.35,
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function buildWillow(scene, glowTex, audio, fx, health) {
  const mats = getMaterials();
  const x = WEIDE.x, z = WEIDE.z;
  const y = terrainHeight(x, z);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);

  // Knorriger Stamm (Zylinder mit Vertex-Jitter für unregelmäßige Silhouette)
  const trunkGeo = new THREE.CylinderGeometry(1.15, 1.6, 6, 9, 4);
  const pa = trunkGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    pa.setX(i, pa.getX(i) + Math.sin(i * 12.9898) * 0.15);
    pa.setZ(i, pa.getZ(i) + Math.sin(i * 78.233) * 0.15);
  }
  pa.needsUpdate = true;
  trunkGeo.computeVertexNormals();
  const trunk = new THREE.Mesh(trunkGeo, mats.wood);
  trunk.position.y = 3;
  trunk.castShadow = true;
  group.add(trunk);
  addCircleBlocker(x, z, 1.7, y, y + 6);

  // Grobe Krone
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.7, 8, 6), mats.roof);
  crown.position.y = 6.6;
  crown.scale.y = 0.7;
  group.add(crown);

  // 6 Ast-Ketten (je 3 Segmente, Group-Hierarchie für den Rundschlag)
  const branches = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const root = new THREE.Group();
    root.position.set(Math.cos(a) * 1.1, 4.6, Math.sin(a) * 1.1);
    root.rotation.y = a;
    group.add(root);
    let parent = root;
    let prevLen = 0;
    let segLen = 2.0;
    for (let s = 0; s < 3; s++) {
      const seg = new THREE.Group();
      seg.position.y = prevLen;
      parent.add(seg);
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24 - s * 0.06, 0.3 - s * 0.06, segLen, 6),
        mats.wood
      );
      mesh.position.y = segLen / 2;
      mesh.castShadow = true;
      seg.add(mesh);
      parent = seg;
      prevLen = segLen;
      segLen *= 0.72;
    }
    branches.push({ root, phase: a });
  }

  // Truhe hinter der Weide (Troll-Truhen-Muster, lokal nachgebaut)
  const cx = x + CHEST_OFFSET.x, cz = z + CHEST_OFFSET.z;
  const cy = terrainHeight(cx, cz);
  const chestGroup = new THREE.Group();
  chestGroup.position.set(cx, cy, cz);
  const chestBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), mats.wood);
  chestBody.position.y = 0.275;
  chestBody.castShadow = true;
  chestGroup.add(chestBody);
  const chestLidPivot = new THREE.Group();
  chestLidPivot.position.set(0, 0.55, -0.27);
  const chestLid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.22, 0.58), mats.wood);
  chestLid.position.set(0, 0.11, 0.27);
  chestLidPivot.add(chestLid);
  chestGroup.add(chestLidPivot);
  const chestGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffd54a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const chestGlow = new THREE.Sprite(chestGlowMat);
  chestGlow.scale.setScalar(0.1);
  chestGlow.position.set(0, 0.65, 0);
  chestGroup.add(chestGlow);
  scene.add(chestGroup);

  return {
    state: 'idle',
    stateT: 0,
    time: 0,
    angle: TUNING.restAngle,
    hitApplied: false,
    chestOpened: false,
    chestOpenT: -1,
    peaceful: false,
    onChestOpen: null,

    restore(chestOpened) {
      this.chestOpened = !!chestOpened;
      if (this.chestOpened) {
        chestLidPivot.rotation.x = -1.9;
        chestGlowMat.opacity = 0;
      }
    },

    _openChest() {
      this.chestOpened = true;
      this.chestOpenT = 0;
      health.hearts = health.maxHearts;
      const wp = new THREE.Vector3();
      chestGroup.getWorldPosition(wp);
      wp.y += 0.5;
      fx.burst(wp, 0xffd54a, 50, 7, { gravity: -3, life: 1.1, size: 0.35 });
      audio.chime('fanfare');
      this.onChestOpen?.();
    },

    update(dt, player) {
      this.time += dt;
      const dx = player.pos.x - x, dz = player.pos.z - z;
      const dist = Math.hypot(dx, dz);
      let target = TUNING.restAngle;

      switch (this.state) {
        case 'idle': {
          target = TUNING.restAngle + Math.sin(this.time * 0.6) * 0.05;
          if (dist < TUNING.aggroRange) {
            this.state = 'telegraph';
            this.stateT = 0;
            audio.willowCreak?.();
          }
          break;
        }
        case 'telegraph': {
          this.stateT += dt;
          const f = clamp01(this.stateT / TUNING.telegraphDur);
          target = TUNING.restAngle + (TUNING.raisedAngle - TUNING.restAngle) * f;
          if (this.stateT >= TUNING.telegraphDur) {
            this.state = 'swing';
            this.stateT = 0;
            this.hitApplied = false;
            audio.willowSwing?.();
          }
          break;
        }
        case 'swing': {
          this.stateT += dt;
          const f = this.stateT / TUNING.swingDur;
          target = TUNING.raisedAngle + Math.sin(f * Math.PI * 6) * 0.9;
          if (!this.hitApplied && dist < TUNING.hitRange) {
            if (!this.peaceful) {
              const d = dist || 1;
              const dirX = dx / d, dirZ = dz / d;
              health.damage(TUNING.dmg, { x: dirX, y: 0, z: dirZ });
              fx.shake(0.3);
            }
            this.hitApplied = true;
          }
          if (this.stateT >= TUNING.swingDur) {
            this.state = 'cooldown';
            this.stateT = 0;
          }
          break;
        }
        case 'cooldown': {
          // Lehre 5: läuft IMMER weiter (kein früher Return) — der Rückschwung
          // von "raised" zurück zu "rest" muss über die volle Cooldown-Dauer
          // animiert werden, auch wenn hier keine Schadenslogik mehr steckt.
          this.stateT += dt;
          const f = clamp01(this.stateT / TUNING.cooldownDur);
          target = TUNING.raisedAngle + (TUNING.restAngle - TUNING.raisedAngle) * f
            + Math.sin(f * Math.PI * 3) * 0.15 * (1 - f);
          if (this.stateT >= TUNING.cooldownDur) {
            this.state = 'idle';
            this.stateT = 0;
          }
          break;
        }
      }

      this.angle += (target - this.angle) * Math.min(1, dt * 8);
      for (const b of branches) {
        b.root.rotation.x = this.angle + Math.sin(this.time * 1.4 + b.phase) * 0.03;
      }

      // Truhe: öffnen bei Annäherung, danach Deckel-Animation
      if (!this.chestOpened) {
        const cdx = player.pos.x - cx, cdz = player.pos.z - cz;
        if (Math.hypot(cdx, cdz) < 1.3) this._openChest();
      }
      if (this.chestOpenT >= 0) {
        this.chestOpenT += dt / 1.0;
        const f = clamp01(this.chestOpenT);
        chestLidPivot.rotation.x = -1.9 * f;
        chestGlow.scale.setScalar(0.1 + f * 1.1);
        chestGlowMat.opacity = f < 0.5 ? f * 1.6 : (1 - f) * 1.6;
        if (this.chestOpenT >= 1) this.chestOpenT = -1;
      }
    },
  };
}
