// Einhorn-Mount (E6, PLAN-EPISCHE-WELT.md Abschnitt 6.4): zähmbares, aber
// NICHT flugfähiges Reittier im Silberhain. Eigene RegionManager-Region
// (gleiches Zentrum/gleicher Radius wie silberhain.js), damit die wilde
// Instanz + Zähm-Choreografie derselben lazy-build-Lebensdauer folgt wie der
// Rest der Zone — anders als Hippogreif/Thestral (mount.js), die zu einer
// immer wachen Alt-Welt-Zone (Silberauen/Fahlholz) gehören und daher eager
// beim Weltaufbau entstehen. mount.js selbst bleibt unangetastet (dessen
// activeKind/preferredKind()-Weiche ist hart auf genau 2 Arten verdrahtet,
// eine Erweiterung auf 3 wäre riskanter als ein schlankes Schwester-Modul,
// zumal die Zähmung hier ohnehin erst beim ersten Wecken der Region
// existiert, nicht beim Weltaufbau wie hippos[]/thestrals[]).
//
// Bewusst KEIN Fisch-/Zutat-Kosten wie beim Hippogreif (Plan 6.4: "geduldige
// Annäherung ... aber es flieht, wenn man dem dunklen Pfad folgt") — ein
// Einhorn lässt sich nicht bestechen, nur durch Geduld und einen reinen Weg
// gewinnen. Reine Boden-Fortbewegung (kein Flug, kein Kampf-Tritt) — passt
// zum friedlichen Charakter der Region. Der Feenlichttrank (home.js, E6)
// hebt die Flucht vor dem dunklen Pfad zeitweise auf ("calmPotion").
import * as THREE from 'three';
import { terrainHeight, SILBERHAIN } from './terrain.js';

const C = { x: SILBERHAIN.x, z: SILBERHAIN.z };
const HOME = { x: C.x + 8, z: C.z + 18 };
const WANDER_R = 12;
const LEASH = 26;

const TAME_RANGE = 5;
const TAME_DUR = 4; // etwas länger als der Hippogreif (3s) — "geduldiger"
const TAME_MOVE_CANCEL = 0.35;

const CALL_SPAWN_DIST = 16;
const CALL_FADE_DUR = 0.6;
const TROT_SPEED = 8;
const MOUNT_RANGE = 3;

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}
function rand(min, max) { return min + Math.random() * (max - min); }

// Prozedurales Low-Poly-Modell: schlanker als der Hippogreif-Rumpf (fauna.js
// buildWildHippoModel), perlweiß/silbern statt Fell-Braun, EIN Horn, dünne
// Mähnen-"Finnen" entlang des Halses statt Federn, keine Flügel (Boden-Mount).
function buildUnicornModel() {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf2eef7, flatShading: true });
  const maneMat = new THREE.MeshLambertMaterial({ color: 0xd6b8ea, flatShading: true, side: THREE.DoubleSide });
  const hornMat = new THREE.MeshLambertMaterial({ color: 0xffe9c2, flatShading: true });
  const hoofMat = new THREE.MeshLambertMaterial({ color: 0xb8a8cc, flatShading: true });
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bodyMat);
  body.scale.set(0.95, 0.85, 1.9);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.85, 7), bodyMat);
  neck.rotation.x = -0.6;
  neck.position.set(0, 1.5, 0.85);
  group.add(neck);

  const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 7), bodyMat);
  head.rotation.x = Math.PI / 2 + 0.15;
  head.position.set(0, 1.92, 1.42);
  group.add(head);

  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.5, 6), hornMat);
  horn.position.set(0, 2.28, 1.62);
  horn.rotation.x = -0.35;
  group.add(horn);

  // Mähne: 4 flache Dreiecks-"Finnen" entlang des Halses — starr statt
  // Pivot-Gelenk (kein Flügelschlag-Muster nötig, nur Deko).
  for (let i = 0; i < 4; i++) {
    const s = 0.16 - i * 0.02;
    const mane = new THREE.Mesh(new THREE.ConeGeometry(s, 0.24, 3), maneMat);
    mane.rotation.x = Math.PI / 2;
    mane.position.set(0, 1.58 + i * 0.13, 0.55 - i * 0.17);
    group.add(mane);
  }

  const legs = [];
  for (const [lx, lz] of [[-0.28, 0.6], [0.28, 0.6], [-0.28, -0.6], [0.28, -0.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 1.1, 6), bodyMat);
    leg.position.set(lx, 0.55, lz);
    group.add(leg);
    legs.push(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.12, 6), hoofMat);
    hoof.position.set(lx, 0.02, lz);
    group.add(hoof);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.85, 6), maneMat);
  tail.rotation.x = Math.PI / 2.3;
  tail.position.set(0, 1.1, -1.55);
  group.add(tail);

  return { group, legs };
}

