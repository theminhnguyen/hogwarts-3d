// Bahnhof "Eulenbrück", Gleis-Trasse mit Tunnelportalen und die Dampflok
// mit Fahrplan. Der Zug fährt rein dekorativ (kein Einsteigen) — Fahrplan:
// alle 240s Abfahrt am einen Portal, Halt am Bahnhof (20s), Weiterfahrt zum
// anderen Portal, danach unsichtbar bis zur nächsten Runde (Richtung
// wechselt dann). Alles prozedural, kein externes Modell.

import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, addPlatform } from './geo.js';
import { terrainHeight, TRASSE, BAHNHOF } from './terrain.js';
import { getMaterials } from './materials.js';
import { smoothstep } from './noise.js';

const CYCLE = 240;
const TRAVEL_TO_STATION = 40;
const HALT_DUR = 20;
const TRAVEL_TO_END = 50;
// Arc-Length-Anteil des Bahnhofs auf der Gesamtkurve, aus den TRASSE-
// Geradenlängen abgeschätzt (CatmullRom weicht davon nur minimal ab — für
// die Fahrplan-Zeitsteuerung reicht die Näherung völlig).
const T_AT_STATION = 0.385;
const WAGON_GAP = 5.5; // m "Achsabstand" entlang der Kurve zwischen den Wagen
const RAIL_GAUGE = 0.75;

function segAngle(ax, az, bx, bz) { return Math.atan2(bx - ax, bz - az); }

