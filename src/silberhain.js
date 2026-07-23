// Der Silberhain (E6, PLAN-EPISCHE-WELT.md Abschnitt 6.4): dritte echte
// RegionManager-Region — bewusst OHNE Boss/Kampf-Risiko, der "emotionale
// Gegenpol" zu Aschenklamm/Frostzinnen. Enthält den Silberbaum (Landmarke),
// das Feenlicht-Pilzring-Rätsel (Lumos + Näherung, kein Spruch-Ziel-Treffer
// nötig), 3 würdevolle Zentauren-NPCs (Händlerin Filyra, Bogen-Duellant
// Kyrian, die stumme Sela) und eine Belohnungstruhe (Mondsilber). Das
// zähmbare Einhorn selbst lebt in unicorn.js — eigene Region, gleiches
// Zentrum, siehe dortiger Kopf-Kommentar zur Begründung.
import * as THREE from 'three';
import { GeoBatch } from './geo.js';
import { terrainHeight, SILBERHAIN } from './terrain.js';
import { buildFigure, animateFigure } from './npc.js';

const C = { x: SILBERHAIN.x, z: SILBERHAIN.z };
const TREE = { x: C.x, z: C.z - 10 };
const RING = { x: C.x + 16, z: C.z + 8 };
const RING_R = 3.2;
const CHEST_POS = { x: C.x + 3, z: C.z - 7 };
const FILYRA_POS = { x: C.x - 16, z: C.z + 4 };
const KYRIAN_POS = { x: C.x - 22, z: C.z - 6 };
const SELA_POS = { x: C.x + 10, z: C.z + 2 };

const ORB_DUR = 3; // s pro Ziel-Orb, 4 Orbs -> 12s Runde
const ORB_BENCHMARK = 3; // Kyrians "Par" — ab diesem Treffer-Stand ist es ein Unentschieden

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

// ---------- Silberbaum: Fern-Landmarke (Fern-Silhouette folgt erst E11) ----------
function buildSilberbaum(root, glowTex) {
  const y = terrainHeight(TREE.x, TREE.z);
  const batch = new GeoBatch();
  const BARK = 0xc9c0d8, BARK_DARK = 0xa89ec0;

  const trunkGeo = new THREE.CylinderGeometry(1.0, 1.5, 7, 9, 3);
  const pa = trunkGeo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i);
    pa.setX(i, x + Math.sin(pa.getY(i) * 1.3) * 0.12);
    pa.setZ(i, z + Math.cos(pa.getY(i) * 1.1) * 0.12);
  }
  trunkGeo.computeVertexNormals();
  trunkGeo.translate(TREE.x, y + 3.5, TREE.z);
  batch.addRaw(trunkGeo, BARK_DARK);

  // Krone: 3 überlappende Kugeln statt einer, wirkt voller (Muster willow.js,
  // aber heller/silbriger statt dunkelgrün).
  for (const [dx, dy, dz, r] of [[0, 7.4, 0, 3.1], [1.6, 6.6, 0.8, 2.3], [-1.5, 6.8, -0.9, 2.4]]) {
    const crown = new THREE.SphereGeometry(r, 8, 6);
    crown.translate(TREE.x + dx, y + dy, TREE.z + dz);
    batch.addRaw(crown, BARK);
  }

  const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { castShadow: true, receiveShadow: true });
  if (mesh) root.add(mesh);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xf0e0ff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(6);
  glow.position.set(TREE.x, y + 7.2, TREE.z);
  root.add(glow);
  const light = new THREE.PointLight(0xe8d8ff, 3, 20, 2);
  light.position.set(TREE.x, y + 6, TREE.z);
  root.add(light);

  return { glow, light };
}