// Kamera-Kind-Modell fürs Ego-Reiten (Muster wand.js/broom.js/mount.js) —
// nur Hals+Kopf+Horn ragen unten ins Bild, wie buildHippoRiderView().
function buildUnicornRiderView() {
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xf2eef7, flatShading: true });
  const hornMat = new THREE.MeshLambertMaterial({ color: 0xffe9c2, flatShading: true });
  const group = new THREE.Group();
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.0, 7), bodyMat);
  neck.rotation.x = 0.55;
  neck.position.set(0, -0.72, -1.0);
  group.add(neck);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.55, 7), bodyMat);
  head.rotation.x = Math.PI / 2 - 0.2;
  head.position.set(0, -1.15, -1.5);
  group.add(head);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.42, 6), hornMat);
  horn.position.set(0, -1.42, -1.68);
  horn.rotation.x = 0.15;
  group.add(horn);
  return group;
}

export function buildUnicorn(root, deps) {
  // deps = { camera, hud, audio, fx, interact, mounts, siegel, dunkel,
  //          onChange } — mounts/siegel/dunkel sind direkte save.*-
  // Referenzen (Muster wie überall seit S3). onChange übernimmt hier BEIDES
  // (persist() UND refreshStatusLines(), von main.js so verdrahtet) — anders
  // als mount.js gibt es kein separates onMountChange, ein Callback reicht.
  const { camera, hud, audio, fx, interact, mounts, siegel, dunkel, onChange } = deps;

  let currentPlayer = null;

  function darkPath() { return dunkel?.pfad === 'dunkel' && !calmPotion; }
  let calmPotion = false; // Feenlichttrank (home.js) — main.js setzt dies pro Frame

  // ---------- Wilde, grasende Instanz (Muster fauna.js WildHippogriff, aber
  // Fluchtauslöser ist der DUNKLE PFAD statt Sprinten — Plan 6.4). ----------
  const model = buildUnicornModel();
  const wild = {
    group: model.group,
    legs: model.legs,
    pos: model.group.position,
    home: { x: HOME.x, z: HOME.z },
    target: { x: HOME.x, z: HOME.z },
    state: 'graze', // graze|flee
    stateT: rand(0, 4),
    gaitT: 0,
  };
  wild.pos.set(HOME.x, terrainHeight(HOME.x, HOME.z), HOME.z);
  root.add(wild.group);

  function updateWild(dt, player) {
    if (mounts.einhorn) { wild.group.visible = false; return; }
    wild.group.visible = true;
    const dist = Math.hypot(wild.pos.x - player.pos.x, wild.pos.z - player.pos.z);
    const threatened = darkPath() && dist < 14;
    if (wild.state === 'graze' && threatened) { wild.state = 'flee'; wild.stateT = 0; }
    else if (wild.state === 'flee' && !threatened && dist > 20) { wild.state = 'graze'; wild.stateT = 0; }

    let speed = 0, moving = false;
    if (wild.state === 'flee') {
      const dx = wild.pos.x - player.pos.x, dz = wild.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      wild.target.x = wild.pos.x + (dx / d) * 10;
      wild.target.z = wild.pos.z + (dz / d) * 10;
      speed = 6.5; moving = true;
    } else {
      wild.stateT -= dt;
      if (wild.stateT <= 0) {
        wild.stateT = rand(4, 9);
        const a = Math.random() * Math.PI * 2, r = Math.random() * WANDER_R;
        wild.target.x = wild.home.x + Math.cos(a) * r;
        wild.target.z = wild.home.z + Math.sin(a) * r;
      }
      const d = Math.hypot(wild.target.x - wild.pos.x, wild.target.z - wild.pos.z);
      if (d > 0.6) { speed = 2.2; moving = true; }
    }
    if (moving) {
      const dx = wild.target.x - wild.pos.x, dz = wild.target.z - wild.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      wild.pos.x += (dx / d) * speed * dt;
      wild.pos.z += (dz / d) * speed * dt;
      wild.group.rotation.y = angleLerp(wild.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3.5));
    }
    const dh = Math.hypot(wild.pos.x - HOME.x, wild.pos.z - HOME.z);
    if (dh > LEASH) {
      wild.pos.x = HOME.x + (wild.pos.x - HOME.x) * (LEASH / dh);
      wild.pos.z = HOME.z + (wild.pos.z - HOME.z) * (LEASH / dh);
    }
    wild.pos.y = terrainHeight(wild.pos.x, wild.pos.z);
    wild.gaitT += dt * (moving ? (wild.state === 'flee' ? 6 : 2) : 0.5);
    const legAmp = moving ? (wild.state === 'flee' ? 0.45 : 0.15) : 0.02;
    for (let i = 0; i < wild.legs.length; i++) wild.legs[i].rotation.x = Math.sin(wild.gaitT + i * 1.5) * legAmp;
  }

  // ---------- Zähm-Choreografie: nur Geduld, kein Zutat-Kosten ----------
  const tame = { phase: 'idle', t: 0, anchorX: 0, anchorZ: 0 };

  function cancelTame(msg) {
    tame.phase = 'idle';
    tame.t = 0;
    hud.setTameRing(null);
    if (msg) hud.showToast(msg, 2.5);
  }

  function completeTame() {
    mounts.einhorn = 1;
    siegel.hain = 1;
    cancelTame(null);
    hud.showToast('🦄 Das Einhorn vertraut dir … Taste R ruft es fortan zu dir.', 4.5);
    audio.unicornWhinny?.();
    audio.chime?.('fanfare');
    fx.burst({ x: wild.pos.x, y: wild.pos.y + 1.2, z: wild.pos.z }, 0xf0d8ff, 26, 4, { gravity: -2, life: 0.9 });
    onChange?.();
  }

  interact.register({
    get x() { return wild.pos.x; },
    get z() { return wild.pos.z; },
    r: TAME_RANGE,
    get enabled() {
      if (mounts.einhorn) return false;
      if (tame.phase === 'bowing') return true; // läuft automatisch, kein E-Spam nötig
      return tame.phase === 'idle' && wild.state === 'graze' && !darkPath();
    },
    prompt: 'E — Verbeugen und stillhalten',
    onInteract: () => {
      if (tame.phase === 'idle') {
        tame.phase = 'bowing';
        tame.t = 0;
        tame.anchorX = currentPlayer.pos.x;
        tame.anchorZ = currentPlayer.pos.z;
        hud.showToast('Verbeuge dich und halte still …', 2);
      }
    },
  });

  function updateTame(dt) {
    if (tame.phase !== 'bowing') return;
    const moved = Math.hypot(currentPlayer.pos.x - tame.anchorX, currentPlayer.pos.z - tame.anchorZ);
    const dHorn = Math.hypot(wild.pos.x - currentPlayer.pos.x, wild.pos.z - currentPlayer.pos.z);
    if (wild.state !== 'graze' || dHorn > TAME_RANGE + 1 || darkPath()) {
      cancelTame('Es ist gescheut! Nähere dich langsamer und ruhiger.');
      return;
    }
    if (moved > TAME_MOVE_CANCEL) {
      cancelTame('Du hast dich bewegt — es ist wieder auf der Hut.');
      return;
    }
    tame.t += dt;
    hud.setTameRing(tame.t / TAME_DUR);
    if (tame.t >= TAME_DUR) completeTame();
  }

  // ---------- Rufen & Reiten: reine Boden-Fortbewegung, kein Flug, kein
  // Kampf-Tritt — passt zum friedlichen Charakter der Region. ----------
  const pet = buildUnicornModel();
  const riderView = buildUnicornRiderView();
  riderView.visible = false;
  camera.add(riderView);
  const petMats = [];
  pet.group.traverse((o) => { if (o.material) petMats.push(o.material); });
  for (const m of petMats) m.transparent = true;
  pet.group.visible = false;
  root.add(pet.group);

  let petSpawned = false;
  let petState = 'here'; // approaching|here
  let petFadeT = 1;
  let riding = false;
  let gaitT = 0;

  function setPetOpacity(f) { for (const m of petMats) m.opacity = f; }

  function callPet() {
    if (!petSpawned) {
      const a = Math.random() * Math.PI * 2;
      const sx = currentPlayer.pos.x + Math.cos(a) * CALL_SPAWN_DIST;
      const sz = currentPlayer.pos.z + Math.sin(a) * CALL_SPAWN_DIST;
      pet.group.position.set(sx, terrainHeight(sx, sz), sz);
      petFadeT = 0;
      setPetOpacity(0);
      pet.group.visible = true;
      petSpawned = true;
    } else {
      pet.group.visible = true;
    }
    petState = 'approaching';
  }

  function mountUp() {
    riding = true;
    currentPlayer.riding = true;
    currentPlayer.mountSpeedBoost = mounts.sattel ? 2 : 0;
    pet.group.visible = false;
    riderView.visible = true;
    audio.chime?.();
    hud.showToast('🦄 Aufgestiegen! (R zum Absteigen)', 2.4);
  }

  function dismount() {
    riding = false;
    currentPlayer.riding = false;
    riderView.visible = false;
    const gx = currentPlayer.pos.x, gz = currentPlayer.pos.z;
    pet.group.position.set(gx, terrainHeight(gx, gz), gz);
    pet.group.visible = true;
    setPetOpacity(1);
    petFadeT = CALL_FADE_DUR;
    petSpawned = true;
    petState = 'here';
    hud.showToast('Abgestiegen.', 1.4);
  }

  // Verkettet statt überschrieben: mount.js setzt player.onDismount schon
  // beim Weltaufbau (eager), diese Region baut erst später lazy — ein
  // einfaches Überschreiben würde Hippogreif/Thestral das erzwungene
  // Absitzen beim Schwimmen kaputt machen (S5, "Schwimmen erzwingt Absitzen").
  function attachOnDismount(player) {
    if (player._unicornDismountAttached) return;
    player._unicornDismountAttached = true;
    const prev = player.onDismount;
    player.onDismount = () => {
      if (riding) { dismount(); return; }
      prev?.();
    };
  }

  function whistle() {
    if (!mounts.einhorn || currentPlayer.flying) return;
    if (riding) { dismount(); return; }
    if (petSpawned) {
      const d = Math.hypot(pet.group.position.x - currentPlayer.pos.x, pet.group.position.z - currentPlayer.pos.z);
      if (d < MOUNT_RANGE) { mountUp(); return; }
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
  }

  function applySavedState() {
    cancelTame(null);
    riding = false;
    petSpawned = false;
    petState = 'here';
    pet.group.visible = false;
    riderView.visible = false;
    wild.group.visible = !mounts.einhorn;
  }
  applySavedState();

  return {
    get riding() { return riding; },
    get tamed() { return !!mounts.einhorn; },
    set calmPotion(v) { calmPotion = v; },

    whistle,

    update(dt, player) {
      currentPlayer = player;
      attachOnDismount(player);
      updateWild(dt, player);
      updateTame(dt);
      updatePet(dt);
    },

    // Reset-Button: Zähmung + gerufenes Einhorn komplett zurücksetzen — dem
    // Save-Reset in main.js entsprechend, das mounts.einhorn auf 0 setzt.
    restore() {
      if (riding && currentPlayer) { riding = false; currentPlayer.riding = false; }
      applySavedState();
    },
  };
}