// ---------- Gleis: 2 Schienen + Schwellen entlang TRASSE ----------
function buildTrack(railBatch, sleeperBatch) {
  for (let i = 0; i < TRASSE.length - 1; i++) {
    const [ax, az] = TRASSE[i], [bx, bz] = TRASSE[i + 1];
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const ang = segAngle(ax, az, bx, bz);
    const midX = (ax + bx) / 2, midZ = (az + bz) / 2;
    const midY = terrainHeight(midX, midZ) + 0.06;
    for (const side of [-1, 1]) {
      const rail = new THREE.BoxGeometry(0.1, 0.14, len + 0.3);
      rail.rotateY(ang);
      rail.translate(midX + Math.cos(ang) * side * RAIL_GAUGE, midY, midZ - Math.sin(ang) * side * RAIL_GAUGE);
      railBatch.addRaw(rail, 0x3a3a3a);
    }
    const n = Math.max(2, Math.floor(len / 1.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + dx * t, z = az + dz * t;
      const y = terrainHeight(x, z) + 0.03;
      const sleeper = new THREE.BoxGeometry(1.8, 0.08, 0.24);
      sleeper.rotateY(ang);
      sleeper.translate(x, y, z);
      sleeperBatch.addRaw(sleeper, 0x4a3826);
    }
  }
}

// ---------- Tunnelportale an beiden Enden der Trasse ----------
function buildPortal(stoneBatch, blackBatch, pos, ang) {
  const py = terrainHeight(pos.x, pos.z);
  const archR = 3.0;
  for (const side of [-1, 1]) {
    const pillar = new THREE.BoxGeometry(1.0, 4.3, 1.0);
    pillar.translate(side * archR, 2.15, 0);
    pillar.rotateY(ang);
    pillar.translate(pos.x, py, pos.z);
    stoneBatch.addRaw(pillar, 0x6e6a60);
  }
  // Halbtorus (arc=π) zeichnet in Lokal-XY schon die OBERE Halbkreis-Kurve
  // (Scheitel bei lokal (0,R,0), Enden bei (±R,0,0) — genau auf Pfeilerhöhe).
  // Keine zusätzliche Z-Rotation nötig, nur die Ausrichtung entlang der Trasse.
  const arch = new THREE.TorusGeometry(archR, 0.45, 6, 12, Math.PI);
  arch.rotateY(ang);
  arch.translate(pos.x, py + 4.3, pos.z);
  stoneBatch.addRaw(arch, 0x6e6a60);
  const hole = new THREE.PlaneGeometry(archR * 1.7, 4.1);
  hole.rotateY(ang);
  hole.translate(pos.x + Math.sin(ang) * 0.35, py + 2.1, pos.z + Math.cos(ang) * 0.35);
  blackBatch.addRaw(hole, 0x000000);
}

// ---------- Bahnhof: Bahnsteig + Stationshaus + Schild ----------
function buildStation(stoneBatch, woodBatch, roofBatch, windowBatch) {
  const { x: sx, z: sz } = BAHNHOF;
  const sy = terrainHeight(sx, sz);
  const ang = segAngle(TRASSE[1][0], TRASSE[1][1], TRASSE[2][0], TRASSE[2][1]);
  const perpX = Math.cos(ang), perpZ = -Math.sin(ang);

  // Bahnsteig (begehbare Plattform, leicht erhöht neben dem Gleis)
  const platLen = 16, platW = 3.2, platH = 0.55;
  const platCx = sx + perpX * (RAIL_GAUGE + platW / 2 + 0.6);
  const platCz = sz + perpZ * (RAIL_GAUGE + platW / 2 + 0.6);
  const platGeo = new THREE.BoxGeometry(platW, platH, platLen);
  platGeo.rotateY(ang);
  platGeo.translate(platCx, sy + platH / 2, platCz);
  stoneBatch.addRaw(platGeo, 0x8b847b);
  addPlatform(platCx - platLen / 2, platCx + platLen / 2, platCz - platLen / 2, platCz + platLen / 2, sy + platH);

  // Stationshaus (klein, an der Bahnsteig-Rückseite)
  const houseW = 4.2, houseD = 3.6, houseH = 3.0;
  const hx = platCx + perpX * (platW / 2 + houseD / 2 + 0.3);
  const hz = platCz + perpZ * (platW / 2 + houseD / 2 + 0.3);
  const body = new THREE.BoxGeometry(houseW, houseH, houseD);
  body.rotateY(ang);
  body.translate(hx, sy + platH + houseH / 2, hz);
  stoneBatch.addRaw(body, 0xe8ddc0);
  const roof = new THREE.CylinderGeometry((houseW / 2 + 0.4) / 0.866, (houseW / 2 + 0.4) / 0.866, houseD + 0.6, 3, 1, false, Math.PI / 2);
  roof.rotateZ(Math.PI / 2);
  const rr = (houseW / 2 + 0.4) / 0.866;
  const rsy = (houseH * 0.5) / (1.5 * rr);
  roof.scale(1, rsy, 1);
  roof.rotateY(ang);
  roof.translate(hx, sy + platH + houseH + 0.5 * rr * rsy, hz);
  roofBatch.addRaw(roof, 0x48597c);
  const winGeo = new THREE.PlaneGeometry(1.1, 1.2);
  winGeo.rotateY(ang);
  winGeo.translate(hx - Math.sin(ang) * (houseD / 2 + 0.01), sy + platH + houseH * 0.55, hz - Math.cos(ang) * (houseD / 2 + 0.01));
  windowBatch.addRaw(winGeo, 0xffd98c);

  // Ortsschild "Eulenbrück" am Bahnsteig
  const signX = platCx - Math.sin(ang) * platLen * 0.3, signZ = platCz - Math.cos(ang) * platLen * 0.3;
  woodBatch.add(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), 0x2a2a30, signX - 0.5, sy + platH + 0.75, signZ);
  woodBatch.add(new THREE.CylinderGeometry(0.05, 0.07, 1.5, 6), 0x2a2a30, signX + 0.5, sy + platH + 0.75, signZ);
  woodBatch.add(new THREE.BoxGeometry(1.6, 0.5, 0.06), 0xe8ddc0, signX, sy + platH + 1.4, signZ);
  // 2 Laternen am Bahnsteig
  const lanternGlows = [];
  for (const t of [0.2, 0.8]) {
    const lx = platCx + Math.sin(ang) * platLen * (t - 0.5), lz = platCz + Math.cos(ang) * platLen * (t - 0.5);
    woodBatch.add(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6), 0x2a2a30, lx, sy + platH + 1.1, lz);
  }
  return { platCx, platCz, lanternGlows };
}

