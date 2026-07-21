// Boden- & Flug-Mounts: Hippogreif (S5) + Thestral (S6, PLAN-SCHATTEN-UND-
// SCHWINGEN.md Abschnitt 6). Zähmung eines der 3 wilden Silberauen-
// Hippogreife (fauna.js) per Verbeugen+Frischfisch (von Fero, S3), danach
// Rufen/Reiten per Taste R — kein persistenter Weltstandort, der Mount
// trabt bei jedem Pfiff neu heran. 2 Thestrale im Fahlholz sind unsichtbar
// (nur hörbar), bis der Spieler den Tod miterlebt hat (save.seenDeath) —
// danach sofort per E zähmbar, kein Ritual nötig. Beide Reittiere können
// per Doppel-Leertaste-Tipp abheben (flight.js) — Hippogreif majestätisch-
// träge (Tempo 24), Thestral wendiger (Tempo 28). Kampf-Tritt gegen Feinde
// in Blickrichtung, während geritten wird (Boden UND Luft).

import * as THREE from 'three';
import { terrainHeight, FAHLHOLZ } from './terrain.js';
import { buildWildHippoModel } from './fauna.js';
import { HIPPO_FLIGHT, THESTRAL_FLIGHT } from './flight.js';

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
// erkennen. Stattdessen direkter AABB-Test gegen die 5 begehbaren/umschlossenen
// Grundrisse (Werte aus village.js/castle.js/structures.js/wildmark.js/moor.js
// übernommen) — K13 (PLAN-SCHATTEN-UND-SCHWINGEN.md): "Gasthaus/Krypta/Kate".
const INDOOR_ZONES = [
  { x0: -70 - 4.5, x1: -70 + 4.5, z0: -210 - 3.75, z1: -210 + 3.75 }, // Gasthaus (village.js GASTHAUS)
  { x0: -42, x1: -22, z0: -15, z1: 31 }, // Großer Saal (castle.js)
  { x0: 80 - 5, x1: 80 + 5, z0: 240 - 3, z1: 240 + 3 }, // Gewächshaus (structures.js GEWAECHSHAUS)
  { x0: 230 - 3.25, x1: 230 + 3.25, z0: 140 - 2.75, z1: 140 + 2.75 }, // Wispernde Kate (wildmark.js KATE)
  { x0: 238, x1: 245, z0: -178, z1: -173 }, // Nebelmoor-Krypta (moor.js CRYPT = MOOR-Zentrum)
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

// Thestrale (S6): 2 feste Spots im Fahlholz (terrain.js FAHLHOLZ.r=22),
// unsichtbar bis save.seenDeath, dann sofort zähmbar ohne Ritual.
const THESTRAL_SPOTS = [
  { x: 283, z: 143 },
  { x: 300, z: 159 },
];
const THESTRAL_TAME_RANGE = 4;
const THESTRAL_FADE_DUR = 2.5; // s, Ein-/Ausblenden bei seenDeath-Wechsel
const THESTRAL_AUDIO_RANGE = 20; // m, Hörweite für Atmen/Hufscharren solange unsichtbar

const TAKEOFF_TAP_WINDOW = 0.4; // s zwischen 2 Leertaste-Tipps zum Abheben
const FLAP_INTERVAL = 0.55; // s zwischen Flügelschlag-Sounds im Flug

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// Kamera-Kind-Modell fürs Ego-Reiten: Hals+Kopf ragen unten ins Bild (Muster
// wand.js/broom.js) — bewusst nur der vordere Teil, nicht das ganze Tier.
function buildHippoRiderView() {
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

// Thestral-Reitmodell (Weltinstanz): dünn, knochig, ledrige Schwingen — ganz
// bewusst schmaler und dunkler als der Hippogreif (Skelett-Silhouette statt
// Gefieder), damit er auch beim Fade-in sofort als "das andere Tier" lesbar
// ist. Gleiche Rückgabe-Form ({group,legs,wings}) wie buildWildHippoModel,
// damit updatePet()/tryKick() beide Arten identisch behandeln können.
function buildThestralModel() {
  const boneMat = new THREE.MeshLambertMaterial({ color: 0x2e2b30, flatShading: true });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0x201d22, flatShading: true });
  const wingMat = new THREE.MeshLambertMaterial({
    color: 0x171418, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
  });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd8f0ff, transparent: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 5), boneMat);
  body.scale.set(0.85, 0.75, 2.0);
  body.position.y = 1.15;
  group.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 6), boneMat);
  neck.rotation.x = -0.55;
  neck.position.set(0, 1.55, 0.95);
  group.add(neck);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 6), skinMat);
  head.rotation.x = Math.PI / 2 + 0.2;
  head.position.set(0, 1.92, 1.5);
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), eyeMat);
    eye.position.set(s * 0.09, 1.97, 1.35);
    group.add(eye);
  }
  const legs = [];
  for (const [lx, lz] of [[-0.26, 0.6], [0.26, 0.6], [-0.26, -0.6], [0.26, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 1.15, 5), boneMat);
    leg.position.set(lx, 0.58, lz);
    group.add(leg);
    legs.push(leg);
  }
  // Ledrige Schwingen (Fledermaus-Silhouette statt Federn) — gleiches Pivot-
  // Muster wie beim Hippogreif (Astketten-Technik aus willow.js).
  const wings = [];
  for (const s of [-1, 1]) {
    const root = new THREE.Group();
    root.position.set(s * 0.25, 1.4, -0.05);
    group.add(root);
    const wingMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.05, 4, 1), wingMat);
    wingMesh.rotation.x = Math.PI / 2;
    wingMesh.position.x = s * 0.9;
    root.add(wingMesh);
    root.userData.baseZ = s * -0.2;
    root.userData.sign = s;
    root.rotation.z = root.userData.baseZ;
    wings.push(root);
  }
  return { group, legs, wings };
}

