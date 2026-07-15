// Nebelmoor: totes Land nordöstlich des Steinkreises — kahle Bäume, Gräber,
// driftender Bodennebel, eine verschlossene Krypta. Reine Zonen-Deko
// (Phase N1). Dementoren folgen in N2, Seelenlichter + Laterne in N4 (die
// Krypta-Tür/Fackel/Truhe-Anker sind hier bereits vorbereitet, damit N4 nur
// noch die Öffnen-Animation ergänzen muss, statt die Geometrie umzubauen).

import * as THREE from 'three';
import { GeoBatch, addCircleBlocker, addBoxBlocker } from './geo.js';
import { terrainHeight, MOOR } from './terrain.js';
import { smoothstep, mulberry32 } from './noise.js';
import { getMaterials } from './materials.js';
import { makeCloudTexture } from './textures.js';

const SIGN_POS = { x: 195, z: -143 }; // am Wegknick, knapp am Moor-Kernrand
const CRYPT = { x: MOOR.x, z: MOOR.z };
const TREE_COUNT = 40;
const GRAVE_COUNT = 14;
const FOG_COUNT = 12;

function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

// Eigenständige Kopie der kleinen Jitter-Hilfsfunktion aus props.js (dort
// nicht exportiert) — verzerrt Vertices zufällig für organische Formen.
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