// ---------- Lok & Wagen (Front = lokale +Z, passend zur lookAt()-Konvention) ----------
function buildLoco(glowTex) {
  const batch = new GeoBatch();
  const kessel = new THREE.CylinderGeometry(0.85, 0.85, 4.4, 10);
  kessel.rotateX(Math.PI / 2);
  kessel.translate(0, 1.25, 0.4);
  batch.addRaw(kessel, 0x2a2a2e);
  const cab = new THREE.BoxGeometry(1.8, 2.0, 1.7);
  cab.translate(0, 1.5, -2.5);
  batch.addRaw(cab, 0x5c1f1f);
  const schlot = new THREE.CylinderGeometry(0.22, 0.3, 1.2, 8);
  schlot.translate(0, 2.35, 1.7);
  batch.addRaw(schlot, 0x1a1a1a);
  for (const side of [-1, 1]) {
    const stripe = new THREE.BoxGeometry(0.05, 0.14, 4.4);
    stripe.translate(side * 0.87, 1.85, 0.4);
    batch.addRaw(stripe, 0xa62b2b);
  }
  const mesh = batch.build(getMaterials().deco);
  const group = new THREE.Group();
  if (mesh) group.add(mesh);

  const wheels = [];
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, flatShading: true });
  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.22, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const wz of [-1.5, 0, 1.5]) {
    for (const side of [-0.92, 0.92]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(side, 0.55, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  const lampMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff2c0, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lamp = new THREE.Sprite(lampMat);
  lamp.position.set(0, 1.55, 2.9);
  lamp.scale.setScalar(0.45);
  group.add(lamp);

  return { group, wheels, wheelRadius: 0.55, lamp };
}

function buildWagon() {
  const batch = new GeoBatch();
  const body = new THREE.BoxGeometry(1.8, 1.8, 3.6);
  body.translate(0, 1.15, 0);
  batch.addRaw(body, 0x3a4a5c);
  const roof = new THREE.BoxGeometry(1.9, 0.15, 3.7);
  roof.translate(0, 2.1, 0);
  batch.addRaw(roof, 0x2a2a2e);
  const mesh = batch.build(getMaterials().deco);
  const group = new THREE.Group();
  if (mesh) group.add(mesh);

  const wheels = [];
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, flatShading: true });
  const wheelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.18, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const wz of [-1.3, 1.3]) {
    for (const side of [-0.92, 0.92]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(side, 0.4, wz);
      group.add(wheel);
      wheels.push(wheel);
    }
  }
  return { group, wheels, wheelRadius: 0.4 };
}