function buildThestralRiderView() {
  const boneMat = new THREE.MeshLambertMaterial({ color: 0x2e2b30, flatShading: true });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0x201d22, flatShading: true });
  const group = new THREE.Group();
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.0, 6), boneMat);
  neck.rotation.x = 0.55;
  neck.position.set(0, -0.7, -1.0);
  group.add(neck);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), skinMat);
  head.rotation.x = Math.PI / 2 - 0.2;
  head.position.set(0, -1.15, -1.55);
  group.add(head);
  return group;
}

export function buildMount(scene, camera, glowTex, hud, audio, fx, health, interact, player, deps) {
  // deps = { hippos, mounts, feroState, save } — hippos: fauna.js-Instanzen
  // (direkte Referenz, wie überall in S3-S6), mounts/feroState dieselbe
  // Muster-Wiederverwendung. save: die WHOLE save-Referenz (wie economy.js
  // sie für gold/ruf hält) — seenDeath ist ein reiner Skalar, keine Sub-
  // Objekt-Referenz reicht dafür, siehe S4-Lehre "Save-Referenz-Fragilität".
  const { hippos, mounts, feroState, save } = deps;

  let currentPlayer = player;
  let onMountChange = null;

  // ---------- Zähm-Choreografie (Hippogreif) ----------
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

  // ---------- Thestrale: unsichtbar bis seenDeath, dann instant zähmbar ----------
  const thestrals = THESTRAL_SPOTS.map((spot, i) => {
    const m = buildThestralModel();
    m.group.position.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
    m.group.visible = false;
    scene.add(m.group);
    const mats = [];
    m.group.traverse((o) => { if (o.material) mats.push(o.material); });
    for (const mm of mats) mm.transparent = true;
    return { group: m.group, legs: m.legs, wings: m.wings, mats, gaitT: i * 2.7, tamed: false, opacity: 0 };
  });

  function seenDeath() { return !!save.seenDeath; }

  thestrals.forEach((t, i) => interact.register({
    get x() { return t.group.position.x; },
    get z() { return t.group.position.z; },
    r: THESTRAL_TAME_RANGE,
    get enabled() { return seenDeath() && !t.tamed && !mounts.thestral; },
    prompt: 'E — Thestral zähmen (er kennt dich)',
    onInteract: () => {
      t.tamed = true;
      mounts.thestral = 1;
      hud.showToast('🦇 Er mag dich einfach … Taste R ruft deinen Thestral.', 4.5);
      audio.chime?.('fanfare');
      fx.burst({ x: t.group.position.x, y: t.group.position.y + 1.2, z: t.group.position.z }, 0x8a7ad0, 22, 4, { gravity: -2, life: 0.9 });
      onMountChange?.();
      // "E → sofort geritten" (Plan): kein Ritual, keine Anreise nötig.
      activeKind = 'thestral';
      petSpawned = true;
      petState = 'here';
      const gx = t.group.position.x, gz = t.group.position.z;
      thestralPet.group.position.set(gx, terrainHeight(gx, gz), gz);
      setActivePetOpacity(1);
      mountUp();
    },
  }));

  function updateThestrals(dt) {
    const visible = seenDeath();
    let nearestHiddenD = Infinity;
    for (const t of thestrals) {
      if (t.tamed) { t.group.visible = false; continue; }
      const target = visible ? 1 : 0;
      t.opacity += (target - t.opacity) * Math.min(1, dt / THESTRAL_FADE_DUR);
      for (const m of t.mats) m.opacity = t.opacity;
      t.group.visible = t.opacity > 0.01;
      // sanfte Idle-Animation (kein Wander-KI nötig — sie stehen einfach da)
      t.gaitT += dt * 0.5;
      for (let k = 0; k < t.legs.length; k++) t.legs[k].rotation.x = Math.sin(t.gaitT + k * 1.4) * 0.02;
      for (const w of t.wings) w.rotation.z = w.userData.baseZ + Math.sin(t.gaitT * 0.7) * 0.06 * w.userData.sign;
      if (!visible) {
        const d = Math.hypot(t.group.position.x - currentPlayer.pos.x, t.group.position.z - currentPlayer.pos.z);
        if (d < nearestHiddenD) nearestHiddenD = d;
      }
    }
    // Hörbar solange unsichtbar: Atmen/Hufscharren, Lautstärke nach Nähe.
    const proximity = visible ? 0 : Math.max(0, 1 - nearestHiddenD / THESTRAL_AUDIO_RANGE);
    audio.setThestralPresence?.(proximity);
  }

  // ---------- Rufen & Reiten (beide Arten teilen sich dieselbe Maschine) ----------
  const hippoPet = buildWildHippoModel();
  const thestralPet = buildThestralModel();
  const hippoRiderView = buildHippoRiderView();
  const thestralRiderView = buildThestralRiderView();
  hippoRiderView.visible = false;
  thestralRiderView.visible = false;
  camera.add(hippoRiderView); // Kamera-Kind-Muster wie wand.js/broom.js
  camera.add(thestralRiderView);

  const hippoPetMats = [];
  hippoPet.group.traverse((o) => { if (o.material) hippoPetMats.push(o.material); });
  for (const m of hippoPetMats) m.transparent = true;
  const thestralPetMats = [];
  thestralPet.group.traverse((o) => { if (o.material) thestralPetMats.push(o.material); });
  for (const m of thestralPetMats) m.transparent = true;

  hippoPet.group.visible = false;
  thestralPet.group.visible = false;
  scene.add(hippoPet.group);
  scene.add(thestralPet.group);

  let activeKind = null; // 'hippo' | 'thestral' — welches Tier gerade gerufen/geritten wird
  let petSpawned = false;
  let petState = 'here'; // approaching|here
  let petFadeT = 1;
  let riding = false;
  let gaitT = 0;
  let kickCd = 0;
  let spaceWasDown = false;
  let lastSpaceTapT = -10;
  let gameTime = 0;
  let flapT = 0;

  function activePet() { return activeKind === 'thestral' ? thestralPet : hippoPet; }
  function activePetMats() { return activeKind === 'thestral' ? thestralPetMats : hippoPetMats; }
  function activeRiderView() { return activeKind === 'thestral' ? thestralRiderView : hippoRiderView; }
  function activeFlightTuning() { return activeKind === 'thestral' ? THESTRAL_FLIGHT : HIPPO_FLIGHT; }
  function setActivePetOpacity(f) { for (const m of activePetMats()) m.opacity = f; }

  // Welches Tier ruft Taste R, wenn beide gezähmt sind? Der Thestral ist die
  // seltenere, später freigeschaltete Belohnung — er hat Vorrang.
  function preferredKind() {
    if (mounts.thestral) return 'thestral';
    if (mounts.hippo) return 'hippo';
    return null;
  }

  function callPet() {
    activeKind = preferredKind();
    if (!activeKind) return;
    if (!petSpawned) {
      const a = Math.random() * Math.PI * 2;
      const sx = currentPlayer.pos.x + Math.cos(a) * CALL_SPAWN_DIST;
      const sz = currentPlayer.pos.z + Math.sin(a) * CALL_SPAWN_DIST;
      const pet = activePet();
      pet.group.position.set(sx, terrainHeight(sx, sz), sz);
      petFadeT = 0;
      setActivePetOpacity(0);
      pet.group.visible = true;
      petSpawned = true;
    } else {
      activePet().group.visible = true;
    }
    petState = 'approaching';
  }

  function mountUp() {
    riding = true;
    currentPlayer.riding = true;
    currentPlayer.mountSpeedBoost = mounts.sattel ? 2 : 0;
    activePet().group.visible = false;
    activeRiderView().visible = true;
    audio.chime?.();
    hud.showToast('🦅 Aufgestiegen! (R zum Absteigen, 2× Leertaste zum Abheben)', 2.4);
  }

  function dismount() {
    riding = false;
    currentPlayer.riding = false;
    activeRiderView().visible = false;
    const gx = currentPlayer.pos.x, gz = currentPlayer.pos.z;
    const pet = activePet();
    pet.group.position.set(gx, terrainHeight(gx, gz), gz);
    pet.group.visible = true;
    setActivePetOpacity(1);
    petFadeT = CALL_FADE_DUR;
    petSpawned = true;
    petState = 'here';
    hud.showToast('Abgestiegen.', 1.4);
  }
  currentPlayer.onDismount = () => { if (riding) dismount(); };

  // Fliegender Abstieg (flight.js ruft dies über player.onLandFlight auf):
  // aus Sicht des Reiters "gelandet", nicht "abgestiegen" — Mount bleibt aktiv.
  function landFromFlight() {
    currentPlayer.flying = false;
    currentPlayer.riding = true;
  }

  function takeOff() {
    currentPlayer.riding = false;
    currentPlayer.flying = true;
    currentPlayer.flightTuning = activeFlightTuning();
    currentPlayer.onLandFlight = landFromFlight;
    flapT = 0;
    hud.showToast('🕊️ Abgehoben!', 1.6);
    audio.chime?.();
  }

  function whistle() {
    if (currentPlayer.flying) return; // Absteigen/Wechseln erst nach der Landung
    if (riding) { dismount(); return; }
    const kind = preferredKind();
    if (!kind) return;
    if (petSpawned && activeKind === kind) {
      const pet = activePet();
      const d = Math.hypot(pet.group.position.x - currentPlayer.pos.x, pet.group.position.z - currentPlayer.pos.z);
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
    if (!petSpawned || riding || !activeKind) return;
    const pet = activePet();
    if (petFadeT < CALL_FADE_DUR) {
      petFadeT += dt;
      setActivePetOpacity(Math.min(1, petFadeT / CALL_FADE_DUR));
    }
    let moving = false, speed = 0;
    if (petState === 'approaching') {
      const d = Math.hypot(pet.group.position.x - currentPlayer.pos.x, pet.group.position.z - currentPlayer.pos.z);
      if (d < MOUNT_RANGE * 0.7) { petState = 'here'; }
      else { moving = true; speed = TROT_SPEED; }
    }
    if (moving) {
      const dx = currentPlayer.pos.x - pet.group.position.x, dz = currentPlayer.pos.z - pet.group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      pet.group.position.x += (dx / d) * speed * dt;
      pet.group.position.z += (dz / d) * speed * dt;
      pet.group.rotation.y = angleLerp(pet.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3.5));
    }
    pet.group.position.y = terrainHeight(pet.group.position.x, pet.group.position.z);

    gaitT += dt * (moving ? 6 : 0.6);
    const legAmp = moving ? 0.4 : 0.02;
    for (let i = 0; i < pet.legs.length; i++) pet.legs[i].rotation.x = Math.sin(gaitT + i * 1.5) * legAmp;
    const flapSpeed = moving ? 4 : 1.2, flapAmp = moving ? 0.3 : 0.08;
    for (const w of pet.wings) w.rotation.z = w.userData.baseZ + Math.sin(gaitT * flapSpeed) * flapAmp * w.userData.sign;
  }

  // Doppel-Leertaste-Tipp zum Abheben, nur während geerdet geritten wird.
  function updateTakeoff(dt) {
    if (!riding || currentPlayer.flying) { spaceWasDown = false; return; }
    const down = currentPlayer.keys.has('Space');
    if (down && !spaceWasDown) {
      if (gameTime - lastSpaceTapT < TAKEOFF_TAP_WINDOW) {
        takeOff();
        lastSpaceTapT = -10;
      } else {
        lastSpaceTapT = gameTime;
      }
    }
    spaceWasDown = down;
  }

  // Flügelschlag-Sound im Flug (kein sichtbares Wing-Mesh im Ego-Reitblick —
  // riderView zeigt nur Hals+Kopf, siehe S5 — daher Audio statt Animation).
  function updateFlapSound(dt) {
    if (!riding || !currentPlayer.flying) return;
    flapT += dt;
    if (flapT >= FLAP_INTERVAL) {
      flapT = 0;
      audio.mountFlap?.();
      const p = currentPlayer.pos;
      fx.trail?.({ x: p.x, y: p.y - 0.3, z: p.z }, activeKind === 'thestral' ? 0x2a2440 : 0xd8c8a0);
    }
  }

  // ---------- Kampf-Tritt (nur beim Reiten, automatisch — Boden UND Luft) ----------
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
      gameTime += dt;
      updateTame(dt);
      updateThestrals(dt);
      updatePet(dt);
      updateTakeoff(dt);
      updateFlapSound(dt);
      if (riding) {
        kickCd -= dt;
        if (kickCd <= 0) tryKick(combatTargets);
      }
    },

    // Reset-Button: Zähmung + gerufener Mount komplett zurücksetzen. Die 3
    // wilden Hippogreife UND die 2 Thestrale bekommen ihren wilden Zustand
    // zurück (fauna.js/mount.js selbst halten keinen eigenen Reset-Pfad für
    // tamed — hier ist der einzige Schreibzugriff).
    restore(savedMounts) {
      cancelTame(null);
      if (riding) dismount();
      if (currentPlayer.flying && activeKind) { currentPlayer.flying = false; }
      activeKind = null;
      petSpawned = false;
      petState = 'here';
      hippoPet.group.visible = false;
      thestralPet.group.visible = false;
      for (const h of hippos) {
        h.tamed = false;
        // group.visible wird beim nächsten update() automatisch wiederhergestellt,
        // sobald tamed=false ist (kein eigener Sichtbarkeits-Zustand nötig).
      }
      for (const t of thestrals) { t.tamed = false; }
      if (savedMounts?.hippo && hippos[0]) hippos[0].tame();
      if (savedMounts?.thestral && thestrals[0]) thestrals[0].tamed = true;
    },
  };
}
