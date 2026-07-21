// Boden-Mount Hippogreif (S5, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt 5.5).
// Zähmung eines der 3 wilden Silberauen-Hippogreife (fauna.js) per Verbeugen+
// Frischfisch (von Fero, S3), danach Rufen/Reiten per Taste R — kein
// persistenter Weltstandort, der Mount trabt bei jedem Pfiff neu heran.
// Kampf-Tritt gegen Feinde in Blickrichtung, während geritten wird.

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { buildWildHippoModel } from './fauna.js';

const TAME_BOW_RANGE = 5;
const TAME_BOW_DUR = 3;
const TAME_MOVE_CANCEL = 0.35; // m Bewegungstoleranz während des Verbeugens

const CALL_SPAWN_DIST = 20;
const CALL_FADE_DUR = 0.6;
const TROT_SPEED = 9;
const MOUNT_RANGE = 3;

// "Nur im Freien" — pointBlocked (geo.js) prüft nur Wand-Collider, aber keine
// Gebäude in diesem Spiel haben einen Decken-Collider (nur Rand-Wände), daher
// würde ein Über-Kopf-Punkttest die Raummitte fälschlich als "draußen"
// erkennen. Stattdessen direkter AABB-Test gegen die 4 begehbaren Grundrisse
// (Werte aus village.js/castle.js/structures.js/wildmark.js übernommen).
const INDOOR_ZONES = [
  { x0: -70 - 4.5, x1: -70 + 4.5, z0: -210 - 3.75, z1: -210 + 3.75 }, // Gasthaus (village.js GASTHAUS)
  { x0: -42, x1: -22, z0: -15, z1: 31 }, // Großer Saal (castle.js)
  { x0: 80 - 5, x1: 80 + 5, z0: 240 - 3, z1: 240 + 3 }, // Gewächshaus (structures.js GEWAECHSHAUS)
  { x0: 230 - 3.25, x1: 230 + 3.25, z0: 140 - 2.75, z1: 140 + 2.75 }, // Wispernde Kate (wildmark.js KATE)
];
function isIndoors(x, z) {
  for (const r of INDOOR_ZONES) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  }
  return false;
}

const KICK_RANGE = 2.2;
const KICK_COOLDOWN = 1.5;
const KICK_KNOCKBACK = 8;
const KICK_HALF_ANGLE = 0.9; // ~51° Kegel nach vorn — "Auto"-Tritt, kein Präzisions-Aim

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// Kamera-Kind-Modell fürs Ego-Reiten: Hals+Kopf ragen unten ins Bild (Muster
// wand.js/broom.js) — bewusst nur der vordere Teil, nicht das ganze Tier.
function buildRiderView() {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x8a7860, flatShading: true });
  const featherMat = new THREE.MeshLambertMaterial({ color: 0x5a4a38, flatShading: true });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0x3a3228, flatShading: true });
  const group = new THREE.Group();
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.1, 7), bodyMat);
  neck.rotation.x = 0.5;
  neck.position.set(0, -0.75, -1.0);
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), featherMat);
  head.position.set(0, -1.15, -1.5);
  group.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 6), beakMat);
  beak.rotation.x = Math.PI / 2 + 0.3;
  beak.position.set(0, -1.2, -1.78);
  group.add(beak);
  return group;
}