// ---------- Feenlicht-Pilzring: 5 Pilze, leuchten bei Lumos+Näherung auf ----------
function buildMushroomRing(root, glowTex) {
  const batch = new GeoBatch();
  const CAP = 0xd8a8e8, STEM = 0xe8ddc8;
  const mushrooms = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = RING.x + Math.cos(a) * RING_R, z = RING.z + Math.sin(a) * RING_R;
    const y = terrainHeight(x, z);
    const s = 0.35 + (i % 2) * 0.1;
    batch.addRaw(new THREE.CylinderGeometry(s * 0.22, s * 0.28, s * 0.9, 6).translate(x, y + s * 0.45, z), STEM);
    batch.addRaw(new THREE.SphereGeometry(s * 0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(x, y + s * 0.9, z), CAP);

    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xf0c8ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.1);
    glow.position.set(x, y + s * 0.95, z);
    root.add(glow);
    const light = new THREE.PointLight(0xf0c8ff, 0, 5, 2);
    light.position.copy(glow.position);
    root.add(light);
    mushrooms.push({ x, y: y + s * 0.9, z, glow, light, lit: false });
  }
  const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { castShadow: true, receiveShadow: true });
  if (mesh) root.add(mesh);
  return mushrooms;
}

// ---------- Belohnungstruhe (Muster aschenklamm.js/frostzinnen.js buildChest,
// hier hellere Birkenholz-Färbung statt dunklem Kistenholz). ----------
function buildChest(pos) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xc9b896, flatShading: true });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0xe8d8b0, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), bodyMat);
  body.position.y = 0.25;
  body.castShadow = true;
  group.add(body);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.5, -0.275);
  group.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.55), trimMat);
  lid.position.set(0, 0.14, 0.275);
  lid.castShadow = true;
  lidPivot.add(lid);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0xf0d8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.position.set(0, 0.6, 0);
  glow.scale.setScalar(0.1);
  group.add(glow);
  group.visible = false;
  return { group, lidPivot, glow, opened: false, openT: -1, collected: false };
}

// ---------- Zentaur: Menschen-Oberkörper (npc.js buildFigure, Beine
// ausgeblendet) auf einem Pferde-Unterkörper (Muster fauna.js
// buildWildHippoModel, ohne Flügel/Schnabel — reine Neukomposition, kein
// bestehendes "Oberkörper-auf-Vierbeiner"-Vorbild im Code). ----------
function buildCentaur(scarfColor, hairColor, robeColor, coatColor, hairStyle = 0) {
  const upper = buildFigure(scarfColor, hairColor, robeColor, null, false, hairStyle);
  for (const m of upper.mats) m.opacity = 1;
  for (const leg of upper.legs) leg.visible = false; // Vierbeiner übernimmt die Fortbewegung

  const coatMat = new THREE.MeshLambertMaterial({ color: coatColor, flatShading: true });
  const lowerGroup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), coatMat);
  body.scale.set(0.9, 0.8, 1.7);
  body.position.set(0, 0.85, -0.3);
  body.castShadow = true;
  lowerGroup.add(body);
  const legs = [];
  for (const [lx, lz] of [[-0.26, 0.35], [0.26, 0.35], [-0.26, -0.75], [0.26, -0.75]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.95, 6), coatMat);
    leg.position.set(lx, 0.42, lz);
    lowerGroup.add(leg);
    legs.push(leg);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), coatMat);
  tail.rotation.x = Math.PI / 2.3;
  tail.position.set(0, 0.95, -1.15);
  lowerGroup.add(tail);

  // Menschlicher Oberkörper sitzt an der Schulter des Pferdeleibs — Hüfte
  // (y=0.5 in buildFigure) auf Widerristhöhe (+0.75) angehoben, leicht nach
  // vorn (Front des Pferdeleibs liegt bei z≈+0.55).
  upper.group.position.set(0, 0.75, 0.65);

  const group = new THREE.Group();
  group.add(lowerGroup);
  group.add(upper.group);

  return { group, upper, legs, gaitT: Math.random() * 10 };
}

function updateCentaur(c, dt, walking) {
  animateFigure(c.upper, dt, walking);
  c.gaitT += dt * (walking ? 2.4 : 0.6);
  const amp = walking ? 0.22 : 0.02;
  for (let i = 0; i < c.legs.length; i++) c.legs[i].rotation.x = Math.sin(c.gaitT + i * 1.5) * amp;
}

