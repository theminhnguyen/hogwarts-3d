// Die Wildmark (S1, PLAN-SCHATTEN-UND-SCHWINGEN.md): drei neue Wildmark-
// Orte jenseits des alten Kartenrands. Fahlholz und Hügelgrab sind reine
// Deko/Terrain-Dressing (Fauna kommt erst in S2, die Grabkammer öffnet
// erst in S10) — Wispernde Kate ist ein begehbares, aber leeres Gebäude
// (Einrichtung + Kauf-Quest folgen in S7).

import * as THREE from 'three';
import { terrainHeight, FAHLHOLZ, HUEGELGRAB, KATE } from './terrain.js';
import { GeoBatch, addBoxBlocker, addCircleBlocker, tint } from './geo.js';
import { mulberry32 } from './noise.js';
import { getMaterials } from './materials.js';
import { makeCloudTexture } from './textures.js';

const TREE_DARK = 0x0a140c;
const TREE_TRUNK = 0x241a13;
const PLASTER = 0xcac0a8; // verwittert-blass, dunkler als das Dorf-PLASTER
const WOOD_FRAME = 0x4a3a28;
const WOOD_COL = 0x5c4630;
const ROOF_COL = 0x554038;
const STONE_COL = 0x8b847b;

// ---------- Fahlholz: dunkler, dichter Hain + dünner Bodennebel ----------
export function buildFahlholz(scene) {
  const rng = mulberry32(4441);
  const b = new GeoBatch();

  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 4 + rng() * (FAHLHOLZ.r - 6);
    const tx = FAHLHOLZ.x + Math.cos(a) * r, tz = FAHLHOLZ.z + Math.sin(a) * r;
    const ty = terrainHeight(tx, tz);
    const h = 7.5 + rng() * 3.5;
    const trunk = new THREE.CylinderGeometry(0.3, 0.4, h * 0.55, 6);
    trunk.translate(tx, ty + h * 0.275, tz);
    b.addRaw(trunk, TREE_TRUNK);
    for (let k = 0; k < 3; k++) {
      const cr = 2.3 - k * 0.5, ch = 2.5;
      const cone = new THREE.ConeGeometry(cr, ch, 7);
      cone.translate(tx, ty + h * 0.5 + k * 1.6, tz);
      b.addRaw(cone, TREE_DARK);
    }
    addBoxBlocker(tx - 0.4, tx + 0.4, ty, ty + h, tz - 0.4, tz + 0.4);
  }
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const treeMesh = b.build(treeMat, { castShadow: true, receiveShadow: false });
  if (treeMesh) scene.add(treeMesh);

  // Dünner Bodennebel (Muster moor.js, aber weniger Sprites + geringere
  // Deckkraft — "dünner" laut Plan, kein totes Land wie das Moor).
  const fogTexes = [makeCloudTexture(41), makeCloudTexture(42)];
  const fogSprites = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fogTexes[i % 2], color: 0x8a8f7c, transparent: true, opacity: 0.11,
      depthWrite: false, fog: false,
    });
    const s = new THREE.Sprite(mat);
    const scale = 22 + rng() * 16;
    s.scale.set(scale, 7, 1);
    const angle = rng() * Math.PI * 2;
    const radius = 4 + rng() * (FAHLHOLZ.r - 6);
    const x = FAHLHOLZ.x + Math.cos(angle) * radius, z = FAHLHOLZ.z + Math.sin(angle) * radius;
    s.position.set(x, terrainHeight(x, z) + 1.2, z);
    s.userData = { baseX: x, baseZ: z, angle, radius, speed: 0.03 + rng() * 0.02, baseOpacity: 0.11 };
    scene.add(s);
    fogSprites.push(s);
  }

  return {
    update(dt) {
      for (const s of fogSprites) {
        const u = s.userData;
        u.angle += u.speed * dt;
        const x = FAHLHOLZ.x + Math.cos(u.angle) * u.radius, z = FAHLHOLZ.z + Math.sin(u.angle) * u.radius;
        s.position.x = x; s.position.z = z;
      }
    },
  };
}