export function buildMount(scene, camera, glowTex, hud, audio, fx, health, interact, player, deps) {
  // deps = { hippos, mounts, feroState } — hippos: fauna.js-Instanzen (direkte
  // Referenz, wie überall in S3-S5), mounts/feroState: dieselbe Muster-
  // Wiederverwendung (Save-Unterobjekt bzw. Feros Sitzungs-Zähler).
  const { hippos, mounts, feroState } = deps;

  let currentPlayer = player;
  let onMountChange = null;

  // ---------- Zähm-Choreografie ----------
  const tame = { targetIdx: -1, phase: 'idle', t: 0, anchorX: 0, anchorZ: 0 };

  function feroFish() { return feroState?.frischfisch || 0; }

  function cancelTame(msg) {
    tame.phase = 'idle';
    tame.targetIdx = -1;
    tame.t = 0;
    hud.setTameRing(null);
    if (msg) hud.showToast(msg, 2.5);
  }

  hippos.forEach((h, i) => interact.register({
    get x() { return h.pos.x; },
    get z() { return h.pos.z; },
    r: TAME_BOW_RANGE,
    get enabled() {
      if (mounts.hippo) return false;
      if (tame.targetIdx === i) return tame.phase === 'offering'; // Verbeugen läuft ohne E-Spam automatisch
      return tame.phase === 'idle' && h.state === 'graze';
    },
    get prompt() {
      if (tame.targetIdx === i && tame.phase === 'offering') {
        return feroFish() > 0 ? 'E — Frischfisch anbieten' : 'Kein Frischfisch (bei Fero am Bahnhof kaufen)';
      }
      return 'E — Verbeugen';
    },
    onInteract: () => {
      if (tame.targetIdx === i && tame.phase === 'offering') {
        if (feroFish() <= 0) { hud.showToast('Du hast keinen Frischfisch dabei.', 2.2); return; }
        feroState.frischfisch--;
        h.tame();
        mounts.hippo = 1;
        cancelTame(null);
        hud.showToast('🦅 Gezähmt! Du hast das Pfeifen gelernt — Taste R ruft deinen Hippogreif.', 4.5);
        audio.chime?.('fanfare');
        fx.burst({ x: h.pos.x, y: h.pos.y + 1.2, z: h.pos.z }, 0xffd98c, 26, 4, { gravity: -2, life: 0.9 });
        onMountChange?.();
        return;
      }
      if (tame.phase === 'idle') {
        tame.targetIdx = i;
        tame.phase = 'bowing';
        tame.t = 0;
        tame.anchorX = currentPlayer.pos.x;
        tame.anchorZ = currentPlayer.pos.z;
        hud.showToast('Verbeuge dich und halte still …', 2);
      }
    },
  }));

  function updateTame(dt) {
    if (tame.phase === 'idle') return;
    const h = hippos[tame.targetIdx];
    if (tame.phase === 'bowing') {
      const moved = Math.hypot(currentPlayer.pos.x - tame.anchorX, currentPlayer.pos.z - tame.anchorZ);
      const dHippo = Math.hypot(h.pos.x - currentPlayer.pos.x, h.pos.z - currentPlayer.pos.z);
      if (h.state !== 'graze' || dHippo > TAME_BOW_RANGE + 1) {
        cancelTame('Er ist geflohen! Nähere dich langsamer.');
        return;
      }
      if (moved > TAME_MOVE_CANCEL) {
        cancelTame('Du hast dich bewegt — er ist wieder auf der Hut.');
        return;
      }
      tame.t += dt;
      hud.setTameRing(tame.t / TAME_BOW_DUR);
      if (tame.t >= TAME_BOW_DUR) {
        tame.phase = 'offering';
        hud.setTameRing(null);
        hud.showToast('Er vertraut dir. Biete ihm etwas an!', 2.5);
      }
    }
    // 'offering': keine Zeitbegrenzung — der Spieler kann in Ruhe zu Fero
    // laufen und wiederkommen, solange er nicht sprintet/den Hippogreif verjagt.
    else if (tame.phase === 'offering') {
      const dHippo = Math.hypot(h.pos.x - currentPlayer.pos.x, h.pos.z - currentPlayer.pos.z);
      if (h.state !== 'graze' || dHippo > TAME_BOW_RANGE + 3) {
        cancelTame('Er ist weitergezogen. Versuch es erneut.');
      }
    }
  }

  // ---------- Rufen & Reiten ----------
  const petModel = buildWildHippoModel();
  petModel.group.visible = false;
  scene.add(petModel.group);
  const petMats = [];
  petModel.group.traverse((o) => { if (o.material) petMats.push(o.material); });
  for (const m of petMats) { m.transparent = true; }

  const riderView = buildRiderView();
  riderView.visible = false;
  camera.add(riderView); // Kamera-Kind-Muster wie wand.js/broom.js

  let petSpawned = false;
  let petState = 'here'; // approaching|here
  let petFadeT = 1;
  let riding = false;
  let gaitT = 0;
  let kickCd = 0;

  function setPetOpacity(f) {
    for (const m of petMats) m.opacity = f;
  }

  function callPet() {
    if (!petSpawned) {
      const a = Math.random() * Math.PI * 2;
      const sx = currentPlayer.pos.x + Math.cos(a) * CALL_SPAWN_DIST;
      const sz = currentPlayer.pos.z + Math.sin(a) * CALL_SPAWN_DIST;
      petModel.group.position.set(sx, terrainHeight(sx, sz), sz);
      petFadeT = 0;
      setPetOpacity(0);
      petModel.group.visible = true;
      petSpawned = true;
    }
    petState = 'approaching';
  }

  function mountUp() {
    riding = true;
    currentPlayer.riding = true;
    currentPlayer.mountSpeedBoost = mounts.sattel ? 2 : 0;
    petModel.group.visible = false;
    riderView.visible = true;
    audio.chime?.();
    hud.showToast('🦅 Aufgestiegen! (R zum Absteigen)', 2);
  }

  function dismount() {
    riding = false;
    currentPlayer.riding = false;
    riderView.visible = false;
    const gx = currentPlayer.pos.x, gz = currentPlayer.pos.z;
    petModel.group.position.set(gx, terrainHeight(gx, gz), gz);
    petModel.group.visible = true;
    setPetOpacity(1);
    petFadeT = CALL_FADE_DUR;
    petSpawned = true;
    petState = 'here';
    hud.showToast('Abgestiegen.', 1.4);
  }
  currentPlayer.onDismount = () => { if (riding) dismount(); };

  function whistle() {
    if (!mounts.hippo) return;
    if (riding) { dismount(); return; }
    if (petSpawned) {
      const d = Math.hypot(petModel.group.position.x - currentPlayer.pos.x, petModel.group.position.z - currentPlayer.pos.z);
      if (d < MOUNT_RANGE) { mountUp(); return; }
    }
    if (isIndoors(currentPlayer.pos.x, currentPlayer.pos.z)) {
      hud.showToast('Hier drinnen hört dich niemand … geh nach draußen.', 2.5);
      return;
    }
    callPet();
    audio.chime?.();
  }

  function updatePet(dt) {
    if (!petSpawned || riding) return;
    if (petFadeT < CALL_FADE_DUR) {
      petFadeT += dt;
      setPetOpacity(Math.min(1, petFadeT / CALL_FADE_DUR));
    }
    let moving = false, speed = 0;
    if (petState === 'approaching') {
      const d = Math.hypot(petModel.group.position.x - currentPlayer.pos.x, petModel.group.position.z - currentPlayer.pos.z);
      if (d < MOUNT_RANGE * 0.7) { petState = 'here'; }
      else { moving = true; speed = TROT_SPEED; }
    }
    if (moving) {
      const dx = currentPlayer.pos.x - petModel.group.position.x, dz = currentPlayer.pos.z - petModel.group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      petModel.group.position.x += (dx / d) * speed * dt;
      petModel.group.position.z += (dz / d) * speed * dt;
      petModel.group.rotation.y = angleLerp(petModel.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3.5));
    }
    petModel.group.position.y = terrainHeight(petModel.group.position.x, petModel.group.position.z);

    gaitT += dt * (moving ? 6 : 0.6);
    const legAmp = moving ? 0.4 : 0.02;
    for (let i = 0; i < petModel.legs.length; i++) petModel.legs[i].rotation.x = Math.sin(gaitT + i * 1.5) * legAmp;
    const flapSpeed = moving ? 4 : 1.2, flapAmp = moving ? 0.3 : 0.08;
    for (const w of petModel.wings) w.rotation.z = w.userData.baseZ + Math.sin(gaitT * flapSpeed) * flapAmp * w.userData.sign;
  }

  // ---------- Kampf-Tritt (nur beim Reiten, automatisch) ----------
  function tryKick(combatTargets) {
    const cosY = Math.cos(currentPlayer.yaw), sinY = Math.sin(currentPlayer.yaw);
    const fwdX = -sinY, fwdZ = -cosY; // player.js-Konvention: yaw=0 → -z
    let best = null, bestD = KICK_RANGE, bestDx = 0, bestDz = 0;
    for (const c of combatTargets) {
      if (!c.alive) continue;
      const dx = c.pos.x - currentPlayer.pos.x, dz = c.pos.z - currentPlayer.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > KICK_RANGE || d < 0.05) continue;
      const dot = (dx / d) * fwdX + (dz / d) * fwdZ;
      if (dot < Math.cos(KICK_HALF_ANGLE)) continue;
      if (d < bestD) { best = c; bestD = d; bestDx = dx; bestDz = dz; }
    }
    if (!best) return;
    best.applyHit('kick', new THREE.Vector3(0, 0, 0));
    const d = bestD || 1;
    best.pos.x += (bestDx / d) * KICK_KNOCKBACK;
    best.pos.z += (bestDz / d) * KICK_KNOCKBACK;
    fx.burst({ x: best.pos.x, y: best.pos.y + 0.5, z: best.pos.z }, 0xffe0a0, 10, 3, { gravity: -2, life: 0.35 });
    fx.shake(0.12);
    audio.mountKick?.();
    kickCd = KICK_COOLDOWN;
  }

  return {
    get riding() { return riding; },
    set onMountChange(fn) { onMountChange = fn; },

    whistle,

    update(dt, player_, combatTargets) {
      currentPlayer = player_;
      updateTame(dt);
      updatePet(dt);
      if (riding) {
        kickCd -= dt;
        if (kickCd <= 0) tryKick(combatTargets);
      }
    },

    // Reset-Button: Zähmung + gerufener Mount komplett zurücksetzen. Die 3
    // wilden Hippogreife bekommen ihre Sichtbarkeit zurück (fauna.js selbst
    // hält keinen Reset-Pfad für tamed — hier ist der einzige Schreibzugriff).
    restore(savedMounts) {
      cancelTame(null);
      if (riding) dismount();
      petSpawned = false;
      petState = 'here';
      petModel.group.visible = false;
      for (const h of hippos) {
        h.tamed = false;
        // group.visible wird beim nächsten update() automatisch wiederhergestellt,
        // sobald tamed=false ist (kein eigener Sichtbarkeits-Zustand nötig).
      }
      if (savedMounts?.hippo && hippos[0]) hippos[0].tame();
    },
  };
}
