// Das Schloss: Türme, Ringmauer, Torhaus mit Fallgitter, Großer Saal (begehbar,
// mit verzauberter Decke, Kerzen, Buttressen & Gauben), Bergfried mit Uhr,
// Astronomieturm mit Bogenbrücke, Kreuzgang, Viadukt. Materialien:
// Stein/Dach/Holz mit Welt-Textur-Projektion, Deko & Fenster separat.

import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, addCircleBlocker, addPlatform } from './geo.js';
import { PLATEAU, terrainHeight } from './terrain.js';
import { mulberry32 } from './noise.js';
import { getMaterials } from './materials.js';

const GY = PLATEAU.h; // Bodenhöhe des Plateaus (18)

// Farbpalette (Texturen multiplizieren → Töne etwas heller angelegt)
const STONE = 0xaaa49b;
const STONE_DARK = 0x8b847b;
const STONE_TRIM = 0xbbb5aa;    // helle Rahmen/Simse
const ROOF = 0x48597c;          // Schiefer-Blau
const ROOF_DARK = 0x3d4c6b;
const WOOD = 0x8a6a45;
const WOOD_DARK = 0x6d5236;
const CREAM = 0xe8e0c8;
const GOLD = 0xd8b02f;
const IRON = 0x3a3a42;
const WINDOW_WARM = 0xffd98c;

const FLAG_COLORS = [0xa62b2b, 0x2b6b35, 0x2b4b9b, 0xbfa32b];

// ---------- Bau-Helfer ----------

// bx = { s: Stein, r: Dach, w: Holz, d: Deko, wb: Fenster }

function tower(bx, x, z, r, h, { roof = 'cone', windows = true, collide = true, flag = -1 } = {}) {
  // Sockel + Körper + Gesimse
  bx.s.add(new THREE.CylinderGeometry(r * 1.14, r * 1.22, 2.2, 10), STONE_DARK, x, GY + 1.1, z);
  bx.s.add(new THREE.CylinderGeometry(r * 0.92, r * 1.04, h, 10), STONE, x, GY + h / 2, z);
  for (const f of [0.42, 0.78]) {
    bx.s.add(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.45, 10), STONE_TRIM, x, GY + h * f, z);
  }
  bx.s.add(new THREE.CylinderGeometry(r * 1.12, r * 1.02, 1.2, 10), STONE_TRIM, x, GY + h + 0.6, z);
  let topY = GY + h + 1.2;
  if (roof === 'cone') {
    const rh = r * 2.35;
    bx.r.add(new THREE.ConeGeometry(r * 1.24, rh, 10), ROOF, x, topY + rh / 2, z);
    topY += rh;
    bx.d.add(new THREE.SphereGeometry(0.3, 6, 5), GOLD, x, topY + 0.1, z);
    if (flag >= 0) {
      bx.d.add(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 5), IRON, x, topY + 1.3, z);
      bx.d.add(new THREE.PlaneGeometry(1.5, 0.9), FLAG_COLORS[flag % 4], x + 0.78, topY + 2.1, z, 0);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bx.s.add(new THREE.BoxGeometry(0.9, 1.0, 0.6), STONE_DARK,
        x + Math.sin(a) * r * 1.02, GY + h + 1.6, z + Math.cos(a) * r * 1.02, a);
    }
  }
  if (windows) {
    for (let wy = GY + 6; wy < GY + h - 3; wy += 6.5) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + wy * 0.35;
        const wx = x + Math.sin(a) * (r + 0.06);
        const wz = z + Math.cos(a) * (r + 0.06);
        bx.wb.add(new THREE.PlaneGeometry(0.85, 1.5), WINDOW_WARM, wx, wy, wz, a);
        // Sims darunter
        bx.s.add(new THREE.BoxGeometry(1.15, 0.18, 0.35), STONE_TRIM,
          x + Math.sin(a) * (r + 0.12), wy - 0.85, z + Math.cos(a) * (r + 0.12), a);
      }
    }
  }
  if (collide) addCircleBlocker(x, z, r + 0.15, GY - 2, GY + h);
}