export function buildMoor(scene, glowTex, hud) {
  const mats = getMaterials();
  const rng = mulberry32(9001);
  const stoneBatch = new GeoBatch();
  const treeBatch = new GeoBatch();

  // ---------- Kahle Bäume ----------
  let treeTries = 0, treeCount = 0;
  while (treeCount < TREE_COUNT && treeTries < 4000) {
    treeTries++;
    const a = rng() * Math.PI * 2;
    const r = 12 + rng() * (MOOR.r - 10);
    const x = MOOR.x + Math.cos(a) * r, z = MOOR.z + Math.sin(a) * r;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.z) < 10) continue; // Krypta-Vorplatz frei
    const y = terrainHeight(x, z);
    const seed = 2000 + treeCount * 7;
    const trunkH = 3.5 + mulberry32(seed)() * 2.2;
    const trunk = new THREE.CylinderGeometry(0.12, 0.3, trunkH, 6);
    trunk.translate(0, trunkH / 2, 0);
    jitter(trunk, 0.08, seed);
    trunk.translate(x, y, z);
    treeBatch.addRaw(trunk, 0x3a3630);
    const branchN = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < branchN; i++) {
      const bh = 0.8 + rng() * 1.0;
      const branch = new THREE.CylinderGeometry(0.02, 0.06, bh, 4);
      branch.translate(0, bh / 2, 0);
      branch.rotateX(0.6 + rng() * 0.6);
      branch.rotateY(rng() * Math.PI * 2);
      branch.translate(0, trunkH * (0.45 + rng() * 0.35), 0);
      jitter(branch, 0.03, seed + i * 13 + 1);
      branch.translate(x, y, z);
      treeBatch.addRaw(branch, 0x312d28);
    }
    addCircleBlocker(x, z, 0.35, y - 1, y + 3);
    treeCount++;
  }

  // ---------- Gräber ----------
  let graveTries = 0, graveCount = 0;
  while (graveCount < GRAVE_COUNT && graveTries < 2000) {
    graveTries++;
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * (MOOR.r - 16);
    const x = MOOR.x + Math.cos(a) * r, z = MOOR.z + Math.sin(a) * r;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.z) < 10) continue;
    const y = terrainHeight(x, z);
    const grave = new THREE.BoxGeometry(0.7, 1.1, 0.15);
    grave.rotateZ((rng() - 0.5) * 0.5);
    grave.rotateX(0.08 + rng() * 0.1); // leicht nach vorn gekippt
    grave.rotateY(rng() * Math.PI * 2);
    grave.translate(x, y + 0.35 - 0.2, z); // halb eingesunken
    stoneBatch.addRaw(grave, 0x6e6a60);
    addCircleBlocker(x, z, 0.4, y - 1, y + 1.2);
    graveCount++;
  }

  // ---------- Warnschild am Moor-Eingang ----------
  const signY = terrainHeight(SIGN_POS.x, SIGN_POS.z);
  stoneBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_POS.x - 0.4, signY + 0.8, SIGN_POS.z);
  stoneBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_POS.x + 0.4, signY + 0.8, SIGN_POS.z);
  stoneBatch.add(new THREE.BoxGeometry(1.3, 0.6, 0.06), 0x6d5236, SIGN_POS.x, signY + 1.5, SIGN_POS.z);

  // ---------- Krypta: Nische (Rückwand + 2 Seiten), Eingang nach Westen ----------
  // Bewährtes Grotten-Muster aus puzzles.js (R1 Feuerprobe), nur größer.
  const cy = terrainHeight(CRYPT.x, CRYPT.z);
  const backX = CRYPT.x + 4.5;
  stoneBatch.add(new THREE.BoxGeometry(0.7, 3.4, 5.6), 0x5c574e, backX, cy + 1.7, CRYPT.z);
  stoneBatch.add(new THREE.BoxGeometry(4.5, 3.4, 0.7), 0x5c574e, CRYPT.x + 2.25, cy + 1.7, CRYPT.z - 2.6);
  stoneBatch.add(new THREE.BoxGeometry(4.5, 3.4, 0.7), 0x5c574e, CRYPT.x + 2.25, cy + 1.7, CRYPT.z + 2.6);
  for (const oz of [-2.0, 2.0]) {
    const col = new THREE.CylinderGeometry(0.3, 0.36, 3.0, 7);
    col.translate(0, 1.5, 0);
    jitter(col, 0.04, 4001 + oz * 3);
    col.translate(CRYPT.x - 1.6, cy, CRYPT.z + oz);
    stoneBatch.addRaw(col, 0x6e6a60);
  }
  addBoxBlocker(backX - 0.35, backX + 0.35, cy, cy + 3.4, CRYPT.z - 2.8, CRYPT.z + 2.8);
  addBoxBlocker(CRYPT.x - 0.5, CRYPT.x + 4.5 + 0.35, cy, cy + 3.4, CRYPT.z - 2.95, CRYPT.z - 2.25);
  addBoxBlocker(CRYPT.x - 0.5, CRYPT.x + 4.5 + 0.35, cy, cy + 3.4, CRYPT.z + 2.25, CRYPT.z + 2.95);

  // Verschlossene Torplatte — öffnet erst in Phase N4 (5/5 Seelenlichter).
  // Referenzen bleiben am zurückgegebenen Objekt, damit N4 nur noch die
  // Slide-Animation ergänzen muss.
  const slabGeo = new THREE.BoxGeometry(0.6, 3.4, 5.6);
  const doorMesh = new THREE.Mesh(slabGeo, mats.stone);
  doorMesh.castShadow = true; doorMesh.receiveShadow = true;
  const doorClosedX = CRYPT.x;
  const doorOpenX = CRYPT.x - 3.4;
  doorMesh.position.set(doorClosedX, cy + 1.7, CRYPT.z);
  scene.add(doorMesh);
  const doorBlocker = addBoxBlocker(
    doorClosedX - 0.35, doorClosedX + 0.35, cy, cy + 3.4, CRYPT.z - 2.8, CRYPT.z + 2.8
  );

  // Fackel im Inneren — bleibt aus, bis N4 die Tür öffnet.
  const torchMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const torch = new THREE.Sprite(torchMat);
  torch.position.set(backX - 0.6, cy + 2.3, CRYPT.z);
  torch.scale.set(1.1, 1.5, 1);
  torch.visible = false;
  scene.add(torch);
  const torchLight = new THREE.PointLight(0xff9a3c, 0, 9, 2);
  torchLight.position.copy(torch.position);
  scene.add(torchLight);

  // ---------- Bodennebel (driftet langsam im Kreis ums Moor-Zentrum) ----------
  const fogTexes = [makeCloudTexture(21), makeCloudTexture(22), makeCloudTexture(23)];
  const fogSprites = [];
  for (let i = 0; i < FOG_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fogTexes[i % 3], color: 0x9aa4b0, transparent: true, opacity: 0.22,
      depthWrite: false, fog: false,
    });
    const s = new THREE.Sprite(mat);
    const scale = 40 + rng() * 30;
    s.scale.set(scale, 12, 1);
    const angle = rng() * Math.PI * 2;
    const radius = 15 + rng() * (MOOR.r - 15);
    const x = MOOR.x + Math.cos(angle) * radius, z = MOOR.z + Math.sin(angle) * radius;
    s.position.set(x, terrainHeight(x, z) + 2, z);
    s.userData = { angle, radius, speed: (rng() < 0.5 ? -1 : 1) * (0.02 + rng() * 0.03), baseOpacity: 0.22 };
    scene.add(s);
    fogSprites.push(s);
  }

  const meshes = [stoneBatch.build(mats.stone), treeBatch.build(mats.deco)];
  for (const m of meshes) if (m) scene.add(m);

  // WICHTIG: kein `{...state, methoden}`-Spread hier — das würde signSeen/
  // fogOpacityMul (Primitiven) beim Rückgabe-Zeitpunkt einfrieren, und
  // spätere externe Zugriffe (z.B. `moor.fogOpacityMul = 0.6` aus Phase N4,
  // oder `moor.signSeen` in Tests) würden ins Leere laufen, weil update()
  // dann eine ANDERE Kopie mutiert als die extern sichtbare. Stattdessen:
  // EIN Objekt, das seine eigenen Felder über `this` liest/schreibt.
  const moor = {
    signSeen: false,
    fogOpacityMul: 1, // N4 setzt dies auf 0.6, sobald die Laterne geborgen ist
    door: { mesh: doorMesh, blocker: doorBlocker, closedX: doorClosedX, openX: doorOpenX },
    torch, torchLight,

    // 0 außerhalb, 1 tief im Kern — main.js blendet damit die --moor-Vignette
    insideFactor(pos) {
      const d = Math.hypot(pos.x - MOOR.x, pos.z - MOOR.z);
      return clamp01(1 - smoothstep(MOOR.r * 0.5, MOOR.r + MOOR.blend, d));
    },
    update(dt, player) {
      for (const s of fogSprites) {
        const u = s.userData;
        u.angle += u.speed * dt;
        s.position.x = MOOR.x + Math.cos(u.angle) * u.radius;
        s.position.z = MOOR.z + Math.sin(u.angle) * u.radius;
        s.material.opacity = u.baseOpacity * this.fogOpacityMul;
      }
      if (!this.signSeen && player) {
        const dx = player.pos.x - SIGN_POS.x, dz = player.pos.z - SIGN_POS.z;
        if (dx * dx + dz * dz < 25) {
          this.signSeen = true;
          hud?.showToast('„Hier endet der Schutz des Schlosses. Was hier friert, friert von innen.“', 4.5);
        }
      }
    },
  };
  return moor;
}
