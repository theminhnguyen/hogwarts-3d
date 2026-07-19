// Besenflug & Quidditch-Ringe-Parcours: Schuppen mit einmaligem Besen-Pickup,
// Besen-Modell als Kamera-Kind (ersetzt sichtbar den Zauberstab im Flug),
// 12-Ringe-Route ab dem Feld-Mittelkreis mit Bestzeit + "Quidditch-Ass".

import * as THREE from 'three';
import { terrainHeight, QUIDDITCH } from './terrain.js';
import { addBoxBlocker } from './geo.js';
import { getMaterials } from './materials.js';
import { mulberry32 } from './noise.js';

const SHED_POS = { x: -155, z: 10 };
const FIELD = QUIDDITCH; // { x:-195, z:10, r:52, h:4 }
const RACE_TIMEOUT = 120;
const ACE_TIME = 75;
const RING_R = 2.2;
const RING_HIT = RING_R + 1.0;

// 12 Wegpunkte relativ zum Feldzentrum: Feld-Slalom → Bogen über die
// Tribünen (x=±24 bei z≈10) → weiter Bogen Richtung Seeufer (steigendes z,
// LAKE liegt bei z=230) → zurück zum Feld.
const RING_ROUTE = [
  { x: FIELD.x, z: FIELD.z - 10, h: 12 },
  { x: FIELD.x - 13, z: FIELD.z - 2, h: 14 },
  { x: FIELD.x + 13, z: FIELD.z + 6, h: 14 },
  { x: FIELD.x, z: FIELD.z + 18, h: 16 },
  { x: FIELD.x, z: FIELD.z + 40, h: 20 },
  { x: FIELD.x + 17, z: FIELD.z + 55, h: 24 },
  { x: FIELD.x + 35, z: FIELD.z + 80, h: 28 },
  { x: FIELD.x + 45, z: FIELD.z + 110, h: 32 },
  { x: FIELD.x + 40, z: FIELD.z + 140, h: 30 },
  { x: FIELD.x + 15, z: FIELD.z + 110, h: 26 },
  { x: FIELD.x, z: FIELD.z + 60, h: 20 },
  { x: FIELD.x, z: FIELD.z + 20, h: 14 },
];

function buildBroomModel() {
  const group = new THREE.Group();
  const stickMat = new THREE.MeshLambertMaterial({ color: 0x6d4a2c, flatShading: true });
  const twigMat = new THREE.MeshLambertMaterial({ color: 0x9a8a4a, flatShading: true });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.7, 6), stickMat);
  stick.position.y = 0.85;
  group.add(stick);
  const ringGeo = new THREE.TorusGeometry(0.06, 0.012, 5, 8);
  ringGeo.rotateX(Math.PI / 2);
  ringGeo.translate(0, 0.12, 0);
  group.add(new THREE.Mesh(ringGeo, stickMat));

  const rng = mulberry32(303);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.018, 0.55, 4), twigMat);
    tw.position.set(Math.cos(a) * 0.05, -0.02, Math.sin(a) * 0.05);
    tw.rotation.set(
      Math.cos(a) * 0.55 + (rng() - 0.5) * 0.15,
      a,
      Math.sin(a) * -0.55 + (rng() - 0.5) * 0.15
    );
    group.add(tw);
  }
  return group;
}

function buildShed(scene) {
  const mats = getMaterials();
  const x = SHED_POS.x, z = SHED_POS.z;
  const y = terrainHeight(x, z);
  const w = 2.6, d = 2.2, h = 2.4;
  const halfW = w / 2, halfD = d / 2;

  const wallBack = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.15), mats.wood);
  wallBack.position.set(x, y + h / 2, z - halfD);
  scene.add(wallBack);
  addBoxBlocker(x - halfW, x + halfW, y, y + h, z - halfD - 0.15, z - halfD + 0.15);
  for (const side of [-1, 1]) {
    const wallSide = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, d), mats.wood);
    wallSide.position.set(x + side * halfW, y + h / 2, z);
    scene.add(wallSide);
    addBoxBlocker(x + side * halfW - 0.15, x + side * halfW + 0.15, y, y + h, z - halfD, z + halfD);
  }
  // Einfaches Satteldach aus 2 geneigten Platten (offene Front nach +Z)
  for (const side of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.1, d + 0.35), mats.roof);
    slope.position.set(x + side * 0.42, y + h + 0.3, z);
    slope.rotation.z = side * 0.55;
    scene.add(slope);
  }
  return { x, z, y };
}