// Achsen-parallele Mauer mit Zinnen und Fuß-Sockel
function wall(bx, x1, z1, x2, z2, h, th = 2.4) {
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1);
  const len = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
  const w = alongX ? len : th, d = alongX ? th : len;
  bx.s.add(new THREE.BoxGeometry(w + (alongX ? 0 : 0.5), 1.6, d + (alongX ? 0.5 : 0)), STONE_DARK, cx, GY + 0.8, cz);
  bx.s.add(new THREE.BoxGeometry(w, h, d), STONE, cx, GY + h / 2, cz);
  bx.s.add(new THREE.BoxGeometry(alongX ? w : th + 0.4, 0.35, alongX ? th + 0.4 : d), STONE_TRIM, cx, GY + h - 0.5, cz);
  const n = Math.floor(len / 2.4);
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0.5 : i / n;
    const mx = alongX ? x1 + (x2 - x1) * t : cx;
    const mz = alongX ? cz : z1 + (z2 - z1) * t;
    bx.s.add(new THREE.BoxGeometry(alongX ? 1.1 : th + 0.3, 0.9, alongX ? th + 0.3 : 1.1), STONE_DARK, mx, GY + h + 0.45, mz);
  }
  addBoxBlocker(cx - w / 2, cx + w / 2, GY - 2, GY + h + 1.4, cz - d / 2, cz + d / 2);
}

// Satteldach als 3-seitiges Prisma
function gableRoof(batch, cx, cz, w, len, baseY, roofH, color, alongZ = true) {
  const r = (w / 2 + 0.7) / 0.866;
  const sy = roofH / (1.5 * r);
  const geo = new THREE.CylinderGeometry(r, r, len + 1.0, 3, 1, false, Math.PI / 2);
  geo.rotateZ(Math.PI / 2);
  geo.scale(1, sy, 1);
  if (alongZ) geo.rotateY(Math.PI / 2);
  geo.translate(cx, baseY + 0.5 * r * sy, cz);
  batch.addRaw(geo, color);
}

// Bogenfenster mit Steinrahmen: Gewände + Bogen + Sims
function archWindow(bx, x, y, z, facing, w = 1.7, h = 4.0, frame = true) {
  const nx = Math.sin(facing), nz = Math.cos(facing);   // Wand-Normale
  const tx = Math.cos(facing), tz = -Math.sin(facing);  // seitlich
  bx.wb.add(new THREE.PlaneGeometry(w, h), WINDOW_WARM, x, y, z, facing);
  const c = new THREE.CircleGeometry(w / 2, 12);
  c.rotateY(facing);
  c.translate(x + nx * 0.02, y + h / 2, z + nz * 0.02);
  bx.wb.addRaw(c, WINDOW_WARM);
  if (!frame) return;
  for (const side of [-1, 1]) {
    bx.s.add(new THREE.BoxGeometry(0.26, h + 0.3, 0.3), STONE_TRIM,
      x + tx * side * (w / 2 + 0.14) + nx * 0.08, y, z + tz * side * (w / 2 + 0.14) + nz * 0.08, facing);
  }
  const arch = new THREE.TorusGeometry(w / 2 + 0.12, 0.13, 5, 12, Math.PI);
  arch.rotateY(facing);
  arch.translate(x + nx * 0.10, y + h / 2, z + nz * 0.10);
  bx.s.addRaw(arch, STONE_TRIM);
  bx.s.add(new THREE.BoxGeometry(w + 0.6, 0.2, 0.42), STONE_TRIM,
    x + nx * 0.12, y - h / 2 - 0.1, z + nz * 0.12, facing);
}

// Strebepfeiler an einer Wand (facing = Normale der Wand)
function buttress(bx, x, z, facing, h) {
  const nx = Math.sin(facing), nz = Math.cos(facing);
  bx.s.add(new THREE.BoxGeometry(1.0, h, 1.1), STONE_DARK, x + nx * 0.5, GY + h / 2, z + nz * 0.5, facing);
  bx.s.add(new THREE.BoxGeometry(1.0, h * 0.45, 0.8), STONE_DARK,
    x + nx * 1.15, GY + h * 0.225, z + nz * 1.15, facing);
  // Schräge Kappe
  const cap = new THREE.BoxGeometry(1.0, 1.6, 1.0);
  cap.rotateX(0.5);
  cap.rotateY(facing);
  cap.translate(x + nx * 1.0, GY + h * 0.45 + 0.7, z + nz * 1.0);
  bx.s.addRaw(cap, STONE_TRIM);
  addBoxBlocker(x - 0.9 + nx * 0.8, x + 0.9 + nx * 0.8, GY, GY + h, z - 0.9 + nz * 0.8, z + 0.9 + nz * 0.8);
}

// ---------- Hauptaufbau ----------