// ---------- Hügelgrab: Steinkranz + versiegelte Kammer (öffnet erst S10) ----------
export function buildHuegelgrab(scene) {
  const mats = getMaterials();
  const rng = mulberry32(4442);
  const stoneBatch = new GeoBatch();
  const cy = terrainHeight(HUEGELGRAB.x, HUEGELGRAB.z);

  // Steinkranz (kleiner als der Steinkreis: 7 statt 9 Steine, r=6.5 statt 9)
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const sx = HUEGELGRAB.x + Math.sin(a) * 6.5, sz = HUEGELGRAB.z + Math.cos(a) * 6.5;
    const sy = terrainHeight(sx, sz);
    const h = 1.6 + rng() * 0.8;
    const st = new THREE.BoxGeometry(0.9, h, 0.55);
    st.rotateZ((rng() - 0.5) * 0.2);
    st.rotateY(a + (rng() - 0.5) * 0.5);
    st.translate(sx, sy + h / 2 - 0.15, sz);
    stoneBatch.addRaw(st, STONE_COL);
    addCircleBlocker(sx, sz, 0.6, sy - 1, sy + h);
  }

  // Versiegelte Grabkammer: kleine Steinnische mit fester Platte (Muster
  // moor.js-Krypta, aber ohne Öffnungs-Mechanik — die Truhe/das Ritual
  // kommen erst in S10). Eingang nach Westen, am Rand des Hügels.
  const doorX = HUEGELGRAB.x - 8.5, doorZ = HUEGELGRAB.z;
  const backX = doorX - 1.6;
  stoneBatch.add(new THREE.BoxGeometry(0.6, 2.4, 3.2), 0x5c574e, backX, cy + 1.2, doorZ);
  stoneBatch.add(new THREE.BoxGeometry(1.8, 2.4, 0.55), 0x5c574e, doorX - 0.9, cy + 1.2, doorZ - 1.6);
  stoneBatch.add(new THREE.BoxGeometry(1.8, 2.4, 0.55), 0x5c574e, doorX - 0.9, cy + 1.2, doorZ + 1.6);
  addBoxBlocker(backX - 0.3, backX + 0.3, cy, cy + 2.4, doorZ - 1.9, doorZ + 1.9);
  addBoxBlocker(doorX - 1.8, doorX, cy, cy + 2.4, doorZ - 1.9, doorZ - 1.05);
  addBoxBlocker(doorX - 1.8, doorX, cy, cy + 2.4, doorZ + 1.05, doorZ + 1.9);

  // tint() ist Pflicht: mats.stone hat vertexColors:true — eine Geometrie
  // ohne 'color'-Attribut rendert dann SCHWARZ statt neutral (WebGL liest
  // ein fehlendes generic-vertex-attribute als (0,0,0,0), das multipliziert
  // die Textur auf Null). Weiß = Textur unverändert durchscheinen lassen.
  const slab = new THREE.Mesh(tint(new THREE.BoxGeometry(0.5, 2.4, 3.2), 0xffffff), mats.stone);
  slab.position.set(doorX, cy + 1.2, doorZ);
  slab.castShadow = true; slab.receiveShadow = true;
  scene.add(slab);
  const slabBlocker = addBoxBlocker(doorX - 0.25, doorX + 0.25, cy, cy + 2.4, doorZ - 1.6, doorZ + 1.6);

  const mesh = stoneBatch.build(mats.stone, { castShadow: true, receiveShadow: true });
  if (mesh) scene.add(mesh);

  // slab/slabBlocker: hallows.js (S10) animiert die Platte beim Mitternachts-
  // Trigger auf und schaltet ihren Blocker ab, damit die Grabkammer begehbar wird.
  return { slabPos: { x: doorX, y: cy + 1.2, z: doorZ }, slab, slabBlocker, doorZ };
}

// ---------- Wispernde Kate: verlassenes, begehbares Gebäude (leer) ----------
function gableRoof(batch, cx, cz, w, len, baseY, roofH, color, ry) {
  const r = (w / 2 + 0.4) / 0.866;
  const sy = roofH / (1.5 * r);
  const geo = new THREE.CylinderGeometry(r, r, len + 0.6, 3, 1, false, Math.PI / 2);
  geo.rotateZ(Math.PI / 2);
  geo.scale(1, sy, 1);
  geo.rotateY(ry);
  geo.translate(cx, baseY + 0.5 * r * sy, cz);
  batch.addRaw(geo, color);
}

const WINDOW_WARM = 0xffd98c;

