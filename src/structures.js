// Außenposten: Bootshaus mit Steg, Hagrids Hütte mit Kürbisbeet,
// Quidditch-Feld, Steinkreis — mit Stein-/Holz-/Dach-Texturen.

import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, addCircleBlocker, addPlatform } from './geo.js';
import { terrainHeight, BOATHOUSE, HAGRID, QUIDDITCH, STONES, WATER_LEVEL } from './terrain.js';
import { mulberry32 } from './noise.js';
import { getMaterials } from './materials.js';

const STONE = 0x9d968c;
const STONE_DARK = 0x7e7770;
const WOOD = 0x8a6a45;
const WOOD_DARK = 0x6d5236;
const ROOF_WOOD = 0x5d4730;
const STRAW = 0xa08a48;
const WINDOW_WARM = 0xffd98c;
const GOLD = 0xd8b02f;
const IRON = 0x3a3a42;

export function buildStructures(scene) {
  const mats = getMaterials();
  const bx = {
    s: new GeoBatch(), r: new GeoBatch(), w: new GeoBatch(),
    d: new GeoBatch(), wb: new GeoBatch(),
  };
  const flames = [];
  const nightLights = [];
  const pumpkins = [];
  const rng = mulberry32(23);

  // ===== Bootshaus + Steg =====
  {
    const x = BOATHOUSE.x, z = BOATHOUSE.z, gy = BOATHOUSE.h;
    bx.w.add(new THREE.BoxGeometry(7, 3.4, 9), WOOD_DARK, x, gy + 1.7, z);
    addBoxBlocker(x - 3.5, x + 3.5, gy, gy + 3.4, z - 4.5, z + 4.5);
    // Steinsockel
    bx.s.add(new THREE.BoxGeometry(7.6, 1.2, 9.6), STONE_DARK, x, gy + 0.3, z);
    const r = (3.5 + 0.6) / 0.866, sy = 2.6 / (1.5 * r);
    const roof = new THREE.CylinderGeometry(r, r, 9.8, 3, 1, false, Math.PI / 2);
    roof.rotateZ(Math.PI / 2); roof.scale(1, sy, 1); roof.rotateY(Math.PI / 2);
    roof.translate(x, gy + 3.4 + 0.5 * r * sy, z);
    bx.r.addRaw(roof, ROOF_WOOD);
    bx.wb.add(new THREE.PlaneGeometry(1.2, 1.2), WINDOW_WARM, x + 3.56, gy + 2, z, Math.PI / 2);
    bx.wb.add(new THREE.PlaneGeometry(1.2, 1.2), WINDOW_WARM, x, gy + 2, z + 4.56, 0);
    // Steg
    const dz = 8;
    bx.w.add(new THREE.BoxGeometry(26, 0.3, dz - 2), WOOD, x - 3.5 - 13, WATER_LEVEL + 1.0, z);
    addPlatform(x - 3.5 - 26, x - 3.5, z - (dz - 2) / 2, z + (dz - 2) / 2, WATER_LEVEL + 1.15);
    for (let px = x - 6; px >= x - 28; px -= 5.5) {
      for (const s of [-1, 1]) {
        bx.w.add(new THREE.CylinderGeometry(0.18, 0.22, 3.4, 6), WOOD_DARK, px, WATER_LEVEL - 0.4, z + s * (dz / 2 - 1));
      }
    }
    // Geländer auf einer Seite
    for (let px = x - 6; px >= x - 26; px -= 5) {
      bx.w.add(new THREE.BoxGeometry(0.12, 1.0, 0.12), WOOD_DARK, px, WATER_LEVEL + 1.6, z - (dz / 2 - 1));
    }
    bx.w.add(new THREE.BoxGeometry(22, 0.1, 0.12), WOOD, x - 16.5, WATER_LEVEL + 2.05, z - (dz / 2 - 1));
    // Laterne am Stegende
    const lx = x - 27;
    bx.d.add(new THREE.CylinderGeometry(0.09, 0.14, 2.6, 6), IRON, lx, WATER_LEVEL + 2.4, z + 2.6);
    bx.wb.add(new THREE.BoxGeometry(0.4, 0.45, 0.4), WINDOW_WARM, lx, WATER_LEVEL + 3.85, z + 2.6);
    flames.push([lx, WATER_LEVEL + 3.9, z + 2.6]);
    const l = new THREE.PointLight(0xffb066, 0, 22, 1.8);
    l.position.set(lx, WATER_LEVEL + 4, z + 2.6);
    scene.add(l); nightLights.push(l);
    // Ruderboot
    const hull = new THREE.SphereGeometry(1, 10, 6);
    hull.scale(1.1, 0.55, 2.4);
    hull.translate(x - 30, WATER_LEVEL + 0.15, z - 2.5);
    bx.w.addRaw(hull, WOOD_DARK);
  }

  // ===== Hagrids Hütte + Kürbisbeet =====
  {
    const x = HAGRID.x, z = HAGRID.z, gy = HAGRID.h;
    bx.s.add(new THREE.CylinderGeometry(5.2, 5.6, 3.8, 12), 0x9a8a70, x, gy + 1.9, z);
    addCircleBlocker(x, z, 5.7, gy, gy + 4);
    bx.r.add(new THREE.ConeGeometry(6.6, 4.2, 12), STRAW, x, gy + 3.8 + 2.1, z);
    bx.s.add(new THREE.BoxGeometry(1.1, 3.2, 1.1), STONE_DARK, x + 3.4, gy + 5.6, z + 1.5);
    bx.w.add(new THREE.BoxGeometry(0.25, 2.8, 1.8), WOOD_DARK, x - 5.45, gy + 1.4, z, 0);
    bx.wb.add(new THREE.PlaneGeometry(1.1, 1.1), WINDOW_WARM, x, gy + 2.2, z - 5.68, Math.PI);
    bx.wb.add(new THREE.PlaneGeometry(1.1, 1.1), WINDOW_WARM, x, gy + 2.2, z + 5.68, 0);
    flames.push([x - 6.1, gy + 2.8, z]);
    const l = new THREE.PointLight(0xffa860, 0, 18, 1.8);
    l.position.set(x - 6.5, gy + 3, z);
    scene.add(l); nightLights.push(l);
    for (let i = 0; i < 9; i++) {
      const px = x + 8 + rng() * 10, pz = z + 2 + rng() * 10;
      const py = terrainHeight(px, pz);
      const s = 0.5 + rng() * 0.7;
      const p = new THREE.SphereGeometry(s, 8, 6);
      p.scale(1, 0.75, 1);
      p.translate(px, py + s * 0.55, pz);
      bx.d.addRaw(p, i % 3 === 0 ? 0xc96a1e : 0xd97b24);
      bx.d.add(new THREE.CylinderGeometry(0.05, 0.08, 0.4, 5), 0x4a5a2a, px, py + s * 1.15, pz);
      // Position gemerkt (nicht die Mesh-Referenz — Kürbisse sind in ein
      // gemeinsames Mesh gemergt) für den Kürbis-Gag: Incendio-Ziel + eine
      // separate Overlay-Plane/Licht, die bei Treffer aufleuchtet.
      pumpkins.push({ x: px, y: py + s * 0.55, z: pz, radius: s, facing: 0 });
    }
    const fx0 = x + 6, fx1 = x + 20, fz0 = z, fz1 = z + 14;
    for (let fx = fx0; fx <= fx1; fx += 3.5) {
      for (const fz of [fz0, fz1]) {
        bx.w.add(new THREE.BoxGeometry(0.18, 1.1, 0.18), WOOD_DARK, fx, terrainHeight(fx, fz) + 0.55, fz);
      }
    }
    for (let fz = fz0; fz <= fz1; fz += 3.5) {
      bx.w.add(new THREE.BoxGeometry(0.18, 1.1, 0.18), WOOD_DARK, fx1, terrainHeight(fx1, fz) + 0.55, fz);
    }
    bx.w.add(new THREE.CylinderGeometry(0.9, 0.9, 1.0, 8), WOOD, x - 2, gy + 0.5, z + 7.5);
  }

  // ===== Gewächshaus (Glashaus, begehbar) =====
  // Abstände geprüft: HAGRID 58m > 30.4(HAGRID-Einfluss)+22.8(eigenes
  // Flatten×1.9) ✓, LAKE 250m ✓ — keine Überlappung mit bestehenden Zonen.
  const GEWAECHSHAUS = { x: 80, z: 240, w: 10, d: 6, h: 4.2 };
  const leuchtkraeuter = [];
  const gwPlants = [];
  {
    const { x: hx, z: hz, w: hw, d: hd, h: hh } = GEWAECHSHAUS;
    const hy = terrainHeight(hx, hz);
    const halfW = hw / 2, halfD = hd / 2, wallT = 0.15, doorHalfW = 1.2;
    const glassMat = new THREE.MeshLambertMaterial({
      color: 0xbfe8e0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    });
    // Eckpfosten
    for (const [ox, oz] of [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]]) {
      bx.w.add(new THREE.BoxGeometry(0.22, hh, 0.22), WOOD_DARK, hx + ox, hy + hh / 2, hz + oz);
    }
    // Glaswände: Nord/West/Ost solide, Süd (Zugang) mit Türlücke
    const northGlass = new THREE.Mesh(new THREE.PlaneGeometry(hw, hh), glassMat);
    northGlass.position.set(hx, hy + hh / 2, hz - halfD);
    scene.add(northGlass);
    addBoxBlocker(hx - halfW, hx + halfW, hy, hy + hh, hz - halfD - wallT, hz - halfD + wallT);
    for (const side of [-1, 1]) {
      const wallGlass = new THREE.Mesh(new THREE.PlaneGeometry(hd, hh), glassMat);
      wallGlass.rotation.y = Math.PI / 2;
      wallGlass.position.set(hx + side * halfW, hy + hh / 2, hz);
      scene.add(wallGlass);
      addBoxBlocker(hx + side * halfW - wallT, hx + side * halfW + wallT, hy, hy + hh, hz - halfD, hz + halfD);
    }
    const segW = halfW - doorHalfW;
    const southL = new THREE.Mesh(new THREE.PlaneGeometry(segW, hh), glassMat);
    southL.position.set(hx - doorHalfW - segW / 2, hy + hh / 2, hz + halfD);
    scene.add(southL);
    addBoxBlocker(hx - halfW, hx - doorHalfW, hy, hy + hh, hz + halfD - wallT, hz + halfD + wallT);
    const southR = new THREE.Mesh(new THREE.PlaneGeometry(segW, hh), glassMat);
    southR.position.set(hx + doorHalfW + segW / 2, hy + hh / 2, hz + halfD);
    scene.add(southR);
    addBoxBlocker(hx + doorHalfW, hx + halfW, hy, hy + hh, hz + halfD - wallT, hz + halfD + wallT);
    // Glas-Giebeldach
    const roofR = (hw / 2 + 0.3) / 0.866, roofH = hh * 0.4;
    const roofSy = roofH / (1.5 * roofR);
    const roofGeo = new THREE.CylinderGeometry(roofR, roofR, hd + 0.4, 3, 1, false, Math.PI / 2);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.scale(1, roofSy, 1);
    roofGeo.translate(hx, hy + hh + 0.5 * roofR * roofSy, hz);
    const roofMesh = new THREE.Mesh(roofGeo, glassMat);
    scene.add(roofMesh);

    // 2 Pflanztische mit Töpfen + wippenden Fantasie-Pflanzen
    for (const tx of [-hw * 0.28, hw * 0.28]) {
      bx.w.add(new THREE.BoxGeometry(2.6, 0.8, 1.2), WOOD_DARK, hx + tx, hy + 0.4, hz - 0.5);
      for (let i = 0; i < 3; i++) {
        const px = hx + tx + (i - 1) * 0.8, pz = hz - 0.5;
        const py = hy + 0.8;
        bx.d.add(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 8), 0x8a6a45, px, py + 0.15, pz);
        const plantColor = i % 2 === 0 ? 0x4f9b4a : 0x3a7a5a;
        const plant = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), new THREE.MeshLambertMaterial({ color: plantColor, flatShading: true }));
        plant.position.set(px, py + 0.55, pz);
        scene.add(plant);
        gwPlants.push({ mesh: plant, phase: rng() * Math.PI * 2 });
      }
    }
    // 3 Leuchtkräuter (Pickup erst in W5 — hier nur Deko + Positionen)
    const lkMat = new THREE.SpriteMaterial({
      color: 0x5cffa0, transparent: true, opacity: 0.85, depthWrite: false,
    });
    const lkSpots = [
      { x: hx - hw * 0.28, z: hz - 0.5 + 0.3 },
      { x: hx + hw * 0.05, z: hz - 0.5 },
      { x: hx + hw * 0.28, z: hz - 0.5 - 0.3 },
    ];
    for (const spot of lkSpots) {
      const y = hy + 1.15;
      const s = new THREE.Sprite(lkMat.clone());
      s.position.set(spot.x, y, spot.z);
      s.scale.setScalar(0.3);
      scene.add(s);
      leuchtkraeuter.push({ x: spot.x, y, z: spot.z, sprite: s });
    }
  }

  // ===== Eulerei (runder Turm, offene Fensterbögen, Sitzstangen) =====
  // Abstände geprüft: liegt bewusst im PLATEAU-Blendbereich (95m < 130m
  // Einfluss) — der Turm bekommt DESHALB kein eigenes Terrain-Flatten,
  // seine Basis folgt einfach der natürlich sanft ansteigenden Flanke.
  // STONES-Abstand 89m > 62.4m Einfluss ✓.
  const EULEREI = { x: 95, z: -25, r: 3, h: 9 };
  const owlPerches = [];
  {
    const { x: ex, z: ez, r: er, h: eh } = EULEREI;
    const ey = terrainHeight(ex, ez);
    bx.s.add(new THREE.CylinderGeometry(er * 1.05, er * 1.2, eh, 10), STONE_DARK, ex, ey + eh / 2, ez);
    addCircleBlocker(ex, ez, er * 1.15, ey, ey + eh);
    // Offene Fensterbögen oben (nur Rahmen, kein Glas — Eulen fliegen ein/aus)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const wx = ex + Math.cos(a) * er * 1.05, wz = ez + Math.sin(a) * er * 1.05;
      bx.s.add(new THREE.BoxGeometry(1.1, 1.6, 0.2), STONE_DARK, wx, ey + eh - 1.2, wz, a);
    }
    // Kegeldach
    bx.r.add(new THREE.ConeGeometry(er * 1.5, 2.6, 10), ROOF_WOOD, ex, ey + eh + 1.3, ez);
    // Sitzstangen: kleine Konsolen, die an 2 der 4 Fensteröffnungen nach außen
    // ragen. Der Turmkörper ist ein solider Zylinder (kein echtes Loch) —
    // Sitzstangen MITTIG im Turm wären daher komplett unsichtbar von außen.
    for (const wa of [0, Math.PI]) {
      const px = ex + Math.cos(wa) * (er * 1.05 + 0.4);
      const pz = ez + Math.sin(wa) * (er * 1.05 + 0.4);
      const py = ey + eh - 1.2;
      const perchGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6);
      perchGeo.rotateZ(Math.PI / 2);
      perchGeo.rotateY(wa);
      perchGeo.translate(px, py, pz);
      bx.w.addRaw(perchGeo, WOOD_DARK);
      owlPerches.push({ x: px, y: py + 0.15, z: pz });
    }
  }

  // ===== Quidditch-Feld =====
  {
    const x = QUIDDITCH.x, z = QUIDDITCH.z, gy = QUIDDITCH.h;
    const ring = new THREE.TorusGeometry(6, 0.25, 6, 28);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, gy + 0.1, z);
    bx.d.addRaw(ring, 0xd8d2c0);
    for (const end of [-1, 1]) {
      const ez = z + end * 38;
      for (const [ox, ph] of [[-7, 8], [0, 11], [7, 8]]) {
        const px = x + ox;
        const py = terrainHeight(px, ez);
        bx.d.add(new THREE.CylinderGeometry(0.16, 0.22, ph, 7), 0xd8d2c0, px, py + ph / 2, ez);
        const hoop = new THREE.TorusGeometry(1.7, 0.16, 6, 16);
        hoop.translate(px, py + ph + 1.7, ez);
        bx.d.addRaw(hoop, GOLD);
        addCircleBlocker(px, ez, 0.4, py, py + ph);
      }
    }
    for (const side of [-1, 1]) {
      const tx = x + side * 24, tz = z;
      const ty = terrainHeight(tx, tz);
      bx.w.add(new THREE.BoxGeometry(5, 7, 10), WOOD_DARK, tx, ty + 3.5, tz);
      addBoxBlocker(tx - 2.5, tx + 2.5, ty, ty + 7, tz - 5, tz + 5);
      bx.r.add(new THREE.ConeGeometry(4.4, 3, 4), side < 0 ? 0xa62b2b : 0x2b4b9b, tx, ty + 8.5, tz, Math.PI / 4);
      for (const bz of [-3, 3]) {
        bx.d.add(new THREE.PlaneGeometry(1.6, 4.4), side < 0 ? 0xbfa32b : 0x2b6b35,
          tx + (side < 0 ? 2.56 : -2.56), ty + 4.4, tz + bz, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }

  // ===== Steinkreis =====
  // Positionen gemerkt (Steine sind gemergt) für das Lied-der-Steine-Rätsel:
  // 4 der 9 Steine bekommen dort eine Runen-Plane + werden Stupor-Ziele.
  const stones = [];
  {
    const x = STONES.x, z = STONES.z;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sx = x + Math.sin(a) * 9, sz = z + Math.cos(a) * 9;
      const sy = terrainHeight(sx, sz);
      const h = 3.2 + rng() * 1.6;
      const st = new THREE.BoxGeometry(1.5, h, 0.9);
      st.rotateZ((rng() - 0.5) * 0.16);
      st.rotateY(a + (rng() - 0.5) * 0.5);
      st.translate(sx, sy + h / 2 - 0.2, sz);
      bx.s.addRaw(st, 0x8b8578);
      addCircleBlocker(sx, sz, 1.2, sy - 1, sy + h);
      stones.push({ x: sx, y: sy, z: sz, topY: sy + h - 0.2 });
    }
    const ay = terrainHeight(x, z);
    bx.s.add(new THREE.BoxGeometry(2.6, 0.7, 1.6), 0x7e7770, x, ay + 0.35, z, 0.4);
    addBoxBlocker(x - 1.5, x + 1.5, ay, ay + 0.7, z - 1.2, z + 1.2);
  }

  const meshes = [
    bx.s.build(mats.stone), bx.r.build(mats.roof), bx.w.build(mats.wood),
    bx.d.build(mats.deco),
    bx.wb.build(mats.window, { castShadow: false, receiveShadow: false }),
  ];
  for (const m of meshes) if (m) scene.add(m);

  return {
    flames,
    nightLights,
    pumpkins,
    stones,
    gewaechshaus: GEWAECHSHAUS,
    leuchtkraeuter,
    eulerei: EULEREI,
    owlPerches,
    update(nightGlow, time = 0) {
      // Fensterfarbe regelt castle.update (gemeinsames Material)
      for (const l of nightLights) l.intensity = 20 * nightGlow;
      for (const p of gwPlants) {
        p.mesh.rotation.z = Math.sin(time * 1.4 + p.phase) * 0.12;
        p.mesh.rotation.x = Math.sin(time * 1.1 + p.phase * 1.3) * 0.08;
      }
      for (const l of leuchtkraeuter) {
        const s = 0.3 + Math.sin(time * 2 + l.x) * 0.04;
        l.sprite.scale.setScalar(s);
        l.sprite.material.opacity = 0.7 + Math.sin(time * 2.4 + l.z) * 0.15;
      }
    },
  };
}