export function buildTrain(scene, glowTex, audio) {
  const mats = getMaterials();
  const railBatch = new GeoBatch(), sleeperBatch = new GeoBatch();
  const stoneBatch = new GeoBatch(), woodBatch = new GeoBatch();
  const roofBatch = new GeoBatch(), windowBatch = new GeoBatch();
  const blackBatch = new GeoBatch();

  buildTrack(railBatch, sleeperBatch);
  buildStation(stoneBatch, woodBatch, roofBatch, windowBatch);

  const angStart = segAngle(TRASSE[0][0], TRASSE[0][1], TRASSE[1][0], TRASSE[1][1]);
  const angEnd = segAngle(TRASSE[TRASSE.length - 2][0], TRASSE[TRASSE.length - 2][1], TRASSE[TRASSE.length - 1][0], TRASSE[TRASSE.length - 1][1]);
  buildPortal(stoneBatch, blackBatch, { x: TRASSE[0][0], z: TRASSE[0][1] }, angStart + Math.PI);
  buildPortal(stoneBatch, blackBatch, { x: TRASSE[TRASSE.length - 1][0], z: TRASSE[TRASSE.length - 1][1] }, angEnd);

  const meshes = [
    railBatch.build(mats.deco, { castShadow: false }),
    sleeperBatch.build(mats.wood, { castShadow: false }),
    stoneBatch.build(mats.stone),
    woodBatch.build(mats.wood),
    roofBatch.build(mats.roof),
    windowBatch.build(mats.window, { castShadow: false, receiveShadow: false }),
    blackBatch.build(new THREE.MeshBasicMaterial({ vertexColors: true }), { castShadow: false, receiveShadow: false }),
  ];
  for (const m of meshes) if (m) scene.add(m);

  const curve = new THREE.CatmullRomCurve3(TRASSE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false);
  const curveLength = curve.getLength();

  const loco = buildLoco(glowTex);
  const wagons = [buildWagon(), buildWagon(), buildWagon()];
  const trainGroup = new THREE.Group();
  trainGroup.add(loco.group);
  for (const w of wagons) trainGroup.add(w.group);
  trainGroup.visible = false;
  scene.add(trainGroup);

  function posAtProgress(direction, progress) {
    const t = direction === 1 ? progress : 1 - progress;
    return curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
  }

  function placeCar(car, direction, progress, wheelDelta) {
    const p = Math.max(0, Math.min(1, progress));
    const pos = posAtProgress(direction, p);
    const ahead = posAtProgress(direction, Math.min(1, p + 0.003));
    const groundY = terrainHeight(pos.x, pos.z);
    car.group.position.set(pos.x, groundY + car.wheelRadius, pos.z);
    if (Math.abs(ahead.x - pos.x) > 1e-5 || Math.abs(ahead.z - pos.z) > 1e-5) {
      car.group.lookAt(ahead.x, groundY + car.wheelRadius, ahead.z);
    }
    if (wheelDelta) {
      const rot = wheelDelta / car.wheelRadius;
      for (const w of car.wheels) w.rotation.x += rot;
    }
  }

  const train = {
    timer: 0,
    direction: 1,
    phase: 'idle', // idle | toStation | halt | toEnd
    stationProgress: T_AT_STATION,
    _prevMainProgress: 0,
    _time: 0,

    update(dt, player) {
      this._time += dt;
      this.timer += dt;
      if (this.timer >= CYCLE) {
        this.timer = 0;
        this.direction *= -1;
        this.stationProgress = this.direction === 1 ? T_AT_STATION : 1 - T_AT_STATION;
      }

      let mainProgress = 0;
      if (this.timer < TRAVEL_TO_STATION) {
        if (this.phase !== 'toStation') { this.phase = 'toStation'; audio?.trainWhistle?.(); trainGroup.visible = true; }
        const f = smoothstep(0, 1, this.timer / TRAVEL_TO_STATION);
        mainProgress = f * this.stationProgress;
      } else if (this.timer < TRAVEL_TO_STATION + HALT_DUR) {
        if (this.phase !== 'halt') this.phase = 'halt';
        mainProgress = this.stationProgress;
      } else if (this.timer < TRAVEL_TO_STATION + HALT_DUR + TRAVEL_TO_END) {
        if (this.phase !== 'toEnd') { this.phase = 'toEnd'; audio?.trainWhistle?.(); }
        const f = smoothstep(0, 1, (this.timer - TRAVEL_TO_STATION - HALT_DUR) / TRAVEL_TO_END);
        mainProgress = this.stationProgress + f * (1 - this.stationProgress);
      } else {
        if (this.phase !== 'idle') { this.phase = 'idle'; trainGroup.visible = false; }
        mainProgress = 0;
      }

      if (trainGroup.visible) {
        const deltaDist = (mainProgress - this._prevMainProgress) * curveLength;
        placeCar(loco, this.direction, mainProgress, deltaDist);
        const gap = WAGON_GAP / curveLength;
        wagons.forEach((w, i) => {
          const wp = mainProgress - (i + 1) * gap;
          placeCar(w, this.direction, wp, wp > 0 ? deltaDist : 0);
        });
        // Rauch aus dem Schlot bei Fahrt
        if (this.phase !== 'halt' && Math.random() < 0.5) {
          // fx wird bewusst nicht importiert (kein zusätzlicher harter Abhängigkeitsknoten) —
          // main.js hängt bei Bedarf einen Rauch-Callback ein.
          this.onSmoke?.(loco.group.position);
        }
      }
      this._prevMainProgress = mainProgress;

      if (player) {
        const dist = trainGroup.visible
          ? Math.hypot(player.pos.x - loco.group.position.x, player.pos.z - loco.group.position.z)
          : Infinity;
        const chuff = this.phase === 'toStation' || this.phase === 'toEnd'
          ? Math.max(0, 1 - dist / 60) : 0;
        audio?.setTrainChuff?.(chuff);
      }
    },
  };
  return train;
}