export function buildKate(scene, glowTex) {
  const mats = getMaterials();
  const rng = mulberry32(4443);
  const batches = { wall: new GeoBatch(), roof: new GeoBatch(), wood: new GeoBatch(), window: new GeoBatch() };

  const kx = KATE.x, kz = KATE.z;
  const ky = terrainHeight(kx, kz);
  const w = 6.5, d = 5.5, h = 3.4, wallT = 0.35;
  const halfW = w / 2, halfD = d / 2, doorHalfW = 0.9;

  // Rückwand + Seitenwände (solide, Muster village.js-Gasthaus)
  batches.wall.add(new THREE.BoxGeometry(w, h, wallT), PLASTER, kx, ky + h / 2, kz + halfD - wallT / 2);
  addBoxBlocker(kx - halfW, kx + halfW, ky, ky + h, kz + halfD - wallT, kz + halfD);
  batches.wall.add(new THREE.BoxGeometry(wallT, h, d), PLASTER, kx - halfW + wallT / 2, ky + h / 2, kz);
  addBoxBlocker(kx - halfW, kx - halfW + wallT, ky, ky + h, kz - halfD, kz + halfD);
  batches.wall.add(new THREE.BoxGeometry(wallT, h, d), PLASTER, kx + halfW - wallT / 2, ky + h / 2, kz);
  addBoxBlocker(kx + halfW - wallT, kx + halfW, ky, ky + h, kz - halfD, kz + halfD);
  // Frontwand mit Türlücke
  const segW = halfW - doorHalfW;
  batches.wall.add(new THREE.BoxGeometry(segW, h, wallT), PLASTER, kx - doorHalfW - segW / 2, ky + h / 2, kz - halfD + wallT / 2);
  addBoxBlocker(kx - halfW, kx - doorHalfW, ky, ky + h, kz - halfD, kz - halfD + wallT);
  batches.wall.add(new THREE.BoxGeometry(segW, h, wallT), PLASTER, kx + doorHalfW + segW / 2, ky + h / 2, kz - halfD + wallT / 2);
  addBoxBlocker(kx + doorHalfW, kx + halfW, ky, ky + h, kz - halfD, kz - halfD + wallT);

  // Boden (S7: heller/staubiger je nach heim.kate, per setOwned() umgefärbt)
  const floorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(w - wallT * 2, 0.1, d - wallT * 2),
    new THREE.MeshLambertMaterial({ color: 0x4a4030, flatShading: true }),
  );
  floorMesh.position.set(kx, ky + 0.05, kz);
  scene.add(floorMesh);
  gableRoof(batches.roof, kx, kz, w, d, ky + h, h * 0.5, ROOF_COL, 0);

  // Fensteröffnungen (S7: mats.window-Trick — dasselbe geteilte, von
  // castle.js jeden Frame nach nightGlow animierte Material wie überall
  // sonst im Spiel; liegt HINTER den Fensterläden, wird erst sichtbar,
  // sobald setOwned(true) die Läden aufschwingt).
  const winSideZ = kz - halfD * 0.3;
  for (const side of [-1, 1]) {
    const win = new THREE.PlaneGeometry(0.7, 0.9);
    win.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
    win.translate(kx + side * (halfW - wallT / 2 - 0.01), ky + h * 0.55, winSideZ);
    batches.window.addRaw(win, WINDOW_WARM);
  }

  // Fensterläden UND Türflügel bleiben EIGENE (nicht gebatchte) Meshes,
  // damit setOwned() sie einzeln gerade richten/aufschwingen kann — anders
  // als alle sonstige Deko hier, die statisch gemergt werden darf.
  const shutterMat = new THREE.MeshLambertMaterial({ color: WOOD_FRAME, flatShading: true });
  const shutters = [];
  for (const side of [-1, 1]) {
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.05, 0.06), shutterMat);
    shutter.position.set(kx + side * (halfW - wallT / 2 - 0.01), ky + h * 0.55, winSideZ);
    const crooked = side * (0.18 + rng() * 0.12);
    shutter.rotation.z = crooked;
    shutter.userData = { side, crooked, openZ: side * 1.5 };
    scene.add(shutter);
    shutters.push(shutter);
  }
  // Verzogener Türflügel, halb offen (bleibt immer schief — nur die
  // Fensterläden werden laut Plan "gerade", die Tür ist kein Kaufkriterium)
  const door = new THREE.BoxGeometry(0.8, 1.85, 0.06);
  door.rotateY(0.35);
  door.translate(kx - doorHalfW - 0.35, ky + 0.95, kz - halfD + 0.3);
  batches.wood.addRaw(door, WOOD_COL);

  // Kamin (Westwand) — S7: nur bei heim.kate=1 aktiv, gleiches Muster wie
  // village.js-Gasthaus (EIN Glow-Sprite + EIN PointLight).
  const kaminPos = { x: kx - halfW + 0.5, y: ky, z: kz + 1.6 };
  batches.wall.add(new THREE.BoxGeometry(1.0, 1.4, 0.8), STONE_COL, kaminPos.x, kaminPos.y + 0.7, kaminPos.z);
  const kaminGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const kaminGlow = new THREE.Sprite(kaminGlowMat);
  kaminGlow.position.set(kaminPos.x + 0.35, kaminPos.y + 0.55, kaminPos.z);
  kaminGlow.scale.set(0.9, 1.1, 1);
  scene.add(kaminGlow);
  const kaminLight = new THREE.PointLight(0xff9a3c, 0, 8, 2);
  kaminLight.position.set(kaminPos.x + 0.5, kaminPos.y + 0.7, kaminPos.z);
  scene.add(kaminLight);

  const meshes = [
    batches.wall.build(mats.stone),
    batches.roof.build(mats.roof),
    batches.wood.build(mats.wood),
    batches.window.build(mats.window),
  ];
  for (const m of meshes) if (m) scene.add(m);

  // Verlassen ↔ bewohnt umschalten (S7-Kauf-Moment): Läden gerade/schief,
  // Kamin an/aus, Boden heller. Reiner Sichtbarkeits-/Rotations-Zustand,
  // kein Rebuild — darf beliebig oft (Reset!) aufgerufen werden.
  function setOwned(owned) {
    for (const s of shutters) s.rotation.z = owned ? 0 : s.userData.crooked;
    kaminGlowMat.opacity = owned ? 0.8 : 0;
    kaminLight.intensity = owned ? 6 : 0;
    floorMesh.material.color.setHex(owned ? 0x6b5a42 : 0x4a4030);
  }

  return { x: kx, y: ky, z: kz, w, d, h, wallT, doorHalfW, setOwned };
}