export function buildBroom(scene, camera, glowTex, hud, audio, fx, interact, wand) {
  const shed = buildShed(scene);

  const pickupBroom = buildBroomModel();
  pickupBroom.position.set(shed.x, shed.y + 1.3, shed.z - 0.9);
  pickupBroom.rotation.z = 0.3;
  pickupBroom.rotation.x = 1.5;
  scene.add(pickupBroom);

  const flightBroom = buildBroomModel();
  flightBroom.scale.setScalar(0.6);
  flightBroom.position.set(0.06, -0.5, -0.75);
  flightBroom.rotation.set(0.35, 0.15, -0.2);
  flightBroom.visible = false;
  camera.add(flightBroom);

  let besenUnlocked = false;
  let bestzeit = 0;
  let ace = false;
  let onUnlock = null, onFinish = null;
  let trailTimer = 0;

  const pickupEntry = interact.register({
    x: shed.x, z: shed.z - 0.5, r: 2.2, prompt: 'E — Besen nehmen', enabled: true,
    onInteract: () => {
      if (besenUnlocked) return;
      besenUnlocked = true;
      pickupBroom.visible = false;
      pickupEntry.enabled = false;
      hud.showToast('🧹 Ein Rennbesen! (B zum Auf-/Absteigen)', 4);
      onUnlock?.();
    },
  });

  // ---------- Quidditch-Ringe ----------
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b02f });
  const ringGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff2c0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const rings = RING_ROUTE.map((spot) => {
    const y = terrainHeight(spot.x, spot.z) + spot.h;
    const geo = new THREE.TorusGeometry(RING_R, 0.18, 8, 20);
    const mesh = new THREE.Mesh(geo, ringMat);
    mesh.position.set(spot.x, y, spot.z);
    mesh.visible = false;
    scene.add(mesh);
    const glow = new THREE.Sprite(ringGlowMat.clone());
    glow.scale.setScalar(RING_R * 2.4);
    glow.position.set(spot.x, y, spot.z);
    glow.visible = false;
    scene.add(glow);
    return { x: spot.x, y, z: spot.z, mesh, glow };
  });

  const race = { state: 'idle', idx: 0, t: 0 }; // idle|running
  let raceTime = 0;

  function setActiveRing(i) {
    for (let k = 0; k < rings.length; k++) rings[k].glow.visible = k === i;
  }

  function startRace() {
    race.state = 'running';
    race.idx = 0;
    race.t = 0;
    for (const r of rings) { r.mesh.visible = true; r.glow.visible = false; }
    setActiveRing(0);
    hud.setPuzzleStatus('🧹 Ring 1/12 — 0.0s');
  }

  function endRace(finished) {
    race.state = 'idle';
    for (const r of rings) { r.mesh.visible = false; r.glow.visible = false; }
    hud.setPuzzleStatus(null);
    if (!finished) { hud.showToast('Parcours abgebrochen.', 2.5); return; }
    const t = race.t;
    if (bestzeit === 0 || t < bestzeit) bestzeit = t;
    let msg = `🏁 Parcours geschafft in ${t.toFixed(1)}s! Bestzeit: ${bestzeit.toFixed(1)}s`;
    if (t < ACE_TIME && !ace) {
      ace = true;
      msg += ' — 🧹 Quidditch-Ass!';
    }
    hud.showToast(msg, 5.5);
    onFinish?.();
  }

  const startEntry = interact.register({
    x: FIELD.x, z: FIELD.z, r: 4, prompt: 'E — Ringe-Rennen starten', enabled: false,
    onInteract: () => { if (race.state === 'idle') startRace(); },
  });

  return {
    get besenUnlocked() { return besenUnlocked; },
    get ace() { return ace; },
    get bestzeit() { return bestzeit; },
    set onUnlock(fn) { onUnlock = fn; },
    set onFinish(fn) { onFinish = fn; },

    save() { return { besen: besenUnlocked ? 1 : 0, bestzeit, ace: ace ? 1 : 0 }; },

    restore(saved) {
      besenUnlocked = !!(saved?.besen);
      bestzeit = saved?.bestzeit || 0;
      ace = !!(saved?.ace);
      pickupBroom.visible = !besenUnlocked;
      pickupEntry.enabled = !besenUnlocked;
      race.state = 'idle';
      for (const r of rings) { r.mesh.visible = false; r.glow.visible = false; }
      hud.setPuzzleStatus(null);
    },

    // Von main.js: liefert Tracker-Info für den aktiven Ring (wie
    // collectibles.nearest() — {angle,dist}), oder null außerhalb des Rennens.
    getTrackerInfo(player) {
      if (race.state !== 'running') return null;
      const r = rings[race.idx];
      const dx = r.x - player.pos.x, dz = r.z - player.pos.z;
      return {
        dist: Math.hypot(dx, dz),
        angle: Math.atan2(dx, -dz),
      };
    },

    update(dt, player) {
      flightBroom.visible = besenUnlocked && player.flying;
      wand.root.visible = !player.flying;
      startEntry.enabled = besenUnlocked && race.state === 'idle';

      if (player.flying) {
        trailTimer += dt;
        if (trailTimer > 0.035) {
          trailTimer = 0;
          const bx = player.pos.x + Math.sin(player.yaw) * 0.6;
          const bz = player.pos.z + Math.cos(player.yaw) * 0.6;
          fx.trail({ x: bx, y: player.pos.y + 1.2, z: bz }, ace ? 0xffd24a : 0xe8e8f0);
        }
      }

      raceTime += dt;
      for (const r of rings) {
        if (!r.glow.visible) continue;
        r.glow.material.opacity = 0.5 + Math.sin(raceTime * 5) * 0.3;
      }

      if (race.state === 'running') {
        race.t += dt;
        const ring = rings[race.idx];
        const dx = player.pos.x - ring.x, dy = (player.pos.y + 1.3) - ring.y, dz = player.pos.z - ring.z;
        if (player.flying && dx * dx + dy * dy + dz * dz < RING_HIT * RING_HIT) {
          audio.starLock?.();
          ring.mesh.visible = false;
          race.idx++;
          if (race.idx >= rings.length) { endRace(true); }
          else {
            setActiveRing(race.idx);
            hud.setPuzzleStatus(`🧹 Ring ${race.idx + 1}/12 — ${race.t.toFixed(1)}s`);
          }
        } else if (!player.flying) {
          endRace(false);
        } else if (race.t > RACE_TIMEOUT) {
          endRace(false);
        } else {
          hud.setPuzzleStatus(`🧹 Ring ${race.idx + 1}/12 — ${race.t.toFixed(1)}s`);
        }
      }
    },
  };
}