export function buildCastle(scene) {
  const mats = getMaterials();
  const bx = {
    s: new GeoBatch(), r: new GeoBatch(), w: new GeoBatch(),
    d: new GeoBatch(), wb: new GeoBatch(),
  };
  const flames = [];
  const nightLights = [];
  const rng = mulberry32(7);

  // ===== Ringmauer & Ecktürme =====
  wall(bx, -42, 44, -12, 44, 8);
  wall(bx, 12, 44, 42, 44, 8);
  wall(bx, -42, -50, -42, -15, 8);
  wall(bx, -42, 31, -42, 44, 8);
  wall(bx, 42, -50, 42, -10, 8);
  wall(bx, 42, 26, 42, 44, 8);
  wall(bx, -42, -50, 42, -50, 8);

  tower(bx, -42, 44, 5.5, 22, { flag: 0 });
  tower(bx, 42, 44, 5.5, 22, { flag: 1 });
  tower(bx, -42, -50, 5.5, 26, { flag: 2 });
  tower(bx, 42, -50, 5.5, 26, { flag: 3 });

  // ===== Torhaus (Süd-Eingang) =====
  tower(bx, -8, 44, 4.2, 18, { roof: 'flat' });
  tower(bx, 8, 44, 4.2, 18, { roof: 'flat' });
  bx.s.add(new THREE.BoxGeometry(4.2, 8, 4.5), STONE, -5.9, GY + 4, 44);
  bx.s.add(new THREE.BoxGeometry(4.2, 8, 4.5), STONE, 5.9, GY + 4, 44);
  addBoxBlocker(-8, -3.8, GY - 1, GY + 8, 41.75, 46.25);
  addBoxBlocker(3.8, 8, GY - 1, GY + 8, 41.75, 46.25);
  bx.s.add(new THREE.BoxGeometry(7.6, 5.5, 4.5), STONE, 0, GY + 9.25, 44);
  addBoxBlocker(-3.8, 3.8, GY + 6.5, GY + 12, 41.75, 46.25);
  {
    const arch = new THREE.TorusGeometry(3.8, 0.5, 6, 14, Math.PI);
    arch.translate(0, GY + 6.5, 46.4);
    bx.s.addRaw(arch, STONE_TRIM);
    const arch2 = new THREE.TorusGeometry(3.8, 0.5, 6, 14, Math.PI);
    arch2.translate(0, GY + 6.5, 41.6);
    bx.s.addRaw(arch2, STONE_TRIM);
    // Fallgitter (halb hochgezogen — man läuft darunter durch)
    for (let gx = -3; gx <= 3; gx += 1.2) {
      bx.d.add(new THREE.BoxGeometry(0.12, 3.4, 0.12), IRON, gx, GY + 5.1, 44);
    }
    for (const gy of [4.0, 5.2, 6.4]) {
      bx.d.add(new THREE.BoxGeometry(7.4, 0.12, 0.12), IRON, 0, GY + gy, 44);
    }
  }
  flames.push([-4.6, GY + 4.5, 47.2], [4.6, GY + 4.5, 47.2]);
  {
    const l = new THREE.PointLight(0xffb066, 0, 26, 1.8);
    l.position.set(0, GY + 5, 46);
    scene.add(l); nightLights.push(l);
  }

  // ===== Großer Saal (Westflügel, begehbar) =====
  {
    const x0 = -42, x1 = -22, z0 = -15, z1 = 31, H = 15, TH = 1.2;
    bx.s.add(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), 0x9a9288, (x0 + x1) / 2, GY + 0.15, (z0 + z1) / 2);
    addPlatform(x0, x1, z0, z1, GY + 0.3);
    bx.s.add(new THREE.BoxGeometry(TH, H, z1 - z0), STONE, x0 + TH / 2, GY + H / 2, (z0 + z1) / 2);
    addBoxBlocker(x0, x0 + TH, GY, GY + H, z0, z1);
    bx.s.add(new THREE.BoxGeometry(TH, H, 6.2 - z0), STONE, x1 - TH / 2, GY + H / 2, (z0 + 6.2) / 2);
    addBoxBlocker(x1 - TH, x1, GY, GY + H, z0, 6.2);
    bx.s.add(new THREE.BoxGeometry(TH, H, z1 - 9.8), STONE, x1 - TH / 2, GY + H / 2, (9.8 + z1) / 2);
    addBoxBlocker(x1 - TH, x1, GY, GY + H, 9.8, z1);
    bx.s.add(new THREE.BoxGeometry(TH, H - 4.6, 3.6), STONE, x1 - TH / 2, GY + 4.6 + (H - 4.6) / 2, 8);
    addBoxBlocker(x1 - TH, x1, GY + 4.6, GY + H, 6.2, 9.8);
    bx.s.add(new THREE.BoxGeometry(x1 - x0, H, TH), STONE, (x0 + x1) / 2, GY + H / 2, z0 + TH / 2);
    addBoxBlocker(x0, x1, GY, GY + H, z0, z0 + TH);
    bx.s.add(new THREE.BoxGeometry(x1 - x0, H, TH), STONE, (x0 + x1) / 2, GY + H / 2, z1 - TH / 2);
    addBoxBlocker(x0, x1, GY, GY + H, z1 - TH, z1);
    // Verzauberte Decke (dunkles Nachtblau)
    const ceil = new THREE.PlaneGeometry(x1 - x0 - 0.4, z1 - z0 - 0.4);
    ceil.rotateX(Math.PI / 2);
    ceil.translate((x0 + x1) / 2, GY + H - 1.2, (z0 + z1) / 2);
    bx.d.addRaw(ceil, 0x0c1330);
    gableRoof(bx.r, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, GY + H, 7.5, ROOF, true);
    // Dachgauben
    for (const side of [-1, 1]) {
      for (const dz of [-6, 8, 22]) {
        const dx = (x0 + x1) / 2 + side * 7.2;
        bx.s.add(new THREE.BoxGeometry(1.8, 2.2, 1.6), STONE, dx, GY + H + 2.6, dz);
        gableRoof(bx.r, dx, dz, 1.8, 1.6, GY + H + 3.7, 1.3, ROOF_DARK, false);
        bx.wb.add(new THREE.PlaneGeometry(0.9, 1.1), WINDOW_WARM,
          dx + side * 0.92, GY + H + 2.7, dz, side > 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
    // Schornsteine
    for (const dz of [0, 16]) {
      bx.s.add(new THREE.BoxGeometry(1.3, 4.5, 1.3), STONE_DARK, x0 + 3, GY + H + 6, dz);
      bx.s.add(new THREE.BoxGeometry(1.7, 0.5, 1.7), STONE_TRIM, x0 + 3, GY + H + 8.3, dz);
    }
    // Ecktürmchen
    tower(bx, x0 + 1, z0 + 1, 2.4, 20, { windows: false });
    tower(bx, x1 - 1, z0 + 1, 2.4, 20, { windows: false });
    tower(bx, x0 + 1, z1 - 1, 2.4, 20, { windows: false });
    tower(bx, x1 - 1, z1 - 1, 2.4, 20, { windows: false });
    // Strebepfeiler + hohe Bogenfenster an der Westfassade
    for (let z = -12; z <= 30; z += 6) buttress(bx, x0, z, -Math.PI / 2, 11);
    for (let z = -9; z <= 27; z += 6) {
      archWindow(bx, x0 - 0.06, GY + 8, z, -Math.PI / 2, 1.9, 5.2);
      archWindow(bx, x0 + TH + 0.06, GY + 8, z, Math.PI / 2, 1.9, 5.2, false);
    }
    // Portal (offene Holztüren) + Bogen
    bx.w.add(new THREE.BoxGeometry(0.18, 4.4, 1.55), WOOD, x1 + 0.1, GY + 2.2, 6.2 + 0.85, 0.5);
    bx.w.add(new THREE.BoxGeometry(0.18, 4.4, 1.55), WOOD, x1 + 0.1, GY + 2.2, 9.8 - 0.85, -0.5);
    const arch2 = new THREE.TorusGeometry(1.9, 0.3, 6, 12, Math.PI);
    arch2.rotateY(Math.PI / 2);
    arch2.translate(x1 + 0.15, GY + 4.4, 8);
    bx.s.addRaw(arch2, STONE_TRIM);
    flames.push([x1 + 0.6, GY + 4.2, 5.2], [x1 + 0.6, GY + 4.2, 10.8]);

    // --- Innenausstattung ---
    // Wandpfeiler innen
    for (const pz of [-8, 0, 8, 16, 24]) {
      bx.s.add(new THREE.BoxGeometry(0.5, 11, 1.0), STONE_TRIM, x0 + TH + 0.25, GY + 5.5, pz);
      bx.s.add(new THREE.BoxGeometry(0.5, 11, 1.0), STONE_TRIM, x1 - TH - 0.25, GY + 5.5, pz);
    }
    // Podest mit Lehrertisch
    bx.s.add(new THREE.BoxGeometry(15, 0.5, 3.6), 0x8a8278, -32, GY + 0.55, -12.2);
    addPlatform(-39.5, -24.5, -14, -10.4, GY + 0.8);
    bx.w.add(new THREE.BoxGeometry(11, 0.9, 1.4), WOOD, -32, GY + 1.25, -12.2);
    addBoxBlocker(-37.5, -26.5, GY + 0.8, GY + 2.2, -12.9, -11.5);
    // 4 lange Haustische + Bänke
    for (const tx of [-38.2, -33.6, -30.4, -25.8]) {
      bx.w.add(new THREE.BoxGeometry(1.7, 0.16, 28), WOOD, tx, GY + 1.2, 9);
      bx.w.add(new THREE.BoxGeometry(1.3, 0.9, 27), WOOD_DARK, tx, GY + 0.75, 9);
      addBoxBlocker(tx - 0.85, tx + 0.85, GY + 0.3, GY + 1.3, -5, 23);
      for (const s of [-1.35, 1.35]) {
        bx.w.add(new THREE.BoxGeometry(0.55, 0.45, 27), WOOD, tx + s, GY + 0.55, 9);
        addBoxBlocker(tx + s - 0.28, tx + s + 0.28, GY + 0.3, GY + 0.78, -4.5, 22.5);
      }
    }
    for (const fz of [-6, 2, 10, 18, 26]) {
      flames.push([x0 + TH + 0.4, GY + 5.5, fz], [x1 - TH - 0.4, GY + 5.5, fz]);
    }
    for (const lz of [-10, 4, 18]) {
      const l = new THREE.PointLight(0xffc274, 26, 48, 1.6);
      l.position.set(-32, GY + 7.5, lz);
      scene.add(l);
    }
  }

  // ===== Bibliothek (Ostflügel) mit Kreuzgang =====
  {
    const cx = 32, cz = 8, w = 20, d = 36, H = 12;
    bx.s.add(new THREE.BoxGeometry(w, H, d), STONE, cx, GY + H / 2, cz);
    addBoxBlocker(cx - w / 2, cx + w / 2, GY, GY + H, cz - d / 2, cz + d / 2);
    bx.s.add(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), STONE_TRIM, cx, GY + H - 0.4, cz);
    gableRoof(bx.r, cx, cz, w, d, GY + H, 6, ROOF_DARK, true);
    // Glockentürmchen
    bx.s.add(new THREE.BoxGeometry(3, 4, 3), STONE, cx, GY + H + 7, cz - 8);
    bx.r.add(new THREE.ConeGeometry(2.4, 3.4, 4), ROOF, cx, GY + H + 10.7, cz - 8, Math.PI / 4);
    bx.d.add(new THREE.SphereGeometry(0.55, 8, 6), GOLD, cx, GY + H + 8.2, cz - 8);
    tower(bx, cx - w / 2 + 1, cz - d / 2 + 1, 2.2, 17, { windows: false });
    tower(bx, cx + w / 2 - 1, cz + d / 2 - 1, 2.2, 17, { windows: false });
    for (let z = -6; z <= 22; z += 7) {
      archWindow(bx, cx + w / 2 + 0.06, GY + 6.5, z, Math.PI / 2, 1.6, 3.6);
      archWindow(bx, cx - w / 2 - 0.06, GY + 7.5, z, -Math.PI / 2, 1.6, 3.6, false);
    }
    // Kreuzgang (Arkaden zum Innenhof)
    const ax = cx - w / 2 - 2.6;
    bx.s.add(new THREE.BoxGeometry(3.4, 0.35, 30), STONE_TRIM, ax + 0.6, GY + 4.1, cz);
    for (let z = -6; z <= 22; z += 4.7) {
      bx.s.add(new THREE.CylinderGeometry(0.32, 0.38, 4.0, 8), STONE_TRIM, ax, GY + 2, z);
      addCircleBlocker(ax, z, 0.45, GY, GY + 4);
      const a = new THREE.TorusGeometry(1.6, 0.22, 6, 10, Math.PI);
      a.rotateY(Math.PI / 2);
      a.translate(ax, GY + 4.0 - 1.6 + 0.9, z + 2.35);
      bx.s.addRaw(a, STONE_TRIM);
    }
  }

  // ===== Bergfried mit Uhr =====
  {
    const cx = 0, w = 24, z0 = -46, z1 = -22, H = 28;
    const cz = (z0 + z1) / 2;
    bx.s.add(new THREE.BoxGeometry(w, H, z1 - z0), STONE, cx, GY + H / 2, cz);
    addBoxBlocker(cx - w / 2, cx + w / 2, GY, GY + H, z0, z1);
    // Sockel + Gesimse
    bx.s.add(new THREE.BoxGeometry(w + 1.4, 2.4, z1 - z0 + 1.4), STONE_DARK, cx, GY + 1.2, cz);
    for (const gy of [10, 20]) {
      bx.s.add(new THREE.BoxGeometry(w + 0.7, 0.45, z1 - z0 + 0.7), STONE_TRIM, cx, GY + gy, cz);
    }
    const pr = (w / 2 + 0.5) / 0.707;
    const pyr = new THREE.ConeGeometry(pr, 10, 4);
    pyr.rotateY(Math.PI / 4);
    pyr.translate(cx, GY + H + 5, cz);
    bx.r.addRaw(pyr, ROOF);
    bx.d.add(new THREE.SphereGeometry(0.5, 6, 5), GOLD, cx, GY + H + 10.4, cz);
    tower(bx, cx - w / 2, z1, 3.4, 36, { flag: 0 });
    tower(bx, cx + w / 2, z1, 3.4, 36, { flag: 3 });
    tower(bx, cx - w / 2, z0, 3.4, 33, { windows: false });
    tower(bx, cx + w / 2, z0, 3.4, 33, { windows: false });
    // Uhr
    bx.d.add(new THREE.CircleGeometry(3.2, 20), CREAM, cx, GY + 19, z1 + 0.08);
    const ring = new THREE.TorusGeometry(3.2, 0.22, 6, 20);
    ring.translate(cx, GY + 19, z1 + 0.1);
    bx.d.addRaw(ring, GOLD);
    const hand1 = new THREE.BoxGeometry(0.22, 2.4, 0.08);
    hand1.translate(0, 1.1, 0); hand1.rotateZ(-0.9); hand1.translate(cx, GY + 19, z1 + 0.16);
    bx.d.addRaw(hand1, 0x2a2a2a);
    const hand2 = new THREE.BoxGeometry(0.18, 1.7, 0.08);
    hand2.translate(0, 0.8, 0); hand2.rotateZ(2.4); hand2.translate(cx, GY + 19, z1 + 0.16);
    bx.d.addRaw(hand2, 0x2a2a2a);
    // Portal-Nische mit Holztür
    bx.d.add(new THREE.BoxGeometry(5, 7, 0.4), 0x241a10, cx, GY + 3.5, z1 + 0.1);
    bx.w.add(new THREE.BoxGeometry(3.4, 5.2, 0.25), WOOD_DARK, cx, GY + 2.6, z1 + 0.3);
    const ka = new THREE.TorusGeometry(2.5, 0.4, 6, 12, Math.PI);
    ka.translate(cx, GY + 7, z1 + 0.2);
    bx.s.addRaw(ka, STONE_TRIM);
    flames.push([cx - 3.4, GY + 4.5, z1 + 0.6], [cx + 3.4, GY + 4.5, z1 + 0.6]);
    for (let wy = GY + 12; wy <= GY + 24; wy += 6) {
      for (const wx of [-7, 0, 7]) archWindow(bx, cx + wx, wy, z1 + 0.06, 0, 1.5, 2.8);
    }
  }

  // ===== Astronomieturm + Bogenbrücke =====
  {
    const x = 0, z = -68;
    tower(bx, x, z, 6.5, 46, { roof: 'cone', flag: 2 });
    bx.s.add(new THREE.CylinderGeometry(8, 8, 1.2, 12), STONE_TRIM, x, GY + 38, z);
    // Zinnen auf dem Balkon
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      bx.s.add(new THREE.BoxGeometry(0.7, 0.9, 0.5), STONE_DARK,
        x + Math.sin(a) * 7.6, GY + 39, z + Math.cos(a) * 7.6, a);
    }
    tower(bx, x - 7.5, z + 2, 2.0, 26, { windows: false });
    tower(bx, x + 7.5, z - 2, 2.0, 30, { windows: false });
    flames.push([x - 4.9, GY + 3.5, z + 4.4], [x + 4.9, GY + 3.5, z + 4.4]);
    // Überdachte Bogenbrücke vom Bergfried (Deko in der Höhe)
    bx.s.add(new THREE.BoxGeometry(3, 0.6, 16), STONE, 0, GY + 24, -54);
    for (const side of [-1, 1]) {
      bx.s.add(new THREE.BoxGeometry(0.3, 1.1, 16), STONE_TRIM, side * 1.35, GY + 24.8, -54);
    }
    for (const az of [-50, -58]) {
      const a = new THREE.TorusGeometry(3.4, 0.7, 6, 12, Math.PI);
      a.rotateY(Math.PI / 2);
      a.translate(0, GY + 20, az);
      bx.s.addRaw(a, STONE_DARK);
    }
    bx.s.add(new THREE.BoxGeometry(2.4, 20, 2.4), STONE_DARK, 0, GY + 10, -54);
    addBoxBlocker(-1.2, 1.2, GY, GY + 20, -55.2, -52.8);
  }

  // ===== Innenhof =====
  {
    const cob = new THREE.CircleGeometry(19, 28);
    cob.rotateX(-Math.PI / 2);
    cob.translate(0, GY + 0.06, 12);
    bx.s.addRaw(cob, 0x9b968c);
    bx.s.add(new THREE.CylinderGeometry(3.2, 3.5, 1.0, 14), STONE_DARK, 0, GY + 0.5, 12);
    bx.s.add(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 8), STONE, 0, GY + 1.6, 12);
    bx.s.add(new THREE.CylinderGeometry(1.3, 1.5, 0.35, 10), STONE_TRIM, 0, GY + 2.9, 12);
    addCircleBlocker(0, 12, 3.6, GY, GY + 2);
    for (const [lx, lz] of [[-13, 2], [13, 2], [-13, 26], [13, 26]]) {
      bx.d.add(new THREE.CylinderGeometry(0.12, 0.18, 3.6, 6), IRON, lx, GY + 1.8, lz);
      bx.d.add(new THREE.BoxGeometry(0.7, 0.8, 0.7), IRON, lx, GY + 3.9, lz);
      bx.wb.add(new THREE.BoxGeometry(0.5, 0.55, 0.5), WINDOW_WARM, lx, GY + 3.88, lz);
      addCircleBlocker(lx, lz, 0.35, GY, GY + 3.5);
      flames.push([lx, GY + 3.9, lz]);
    }
    const l = new THREE.PointLight(0xffb066, 0, 44, 1.8);
    l.position.set(0, GY + 6, 12);
    scene.add(l); nightLights.push(l);
    for (const [bxx, bz, ry] of [[-8, 12, Math.PI / 2], [8, 12, -Math.PI / 2]]) {
      bx.w.add(new THREE.BoxGeometry(2.6, 0.12, 0.9), WOOD, bxx, GY + 0.55, bz, ry);
      bx.s.add(new THREE.BoxGeometry(2.4, 0.5, 0.6), STONE_DARK, bxx, GY + 0.25, bz, ry);
      addCircleBlocker(bxx, bz, 0.9, GY, GY + 0.8);
    }
  }

  // ===== Nordgarten =====
  for (const [hx, hz, hw, hd] of [[-20, -58, 14, 2], [20, -58, 14, 2], [-20, -66, 14, 2], [20, -66, 14, 2]]) {
    bx.d.add(new THREE.BoxGeometry(hw, 2.0, hd), 0x3c5a2e, hx, GY + 1.0, hz);
    addBoxBlocker(hx - hw / 2, hx + hw / 2, GY, GY + 2, hz - hd / 2, hz + hd / 2);
  }

  // ===== Viadukt =====
  {
    const z0 = 64, z1 = 124;
    const y0 = terrainHeight(0, z0), y1 = terrainHeight(0, z1);
    const ang = Math.atan2(y1 - y0, z1 - z0);
    const len = Math.hypot(z1 - z0, y1 - y0);
    const mid = { y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    const deck = new THREE.BoxGeometry(7, 1.1, len + 2);
    deck.rotateX(-ang);
    deck.translate(0, mid.y - 0.5, mid.z);
    bx.s.addRaw(deck, STONE);
    addPlatform(-3.5, 3.5, z0, z1, y0 + 0.05, y1 + 0.05, z0, z1);
    const SEGS = 6;
    for (let i = 0; i < SEGS; i++) {
      const za = z0 + (i / SEGS) * (z1 - z0), zb = z0 + ((i + 1) / SEGS) * (z1 - z0);
      const ybm = y0 + (y1 - y0) * ((i + 0.5) / SEGS);
      const segLen = (zb - za) / Math.cos(ang);
      for (const side of [-1, 1]) {
        const par = new THREE.BoxGeometry(0.5, 1.15, segLen);
        par.rotateX(-ang);
        par.translate(side * 3.3, ybm + 0.62, (za + zb) / 2);
        bx.s.addRaw(par, STONE_DARK);
        addBoxBlocker(side * 3.3 - 0.3, side * 3.3 + 0.3, ybm - 0.6, ybm + 1.25, za, zb);
      }
    }
    for (const pz of [76, 91, 106]) {
      const ty = y0 + (y1 - y0) * ((pz - z0) / (z1 - z0));
      const bh = ty - 1.0;
      bx.s.add(new THREE.BoxGeometry(6, bh, 4.5), STONE_DARK, 0, 1.0 + bh / 2 - 0.6, pz);
      bx.s.add(new THREE.BoxGeometry(7, 0.8, 5.3), STONE_TRIM, 0, ty - 1.4, pz);
      addBoxBlocker(-3, 3, 0, ty, pz - 2.25, pz + 2.25);
    }
    for (const az of [83.5, 98.5]) {
      const ty = y0 + (y1 - y0) * ((az - z0) / (z1 - z0));
      const ar = new THREE.TorusGeometry(5.2, 1.0, 6, 14, Math.PI);
      ar.rotateY(Math.PI / 2);
      ar.translate(0, ty - 6.2, az);
      bx.s.addRaw(ar, STONE_DARK);
    }
    for (const [lz, ly] of [[z0 + 2, y0], [z1 - 2, y1]]) {
      for (const side of [-1, 1]) {
        bx.d.add(new THREE.CylinderGeometry(0.1, 0.16, 3.0, 6), IRON, side * 2.9, ly + 1.5, lz);
        bx.wb.add(new THREE.BoxGeometry(0.45, 0.5, 0.45), WINDOW_WARM, side * 2.9, ly + 3.2, lz);
        flames.push([side * 2.9, ly + 3.25, lz]);
      }
    }
  }

  // ===== Verzauberte Decke: Sterne im Großen Saal =====
  {
    const N = 140;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = -40 + rng() * 17;
      positions[i * 3 + 1] = GY + 12.2 + rng() * 1.3;
      positions[i * 3 + 2] = -13 + rng() * 42;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const hallStars = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xaFC4ff, size: 0.09, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(hallStars);
  }

  // ===== Schwebende Kerzen =====
  const candleCount = 64;
  const candles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.05, 0.065, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xf5e6c0 }),
    candleCount
  );
  candles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const candleData = [];
  const candleGlowPos = new Float32Array(candleCount * 3);
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < candleCount; i++) {
      const cx = -39 + rng() * 15.5;
      const cy = GY + 7.5 + rng() * 3.5;
      const cz = -12 + rng() * 40;
      candleData.push({ x: cx, y: cy, z: cz, phase: rng() * Math.PI * 2, speed: 0.5 + rng() * 0.8 });
      m.setPosition(cx, cy, cz);
      candles.setMatrixAt(i, m);
    }
    scene.add(candles);
  }
  const candleGlowGeo = new THREE.BufferGeometry();
  candleGlowGeo.setAttribute('position', new THREE.BufferAttribute(candleGlowPos, 3));

  // ===== Meshes bauen =====
  const castleMesh = bx.s.build(mats.stone);
  const roofMesh = bx.r.build(mats.roof);
  const woodMesh = bx.w.build(mats.wood);
  const decoMesh = bx.d.build(mats.deco);
  const windowMesh = bx.wb.build(mats.window, { castShadow: false, receiveShadow: false });
  for (const m of [castleMesh, roofMesh, woodMesh, decoMesh, windowMesh]) {
    if (m) scene.add(m);
  }

  const windowMat = mats.window;
  const _m = new THREE.Matrix4();

  return {
    flames,
    nightLights,
    windowMat,
    setGlowTexture(tex) {
      const candleGlow = new THREE.Points(candleGlowGeo, new THREE.PointsMaterial({
        map: tex, color: 0xffc36b, size: 1.1, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      scene.add(candleGlow);
    },
    update(dt, time, nightGlow) {
      windowMat.color.setRGB(
        0.16 + (1.55 - 0.16) * nightGlow,
        0.19 + (1.30 - 0.19) * nightGlow,
        0.26 + (1.00 - 0.26) * nightGlow
      );
      for (const l of nightLights) l.intensity = 26 * nightGlow;
      for (let i = 0; i < candleCount; i++) {
        const c = candleData[i];
        const y = c.y + Math.sin(time * c.speed + c.phase) * 0.35;
        _m.setPosition(c.x, y, c.z);
        candles.setMatrixAt(i, _m);
        candleGlowPos[i * 3] = c.x;
        candleGlowPos[i * 3 + 1] = y + 0.32;
        candleGlowPos[i * 3 + 2] = c.z;
      }
      candles.instanceMatrix.needsUpdate = true;
      candleGlowGeo.attributes.position.needsUpdate = true;
    },
  };
}
