// Dorf "Eulenbrück": 6 Fachwerkhäuser um einen Platz, das Gasthaus "Zum
// Singenden Kessel" ist begehbar (Kamin heilt), Ortsschild am Eingang.
// Bahnhof + Gleis + Zug leben in train.js (eigene Datei).

import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, addCircleBlocker } from './geo.js';
import { terrainHeight, DORF } from './terrain.js';
import { mulberry32 } from './noise.js';
import { getMaterials } from './materials.js';

const PLASTER = 0xe8ddc0;
const WOOD_FRAME = 0x5c4530;
const WOOD_COL = 0x6d5236;
const ROOF_COL = 0x6b4038;
const WINDOW_WARM = 0xffd98c;
const STONE_COL = 0x8b847b;
const SIGN_POS = { x: -76, z: -195 }; // am Wegknick, Dorf-Eingang von Norden

const KAMIN_HEAL_RANGE = 2.5;
const KAMIN_HEAL_COOLDOWN = 60;

// 5 kleinere Häuser ringförmig um den Platz, Winkel meiden π/2 (dort steht
// das Gasthaus). ry über die Formel für "Front (lokal -Z) zeigt zur
// Platzmitte" berechnet: front = (-sin(ry), -cos(ry)) soll der einwärts
// gerichteten Richtung (-cos(a), -sin(a)) entsprechen → ry = π/2 − a.
const HOUSE_DEFS = [
  { a: -2.2, r: 21, w: 5.0, d: 4.4, h: 3.6, seed: 1 },
  { a: -1.1, r: 23, w: 4.6, d: 4.2, h: 3.4, seed: 2 },
  { a: 0.3, r: 21, w: 4.8, d: 4.4, h: 3.5, seed: 3 },
  { a: 2.4, r: 22, w: 5.0, d: 4.2, h: 3.6, seed: 4 },
  { a: 3.9, r: 21, w: 4.8, d: 4.4, h: 3.5, seed: 5 },
];
// Gasthaus: absichtlich NICHT rotiert (ry=0) — seine Wand-Blocker müssen
// achsenparallel bleiben, damit das begehbare Innere sauber kollidiert.
// Position südlich der Platzmitte, Front (-Z, Türlücke) zeigt naturgemäß
// nach Norden zurück zum Platz/Zugang.
export const GASTHAUS = { x: DORF.x, z: DORF.z + 20, w: 9, d: 7.5, h: 5.2 };

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

// Giebeldach als dreiseitiges Prisma (Muster aus castle.js, hier lokal
// nachgebaut — castle.js exportiert seine eigene Version nicht).
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

// Baut ein einzelnes (solides, nicht begehbares) Fachwerkhaus.
function buildHouse(batches, cx, cz, ry, w, d, h, groundY, seed) {
  const put = (batch, geo, color) => {
    geo.rotateY(ry);
    geo.translate(cx, groundY, cz);
    batch.addRaw(geo, color);
  };
  const body = new THREE.BoxGeometry(w, h, d);
  body.translate(0, h / 2, 0);
  put(batches.wall, body, PLASTER);

  gableRoof(batches.roof, cx, cz, w, d, groundY + h, h * 0.55, ROOF_COL, ry);

  const chimH = 1.5;
  const chim = new THREE.BoxGeometry(0.55, chimH, 0.55);
  chim.translate(w * 0.28, h + h * 0.3 + chimH / 2, d * 0.05);
  put(batches.wall, jitter(chim, 0.03, seed + 900), STONE_COL);

  const door = new THREE.PlaneGeometry(0.9, 1.9);
  door.translate(0, 0.95, d / 2 + 0.01);
  put(batches.wood, door, WOOD_FRAME);

  for (const side of [-1, 1]) {
    const win = new THREE.PlaneGeometry(0.7, 0.9);
    win.translate(side * w * 0.28, h * 0.55, d / 2 + 0.01);
    put(batches.window, win, WINDOW_WARM);
  }
  // Fachwerk-Deko-Balken (dünne dunkle Streifen auf der Fassade)
  for (const bx of [-w * 0.36, w * 0.36]) {
    const beam = new THREE.BoxGeometry(0.1, h * 0.9, 0.05);
    beam.translate(bx, h / 2, d / 2 + 0.005);
    put(batches.wood, beam, WOOD_FRAME);
  }

  addCircleBlocker(cx, cz, Math.max(w, d) / 2 + 0.3, groundY - 1, groundY + h);
}