export function buildSilberhain(root, deps) {
  const { glowTex, hud, audio, fx, interact, spells, economy, heim, mounts, silberhain, onChange } = deps;

  const tree = buildSilberbaum(root, glowTex);
  const mushrooms = buildMushroomRing(root, glowTex);
  const chest = buildChest({ x: CHEST_POS.x, y: terrainHeight(CHEST_POS.x, CHEST_POS.z), z: CHEST_POS.z });
  root.add(chest.group);

  let puzzleT = 0;

  function litCount() { return mushrooms.filter(m => m.lit).length; }

  function lightMushroom(i) {
    const m = mushrooms[i];
    if (!m || m.lit) return;
    m.lit = true;
    m.glow.material.opacity = 0.9;
    m.light.intensity = 6;
    audio.feenlichtTone?.(i);
    fx.burst({ x: m.x, y: m.y, z: m.z }, 0xf0c8ff, 10, 2.5, { gravity: -1, life: 0.5 });
    if (litCount() === mushrooms.length && !silberhain.puzzleSolved) {
      silberhain.puzzleSolved = 1;
      chest.group.visible = true;
      audio.chime?.('fanfare');
      hud.showToast('🍄 Der Pilzring erwacht — ein Feenlicht führt zu einer Truhe!', 4);
      onChange?.();
    }
  }

  function updatePuzzle(dt, player) {
    puzzleT += dt;
    for (const m of mushrooms) {
      if (m.lit) {
        // sanftes Nachglühen statt starrem Vollwert (wirkt lebendiger).
        m.light.intensity = 6 * (0.85 + Math.sin(puzzleT * 2 + m.x) * 0.15);
        continue;
      }
      if (!spells.lumosOn) continue;
      const d = Math.hypot(player.pos.x - m.x, player.pos.z - m.z);
      if (d < 2.4) lightMushroom(mushrooms.indexOf(m));
    }
  }

  function updateChest(dt, player) {
    if (!chest.group.visible || chest.collected) return;
    if (!chest.opened) {
      const d = Math.hypot(player.pos.x - chest.group.position.x, player.pos.z - chest.group.position.z);
      if (d < 2.5) {
        chest.opened = true;
        chest.openT = 0;
        audio.chime?.('fanfare');
        fx.burst(chest.group.position, 0xf0d8ff, 26, 4, { gravity: -1, life: 1.0 });
      }
    }
    if (chest.openT >= 0) {
      chest.openT += dt;
      const f = Math.min(1, chest.openT / 1.0);
      chest.lidPivot.rotation.x = -1.9 * f;
      chest.glow.scale.setScalar(0.1 + f * 1.1);
      chest.glow.material.opacity = f < 0.5 ? f * 1.6 : (1 - f) * 1.6;
      if (chest.openT >= 1.0 && !chest.collected) {
        chest.collected = true;
        chest.openT = -1;
        heim.zutaten.mondsilber += 3;
        silberhain.chestCollected = 1;
        hud.showToast('🌙 3× Mondsilber gefunden!', 4);
        onChange?.();
      }
    }
  }

  // ---------- Filyra: Zentauren-Händlerin (Muster npc.js buildFero, ohne
  // Karren/Zug-Kopplung — sie steht einfach an ihrem Lagerplatz). ----------
  const filyra = buildCentaur(0x8a4ac0, 0x3a2412, 0x5a3d6a, 0xc8b898, 1);
  filyra.group.position.set(FILYRA_POS.x, terrainHeight(FILYRA_POS.x, FILYRA_POS.z), FILYRA_POS.z);
  root.add(filyra.group);
  let filyraGreeted = false;
  interact.register({
    x: FILYRA_POS.x, z: FILYRA_POS.z, r: 2.4, prompt: 'E — Mit Filyra sprechen',
    onInteract: () => {
      const lines = filyraGreeted
        ? ['Der Hain gibt selten seine Schätze her — komm wieder, wenn du mehr brauchst.']
        : ['Filyra, Hüterin dieses Hains, grüßt dich.',
           'Wir Zentauren handeln nicht leichtfertig — aber für Gold gebe ich, was der Wald entbehren kann.'];
      filyraGreeted = true;
      hud.showDialog('Filyra', lines);
    },
  });
  const filyraStallPos = { x: FILYRA_POS.x + 1.4, z: FILYRA_POS.z + 0.6 };
  interact.register({
    x: filyraStallPos.x, z: filyraStallPos.z, r: 1.6,
    get prompt() { return `E — Sternsplitter kaufen (${Math.round(14 * economy.priceMul)} Gold)`; },
    onInteract: () => {
      if (!economy.spendGold(14)) { hud.showToast('Nicht genug Gold.', 2); return; }
      heim.zutaten.stern++;
      audio.chime();
      hud.showToast(`✦ Sternsplitter gekauft (${heim.zutaten.stern}×)`, 2.5);
      onChange?.();
    },
  });
  interact.register({
    x: FILYRA_POS.x - 1.4, z: FILYRA_POS.z + 0.6, r: 1.6,
    get prompt() { return `E — Leuchtkraut kaufen (${Math.round(9 * economy.priceMul)} Gold)`; },
    onInteract: () => {
      if (!economy.spendGold(9)) { hud.showToast('Nicht genug Gold.', 2); return; }
      heim.zutaten.leuchtkraut++;
      audio.chime();
      hud.showToast(`✦ Leuchtkraut gekauft (${heim.zutaten.leuchtkraut}×)`, 2.5);
      onChange?.();
    },
  });

  // ---------- Kyrian: nicht-tödliches Bogen-Duell (Stupor auf Ziel-Orbs) ----------
  const kyrian = buildCentaur(0x2b6b8a, 0x1a1a1a, 0x3a4a5a, 0x6a5a48, 2);
  kyrian.group.position.set(KYRIAN_POS.x, terrainHeight(KYRIAN_POS.x, KYRIAN_POS.z), KYRIAN_POS.z);
  kyrian.group.rotation.y = Math.PI * 0.35;
  root.add(kyrian.group);

  const orbs = [0, 1, 2, 3].map((i) => {
    const x = KYRIAN_POS.x - 4 - i * 1.6, z = KYRIAN_POS.z - 7;
    const y = terrainHeight(x, z) + 1.3;
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xffe0a0, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.7);
    sprite.position.set(x, y, z);
    root.add(sprite);
    return { x, y, z, sprite, active: false };
  });
  let duelActive = false, duelIdx = 0, duelT = 0, duelScore = 0;

  function startDuel() {
    duelActive = true; duelIdx = 0; duelT = 0; duelScore = 0;
    for (const o of orbs) { o.active = false; o.sprite.material.opacity = 0.15; }
    orbs[0].active = true;
    orbs[0].sprite.material.opacity = 0.95;
    audio.centaurBowRelease?.();
    hud.showToast('🏹 Duell! Stupor auf die aufleuchtenden Ziele — Taste 1.', 3);
  }

  function finishDuel() {
    duelActive = false;
    for (const o of orbs) o.sprite.material.opacity = 0.15;
    if (duelScore >= orbs.length) {
      economy.addGold(15); economy.addRuf(2);
      hud.showToast(`🏆 Perfekter Treffer (${duelScore}/${orbs.length})! Kyrian verbeugt sich beeindruckt. +15 Gold`, 4);
    } else if (duelScore >= ORB_BENCHMARK) {
      economy.addGold(8);
      hud.showToast(`🤝 Ehrenvolles Unentschieden (${duelScore}/${orbs.length}). +8 Gold`, 4);
    } else {
      economy.addGold(3);
      hud.showToast(`Kyrian lächelt nachsichtig (${duelScore}/${orbs.length}) — übe weiter. +3 Gold`, 4);
    }
    onChange?.();
  }

  orbs.forEach((o, i) => {
    spells.registerTarget({
      kind: 'centaur-orb', radius: 1.0, accepts: ['stupor'],
      getPos: () => o,
      onSpell: () => {
        if (!duelActive || i !== duelIdx || !o.active) return;
        o.active = false;
        o.sprite.material.opacity = 0.15;
        duelScore++;
        fx.burst(o, 0xffe0a0, 12, 2.5, { gravity: -1, life: 0.4 });
      },
    });
  });

  function updateDuel(dt) {
    if (!duelActive) return;
    duelT += dt;
    const cur = orbs[duelIdx];
    if (duelT >= ORB_DUR || !cur.active) {
      duelIdx++;
      if (duelIdx >= orbs.length) { finishDuel(); return; }
      duelT = 0;
      orbs[duelIdx].active = true;
      orbs[duelIdx].sprite.material.opacity = 0.95;
      audio.centaurBowRelease?.();
    }
  }

  interact.register({
    x: KYRIAN_POS.x, z: KYRIAN_POS.z, r: 2.6,
    get enabled() { return !duelActive; },
    prompt: 'E — Kyrian zum Bogen-Duell herausfordern',
    onInteract: () => startDuel(),
  });

  // ---------- Sela: die stumme Zentaurin — Quest an die Einhorn-Zähmung
  // gekoppelt (narrated Gesten statt Sprache, Muster Barnaby im dunklen Pfad). ----------
  const sela = buildCentaur(0xd8d0e8, 0xc8b8a0, 0xe8e0f0, 0xf0ecf5, 0);
  sela.group.position.set(SELA_POS.x, terrainHeight(SELA_POS.x, SELA_POS.z), SELA_POS.z);
  root.add(sela.group);
  interact.register({
    x: SELA_POS.x, z: SELA_POS.z, r: 2.4, prompt: 'E — Zu Sela treten',
    onInteract: () => {
      if (mounts.einhorn && !silberhain.zentaurinQuestDone) {
        hud.showDialog('Sela', [
          'Sela lächelt zum ersten Mal. Sie neigt den Kopf — eine stille Anerkennung.',
          'Ein reines Herz braucht keine Worte, um verstanden zu werden.',
        ], () => {
          silberhain.zentaurinQuestDone = 1;
          economy.addRuf(3);
          hud.showToast('☾ Sela erkennt dich an. +3 Ruf', 3);
          onChange?.();
        });
        return;
      }
      if (silberhain.zentaurinQuestDone) {
        hud.showDialog('Sela', ['Sela nickt dir freundlich zu.']);
        return;
      }
      hud.showDialog('Sela', ['Sela deutet stumm nach Norden, tief in den Hain hinein — als wolle sie sagen: „Dort, aber nur für ein reines Herz."']);
    },
  });

  function applySavedState() {
    for (const m of mushrooms) { m.lit = false; m.glow.material.opacity = 0; m.light.intensity = 0; }
    if (silberhain.puzzleSolved) {
      for (const m of mushrooms) { m.lit = true; m.glow.material.opacity = 0.9; m.light.intensity = 6; }
      chest.group.visible = true;
    } else {
      chest.group.visible = false;
    }
    chest.opened = silberhain.chestCollected === 1;
    chest.collected = silberhain.chestCollected === 1;
    chest.openT = -1;
    chest.lidPivot.rotation.x = silberhain.chestCollected ? -1.9 : 0;
    chest.glow.material.opacity = 0;
    if (silberhain.chestCollected) chest.group.visible = false;
    filyraGreeted = false;
    duelActive = false;
    for (const o of orbs) o.sprite.material.opacity = 0.15;
  }
  applySavedState();

  return {
    update(dt, player) {
      updatePuzzle(dt, player);
      updateChest(dt, player);
      updateDuel(dt);
      tree.light.intensity = 3 + Math.sin(puzzleT * 0.8) * 0.6;
      updateCentaur(filyra, dt, false);
      updateCentaur(kyrian, dt, false);
      updateCentaur(sela, dt, false);
    },
    restore() { applySavedState(); },
  };
}
