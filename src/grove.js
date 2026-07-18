// Spinnennest-Hain im Ostwald (150,60): 8 dichte dunkle Bäume, 5 Spinnennetze
// (3 versperren die Lichtung, brennen einzeln per Incendio weg — nicht
// gespeichert, "die Spinnen weben nach"), Truhe mit Herz-Upgrade #2 (6→7).

import * as THREE from 'three';
import { terrainHeight, GROVE } from './terrain.js';
import { mulberry32 } from './noise.js';
import { addBoxBlocker, GeoBatch } from './geo.js';
import { makeWebTexture } from './textures.js';
import { getMaterials } from './materials.js';

const TREE_DARK = 0x0d1a0f;
const TREE_TRUNK = 0x2a1f18;

// 3 blockierende Netze (versperren die Zugänge zur Lichtung), 2 rein dekorativ
const BLOCKING_WEBS = [
  { x: GROVE.x - 9, z: GROVE.z - 2, ry: Math.PI / 2 },
  { x: GROVE.x + 4, z: GROVE.z - 9, ry: 0.5 },
  { x: GROVE.x + 5, z: GROVE.z + 8, ry: -0.6 },
];
const DECOR_WEBS = [
  { x: GROVE.x - 6, z: GROVE.z + 7, ry: 1.1 },
  { x: GROVE.x + 10, z: GROVE.z + 1, ry: -1.4 },
];

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export function buildGrove(scene, glowTex, hud, audio, fx, health) {
  const mats = getMaterials();
  const rng = mulberry32(151);

  // ---------- 8 dichte dunkle Bäume (eigener Mini-Batch, ringförmig um die Lichtung) ----------
  const b = new GeoBatch();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.3;
    const r = 11 + rng() * 4;
    const tx = GROVE.x + Math.cos(a) * r, tz = GROVE.z + Math.sin(a) * r;
    const ty = terrainHeight(tx, tz);
    const h = 7 + rng() * 3;
    const trunk = new THREE.CylinderGeometry(0.32, 0.42, h * 0.55, 6);
    trunk.translate(tx, ty + h * 0.275, tz);
    b.addRaw(trunk, TREE_TRUNK);
    for (let k = 0; k < 3; k++) {
      const cr = 2.4 - k * 0.55, ch = 2.6;
      const cone = new THREE.ConeGeometry(cr, ch, 7);
      cone.translate(tx, ty + h * 0.5 + k * 1.7, tz);
      b.addRaw(cone, TREE_DARK);
    }
    addBoxBlocker(tx - 0.4, tx + 0.4, ty, ty + h, tz - 0.4, tz + 0.4);
  }
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const treeMesh = b.build(treeMat, { castShadow: true, receiveShadow: false });
  if (treeMesh) scene.add(treeMesh);

  // ---------- Spinnennetze ----------
  const webTex = makeWebTexture();
  const webMat = new THREE.MeshBasicMaterial({
    map: webTex, transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  const nets = [];
  for (const spot of BLOCKING_WEBS) {
    const y = terrainHeight(spot.x, spot.z);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.4), webMat.clone());
    mesh.position.set(spot.x, y + 1.3, spot.z);
    mesh.rotation.y = spot.ry;
    scene.add(mesh);
    const blocker = addBoxBlocker(spot.x - 1.0, spot.x + 1.0, y, y + 2.4, spot.z - 0.18, spot.z + 0.18);
    nets.push({
      mesh, blocker, burning: false, burnT: -1,
      x: spot.x, y: y + 1.2, z: spot.z,
    });
  }
  for (const spot of DECOR_WEBS) {
    const y = terrainHeight(spot.x, spot.z);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.7), webMat.clone());
    mesh.position.set(spot.x, y + 1.1, spot.z);
    mesh.rotation.y = spot.ry;
    scene.add(mesh);
  }

  // ---------- Truhe auf der Lichtung (Troll-Truhen-Muster) ----------
  const cx = GROVE.x, cz = GROVE.z + 3;
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
    map: glowTex, color: 0xff5a6a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const chestGlow = new THREE.Sprite(chestGlowMat);
  chestGlow.scale.setScalar(0.1);
  chestGlow.position.set(0, 0.65, 0);
  chestGroup.add(chestGlow);
  scene.add(chestGroup);

  return {
    nets,
    chestOpened: false,
    chestOpenT: -1,
    chestCollected: false,
    onChestOpen: null,

    // Wird von main.js an spells.registerTarget() je Netz gehängt.
    burnNet(i) {
      const net = nets[i];
      if (!net || net.burning || net.blocker.disabled) return;
      net.burning = true;
      net.burnT = 0;
      fx.burst({ x: net.x, y: net.y, z: net.z }, 0xff9a3c, 14, 3, { gravity: -1.5, life: 0.6 });
    },

    update(dt, player) {
      for (const net of nets) {
        if (!net.burning) continue;
        net.burnT += dt;
        const f = clamp01(net.burnT / 1.5);
        net.mesh.material.color.setRGB(1, 1 - f * 0.7, 1 - f);
        net.mesh.material.opacity = 1 - f;
        if (net.burnT >= 1.5) {
          net.burning = false;
          net.blocker.disabled = true;
          net.mesh.visible = false;
        }
      }

      if (!this.chestOpened) {
        const dx = player.pos.x - chestGroup.position.x, dz = player.pos.z - chestGroup.position.z;
        if (dx * dx + dz * dz < 2.5 * 2.5) {
          this.chestOpened = true;
          this.chestOpenT = 0;
          audio.chime?.('fanfare');
          fx.burst(chestGroup.position, 0xff5a6a, 24, 4, { gravity: -1, life: 1.0 });
        }
      }
      if (this.chestOpenT >= 0) {
        this.chestOpenT += dt;
        const f = Math.min(1, this.chestOpenT / 1.0);
        chestLidPivot.rotation.x = -1.9 * f;
        chestGlow.scale.setScalar(0.1 + f * 1.1);
        chestGlowMat.opacity = f < 0.5 ? f * 1.6 : (1 - f) * 1.6;
        if (this.chestOpenT >= 1.0 && !this.chestCollected) {
          this.chestCollected = true;
          this.chestOpenT = -1;
          health.upgradeMaxHearts(7);
          hud.setHearts(health.hearts, health.maxHearts);
          hud.showToast('❤️ Herz-Upgrade! Maximale Herzen: 7', 4);
          this.onChestOpen?.();
        }
      }
    },

    // restore(): Netze sind bewusst NICHT gespeichert ("die Spinnen weben
    // nach") — nur die Truhe (dieselbe Logik wie Troll/Willow-Truhen).
    restore(chestCollected) {
      this.chestCollected = !!chestCollected;
      this.chestOpened = !!chestCollected;
      this.chestOpenT = -1;
      chestLidPivot.rotation.x = chestCollected ? -1.9 : 0;
      chestGlowMat.opacity = 0;
    },
  };
}