export function buildVillage(scene, glowTex, hud, audio, health, fx) {
  const mats = getMaterials();
  const groundY = DORF.h; // die Dorf-Senke ist plangeflacht auf DORF.h

  const batches = {
    wall: new GeoBatch(), roof: new GeoBatch(), wood: new GeoBatch(), window: new GeoBatch(),
  };

  // ---------- 5 Häuser im Ring ----------
  for (const hDef of HOUSE_DEFS) {
    const cx = DORF.x + Math.cos(hDef.a) * hDef.r;
    const cz = DORF.z + Math.sin(hDef.a) * hDef.r;
    const ry = Math.PI / 2 - hDef.a;
    buildHouse(batches, cx, cz, ry, hDef.w, hDef.d, hDef.h, groundY, hDef.seed);
  }

  // ---------- Gasthaus "Zum Singenden Kessel" (begehbar) ----------
  const { x: gx, z: gz, w: gw, d: gd, h: gh } = GASTHAUS;
  const wallT = 0.4;
  const halfW = gw / 2, halfD = gd / 2, doorHalfW = 1.3;
  const gy = groundY; // Boden der Halle = Dorf-Senkenhöhe

  // Rückwand (Süden, solide)
  batches.wall.add(new THREE.BoxGeometry(gw, gh, wallT), PLASTER, gx, gy + gh / 2, gz + halfD - wallT / 2);
  addBoxBlocker(gx - halfW, gx + halfW, gy, gy + gh, gz + halfD - wallT, gz + halfD);
  // Seitenwände (West/Ost, solide)
  batches.wall.add(new THREE.BoxGeometry(wallT, gh, gd), PLASTER, gx - halfW + wallT / 2, gy + gh / 2, gz);
  addBoxBlocker(gx - halfW, gx - halfW + wallT, gy, gy + gh, gz - halfD, gz + halfD);
  batches.wall.add(new THREE.BoxGeometry(wallT, gh, gd), PLASTER, gx + halfW - wallT / 2, gy + gh / 2, gz);
  addBoxBlocker(gx + halfW - wallT, gx + halfW, gy, gy + gh, gz - halfD, gz + halfD);
  // Frontwand (Norden), zwei Segmente mit Türlücke in der Mitte
  const segW = halfW - doorHalfW;
  batches.wall.add(new THREE.BoxGeometry(segW, gh, wallT), PLASTER, gx - doorHalfW - segW / 2, gy + gh / 2, gz - halfD + wallT / 2);
  addBoxBlocker(gx - halfW, gx - doorHalfW, gy, gy + gh, gz - halfD, gz - halfD + wallT);
  batches.wall.add(new THREE.BoxGeometry(segW, gh, wallT), PLASTER, gx + doorHalfW + segW / 2, gy + gh / 2, gz - halfD + wallT / 2);
  addBoxBlocker(gx + doorHalfW, gx + halfW, gy, gy + gh, gz - halfD, gz - halfD + wallT);
  // Türsturz (Deko, schließt die Lücke oben ab)
  batches.wood.add(new THREE.BoxGeometry(doorHalfW * 2 + 0.3, 0.3, wallT), WOOD_FRAME, gx, gy + 2.15, gz - halfD + wallT / 2);
  // Holzboden
  batches.wood.add(new THREE.BoxGeometry(gw - wallT * 2, 0.1, gd - wallT * 2), WOOD_COL, gx, gy + 0.05, gz);
  gableRoof(batches.roof, gx, gz, gw, gd, gy + gh, gh * 0.5, ROOF_COL, 0);
  // Fenster in den Seitenwänden
  for (const side of [-1, 1]) {
    const win = new THREE.PlaneGeometry(1.0, 1.2);
    win.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
    win.translate(gx + side * (halfW - wallT / 2 - 0.01), gy + gh * 0.55, gz - halfD * 0.35);
    batches.window.addRaw(win, WINDOW_WARM);
  }
  // Schild über der Tür
  batches.wood.add(new THREE.BoxGeometry(doorHalfW * 2.4, 0.6, 0.08), WOOD_FRAME, gx, gy + gh * 0.62, gz - halfD - 0.05);

  // Tresen + 2 Tische im Inneren
  batches.wood.add(new THREE.BoxGeometry(gw * 0.45, 1.0, 0.6), WOOD_COL, gx, gy + 0.5, gz + halfD - 1.1);
  for (const tx of [-2, 2]) {
    const top = new THREE.CylinderGeometry(0.55, 0.55, 0.08, 10);
    top.translate(gx + tx, gy + 0.75, gz + 0.2);
    batches.wood.addRaw(top, WOOD_COL);
    const leg = new THREE.CylinderGeometry(0.08, 0.08, 0.75, 6);
    leg.translate(gx + tx, gy + 0.375, gz + 0.2);
    batches.wood.addRaw(leg, WOOD_FRAME);
  }

  // ---------- Kamin (an der Westwand) — das EINE neue Dauerlicht ----------
  const kaminPos = { x: gx - halfW + 0.5, y: gy, z: gz - 1.6 };
  batches.wall.add(new THREE.BoxGeometry(1.0, 1.4, 0.8), STONE_COL, kaminPos.x, kaminPos.y + 0.7, kaminPos.z);
  const kaminGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const kaminGlow = new THREE.Sprite(kaminGlowMat);
  kaminGlow.position.set(kaminPos.x + 0.35, kaminPos.y + 0.55, kaminPos.z);
  kaminGlow.scale.set(0.9, 1.1, 1);
  scene.add(kaminGlow);
  const kaminLight = new THREE.PointLight(0xff9a3c, 6, 8, 2);
  kaminLight.position.set(kaminPos.x + 0.5, kaminPos.y + 0.7, kaminPos.z);
  scene.add(kaminLight);

  // Rauch aus dem Gasthaus-Schornstein (Muster: LifeSystem-Hagrid-Rauch, hier lokal)
  const smokeMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9aa0a8, transparent: true, opacity: 0.25, depthWrite: false,
  });
  const smoke = [];
  const chimTopY = gy + gh + gh * 0.5 + 1.2;
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Sprite(smokeMat.clone());
    s.userData.t = i / 6;
    scene.add(s);
    smoke.push(s);
  }

  // ---------- Dorfplatz-Deko ----------
  const plazaBatch = new GeoBatch();
  // Kleiner Zierbrunnen (heilt NICHT — reine Deko, der Innenhof-Brunnen bleibt einzigartig)
  {
    const py = terrainHeight(DORF.x, DORF.z);
    plazaBatch.add(new THREE.CylinderGeometry(1.1, 1.2, 0.5, 12), STONE_COL, DORF.x, py + 0.25, DORF.z);
    plazaBatch.add(new THREE.CylinderGeometry(0.15, 0.18, 0.9, 8), STONE_COL, DORF.x, py + 0.7, DORF.z);
  }
  // 4 Laternenpfosten (nur Glow-Sprites, KEINE Punktlichter — Lichtbudget)
  const lanternGlows = [];
  for (const a of [0.78, 2.36, 3.93, 5.5]) {
    const lx = DORF.x + Math.cos(a) * 9, lz = DORF.z + Math.sin(a) * 9;
    const ly = terrainHeight(lx, lz);
    plazaBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6), 0x2a2a30, lx, ly + 1.3, lz);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffd98c, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.position.set(lx, ly + 2.7, lz);
    glow.scale.setScalar(1.3);
    scene.add(glow);
    lanternGlows.push(glow);
  }
  // 2 Marktstände (Deko)
  for (const [sx, sz, cloth] of [[-8, -6, 0xa62b2b], [7, -8, 0x2b4b9b]]) {
    const mx = DORF.x + sx, mz = DORF.z + sz;
    const my = terrainHeight(mx, mz);
    plazaBatch.add(new THREE.BoxGeometry(1.8, 0.9, 1.0), WOOD_COL, mx, my + 0.45, mz);
    for (const [px, pz] of [[-0.8, -0.4], [0.8, -0.4], [-0.8, 0.4], [0.8, 0.4]]) {
      plazaBatch.add(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), WOOD_FRAME, mx + px, my + 1.7, mz + pz);
    }
    const roofG = new THREE.BoxGeometry(2.1, 0.08, 1.3);
    roofG.translate(0, 0, 0);
    plazaBatch.add(roofG, cloth, mx, my + 2.5, mz);
  }

  // ---------- Ortsschild ----------
  const signY = terrainHeight(SIGN_POS.x, SIGN_POS.z);
  plazaBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), WOOD_FRAME, SIGN_POS.x - 0.4, signY + 0.8, SIGN_POS.z);
  plazaBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), WOOD_FRAME, SIGN_POS.x + 0.4, signY + 0.8, SIGN_POS.z);
  plazaBatch.add(new THREE.BoxGeometry(1.5, 0.6, 0.06), WOOD_COL, SIGN_POS.x, signY + 1.5, SIGN_POS.z);

  const meshes = [
    batches.wall.build(mats.stone),
    batches.roof.build(mats.roof),
    batches.wood.build(mats.wood),
    batches.window.build(mats.window, { castShadow: false, receiveShadow: false }),
    plazaBatch.build(mats.stone),
  ];
  for (const m of meshes) if (m) scene.add(m);

  const village = {
    signSeen: false,
    _kaminCooldown: 0,
    _time: 0,

    update(dt, player) {
      this._time += dt;
      if (this._kaminCooldown > 0) this._kaminCooldown -= dt;

      // Kamin-Flacker (Muster: castle.js-Flammen)
      const flick = 0.85 + Math.sin(this._time * 11) * 0.1 + Math.sin(this._time * 23) * 0.06;
      kaminGlow.scale.set(0.9 * flick, 1.1 * flick, 1);
      kaminLight.intensity = 6 * flick;

      // Rauch steigt auf
      for (const s of smoke) {
        s.userData.t += dt * 0.1;
        if (s.userData.t > 1) s.userData.t -= 1;
        const k = s.userData.t;
        s.position.set(
          gx - halfW + 0.5 + Math.sin(k * 9 + this._time * 0.3) * (0.3 + k * 1.6),
          chimTopY + k * 7,
          gz - 1.6 + Math.cos(k * 7) * (0.25 + k * 1.2)
        );
        const sc = 0.7 + k * 2.6;
        s.scale.set(sc, sc, 1);
        s.material.opacity = 0.22 * (1 - k);
      }

      // Laternen glühen nachts (grobe Näherung: immer sichtbar, Opacity über
      // Tageszeit zu steuern bräuchte skyState hier — Village bekommt keins,
      // daher fest auf "immer sanft an" — liest sich tagsüber wie Dekoration,
      // stört nicht).
      for (const g of lanternGlows) g.material.opacity = 0.55;

      if (!player) return;

      // Ortsschild-Toast (einmalig)
      if (!this.signSeen) {
        const dx = player.pos.x - SIGN_POS.x, dz = player.pos.z - SIGN_POS.z;
        if (dx * dx + dz * dz < 25) {
          this.signSeen = true;
          hud?.showToast('„Willkommen in Eulenbrück — Rast, Reisende, hier gibt es warmen Kessel und ein Bett."', 4.5);
        }
      }

      // Kamin-Heilung (Muster: health.js-Brunnenheilung, eigener Cooldown)
      if (this._kaminCooldown <= 0 && health.hearts < health.maxHearts) {
        const dx = player.pos.x - (kaminPos.x + 0.5), dz = player.pos.z - kaminPos.z;
        if (dx * dx + dz * dz < KAMIN_HEAL_RANGE * KAMIN_HEAL_RANGE) {
          health.hearts = health.maxHearts;
          this._kaminCooldown = KAMIN_HEAL_COOLDOWN;
          hud?.setHearts(health.hearts, health.maxHearts);
          fx?.burst({ x: player.pos.x, y: player.pos.y + 1, z: player.pos.z }, 0xff9a3c, 20, 3, { gravity: -2, life: 0.9 });
          audio?.chime?.();
          hud?.showToast('Du wärmst dich am Kamin. ♥ voll!', 2.5);
        }
      }
    },
  };
  return village;
}
