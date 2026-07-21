// Wispernde Kate: Unterschlupf & Braukessel (S7, PLAN-SCHATTEN-UND-SCHWINGEN.md
// Abschnitt 7). Kauf (Gold ODER hoher Ruf) schaltet die Einrichtung frei:
// Bett (Rasten bis Morgen/Abend, vollheilen), Braukessel (4 Rezepte aus
// Weltzutaten), 3 leere Podeste (S10), Kreaturen-Ecke (S9), Trophäenregal
// (reiner Save-Read). Dazu Meteor-Nächte: seltene Sternschnuppen lassen
// Sternsplitter in der Wildmark liegen, verschwinden im Morgengrauen.

import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

const KAUF_GOLD = 60;
const RUF_FREI = 30; // ab diesem Ruf ist die Kate ein Geschenk der Nachbarschaft

const MORNING_T = 0.28; // sky.timeOfDay-Ziel für "bis zum Morgen rasten"
const EVENING_T = 0.75; // ... "bis zum Abend"

const POTION_DUR = 300; // 5 Minuten, exakt wie im Plan
const RECIPES = [
  { id: 'flink', name: 'Flinktrank', need: { glitzer: 1, leuchtkraut: 1 }, desc: 'Tempo ×1.3' },
  { id: 'herz', name: 'Herztrank', need: { seide: 1, leuchtkraut: 1 }, desc: '+2 Herzen' },
  { id: 'frost', name: 'Frostbann', need: { stern: 1, glitzer: 1 }, desc: 'Frost-Immunität' },
  { id: 'dunkel', name: 'Dunkler Sud', need: { essenz: 1, seide: 1 }, desc: 'Spruchschaden ×1.5 (nur dunkler Pfad)' },
];
const ZUTAT_NAMES = { glitzer: 'Glitzerstaub', seide: 'Spinnenseide', stern: 'Sternsplitter', essenz: 'Dunkle Essenz', leuchtkraut: 'Leuchtkraut' };

// Meteor-Nächte (Sternsplitter): in klaren Nächten 15% Chance beim
// Abend-Übergang, 2 Splitter landen zufällig in der Wildmark, verschwinden
// im Morgengrauen — dieselbe Bounding-Box wie Silberauen/Fahlholz/Kate.
const METEOR_CHANCE = 0.15;
const SPLITTER_BOX = { x0: 200, x1: 380, z0: -40, z1: 180 };
const SPLITTER_RANGE = 1.6;

function el(mat, geo, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export function buildHome(scene, camera, glowTex, hud, audio, fx, health, interact, economy, kate, deps) {
  // deps = { heim, sky, weather, player } — heim: direkte Save-Referenz
  // (Muster S3-S7), sky/weather: für Bett-Rasten + Meteor-Nächte-Erkennung.
  const { heim, sky, weather } = deps;
  let currentPlayer = deps.player;
  let onChange = null;

  const kx = kate.x, kz = kate.z, ky = kate.y;
  const halfW = kate.w / 2, halfD = kate.d / 2;

  // ---------- Aushang: "Verlassen — wer mich pflegt, dem gehöre ich" ----------
  const signPost = new THREE.Group();
  const signMat = new THREE.MeshLambertMaterial({ color: 0x5c4630, flatShading: true });
  signPost.add(el(signMat, new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), 0, 0.75, 0));
  signPost.add(el(new THREE.MeshLambertMaterial({ color: 0x8a7050, flatShading: true }), new THREE.BoxGeometry(0.7, 0.45, 0.05), 0, 1.35, 0.03));
  const signX = kx - 0.9, signZ = kz - halfD - 1.2;
  signPost.position.set(signX, terrainHeight(signX, signZ), signZ);
  signPost.rotation.y = 0.15;
  signPost.visible = true;
  scene.add(signPost);

  const ownEntry = interact.register({
    x: signX, z: signZ, r: 3,
    get enabled() { return !heim.kate; },
    get prompt() {
      return economy.ruf >= RUF_FREI
        ? 'E — Kate übernehmen (die Nachbarschaft vertraut dir)'
        : `E — Kate kaufen (${Math.round(KAUF_GOLD * economy.priceMul)} Gold)`;
    },
    onInteract: () => {
      if (economy.ruf < RUF_FREI && !economy.spendGold(KAUF_GOLD)) {
        hud.showToast('Nicht genug Gold.', 2);
        return;
      }
      heim.kate = 1;
      applyOwnership();
      hud.showToast('🏠 Die Wispernde Kate gehört jetzt dir!', 4);
      audio.chime?.('fanfare');
      fx.burst({ x: kx, y: ky + 1.5, z: kz }, 0xffd98c, 24, 3.5, { gravity: -2, life: 1 });
      onChange?.();
    },
  });

  // ---------- Einrichtung (nur sichtbar/nutzbar sobald heim.kate=1) ----------
  const furniture = new THREE.Group();
  furniture.visible = false;
  scene.add(furniture);

  const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c4630, flatShading: true });
  const woodDarkMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1c, flatShading: true });
  const blanketMat = new THREE.MeshLambertMaterial({ color: 0x6a3a4a, flatShading: true });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x8b847b, flatShading: true });
  const cauldronMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2e, flatShading: true });
  const rugMat = new THREE.MeshLambertMaterial({ color: 0x7a4a3a, flatShading: true });

  // Bett (Nordost-Ecke)
  const bedX = kx + 1.7, bedZ = kz + 1.6;
  const bedY = ky;
  furniture.add(el(woodDarkMat, new THREE.BoxGeometry(1.7, 0.35, 1.0), bedX, bedY + 0.18, bedZ));
  furniture.add(el(blanketMat, new THREE.BoxGeometry(1.6, 0.12, 0.9), bedX, bedY + 0.41, bedZ));
  furniture.add(el(new THREE.MeshLambertMaterial({ color: 0xe0d8c8, flatShading: true }), new THREE.BoxGeometry(0.4, 0.15, 0.85), bedX - 0.6, bedY + 0.5, bedZ));

  // Braukessel (Südost, dreibeinig über einer kleinen Feuerstelle)
  const cauldronX = kx + 0.9, cauldronZ = kz - 1.5;
  const cauldronY = ky;
  furniture.add(el(stoneMat, new THREE.CylinderGeometry(0.55, 0.6, 0.12, 10), cauldronX, cauldronY + 0.06, cauldronZ));
  const cauldronBody = el(cauldronMat, new THREE.SphereGeometry(0.42, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.62), cauldronX, cauldronY + 0.62, cauldronZ);
  furniture.add(cauldronBody);
  const cauldronBrewMat = new THREE.MeshBasicMaterial({ color: 0x4ad8a0, transparent: true, opacity: 0 });
  const cauldronBrew = el(cauldronBrewMat, new THREE.CircleGeometry(0.32, 10), cauldronX, cauldronY + 0.78, cauldronZ);
  cauldronBrew.rotation.x = -Math.PI / 2;
  furniture.add(cauldronBrew);
  for (const a of [0, 2.1, 4.2]) {
    const leg = el(woodDarkMat, new THREE.CylinderGeometry(0.04, 0.04, 0.35, 4), cauldronX + Math.cos(a) * 0.32, cauldronY + 0.18, cauldronZ + Math.sin(a) * 0.32);
    leg.rotation.z = Math.cos(a) * 0.3;
    leg.rotation.x = Math.sin(a) * 0.3;
    furniture.add(leg);
  }

  // 3 Podeste entlang der Rückwand — hallows.js (S10) hängt hier per E
  // an/ablegbare Heiligtums-Anzeigen dran (Muster: Kreaturen-Ecke-restSpot,
  // in S7 nur die Position vorbereitet, S10 füllt sie). id-Reihenfolge
  // entspricht der Plan-Auflistung (Elderstab, Umhang, Stein).
  const pedestalMat = stoneMat;
  const podeste = [];
  for (const [px, id] of [[-0.9, 'stab'], [0, 'umhang'], [0.9, 'stein']]) {
    const pos = { x: kx + px, y: ky + 0.75, z: kz + 2.15 };
    const ped = el(pedestalMat, new THREE.CylinderGeometry(0.28, 0.32, 0.75, 8), pos.x, ky + 0.375, pos.z);
    furniture.add(ped);
    podeste.push({ id, mesh: ped, x: pos.x, y: pos.y, z: pos.z });
  }

  // Kreaturen-Ecke (Südwest) — reine Deko, S9 lässt hier später den
  // weggeschickten Begleiter dösen.
  const rugX = kx - 1.9, rugZ = kz - 1.6;
  const rug = el(rugMat, new THREE.CylinderGeometry(0.7, 0.7, 0.03, 12), rugX, ky + 0.02, rugZ);
  furniture.add(rug);
  furniture.add(el(woodMat, new THREE.CylinderGeometry(0.22, 0.26, 0.3, 8), rugX + 0.35, ky + 0.15, rugZ - 0.2));

  // Trophäenregal (Westwand, Vorderhälfte) — reiner Read aus dem Save,
  // keine eigene Interaktion.
  const shelfX = kx - halfW + 0.35, shelfZ = kz - 1.2;
  furniture.add(el(woodDarkMat, new THREE.BoxGeometry(0.1, 0.06, 1.4), shelfX, ky + 1.5, shelfZ));
  const trophyGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffd98c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const trophies = [
    { sprite: new THREE.Sprite(trophyGlowMat.clone()), z: shelfZ - 0.45, get done() { return !!deps.puzzles?.finaleWon; } },
    { sprite: new THREE.Sprite(trophyGlowMat.clone()), z: shelfZ, get done() { return !!deps.moor?.laterneCollected; } },
    { sprite: new THREE.Sprite(trophyGlowMat.clone()), z: shelfZ + 0.45, get done() { return !!deps.spells?.epUnlocked; } },
  ];
  for (const t of trophies) {
    t.sprite.position.set(shelfX + 0.15, ky + 1.62, t.z);
    t.sprite.scale.setScalar(0.35);
    furniture.add(t.sprite);
  }

  function applyOwnership() {
    kate.setOwned(true);
    furniture.visible = true;
    // ownEntry.enabled ist ein reaktiver Getter (!heim.kate) — heim.kate=1
    // wurde bereits vom Aufrufer gesetzt, keine manuelle Zuweisung nötig
    // (die wäre auch ein TypeError: nur-Getter-Property).
  }

  function updateTrophies() {
    for (const t of trophies) t.sprite.material.opacity = t.done ? 0.9 : 0;
  }

  // ---------- Bett: Rasten bis Morgen/Abend ----------
  interact.register({
    x: bedX, z: bedZ, r: 1.5,
    get enabled() { return heim.kate === 1; },
    get prompt() {
      return sky.state.nightGlow > 0.5 ? 'E — Rasten bis zum Morgen' : 'E — Rasten bis zum Abend';
    },
    onInteract: () => {
      const wasNight = sky.state.nightGlow > 0.5;
      sky.timeOfDay = wasNight ? MORNING_T : EVENING_T;
      health.hearts = health.effectiveMaxHearts;
      hud.setHearts(health.hearts, health.effectiveMaxHearts);
      hud.showToast(wasNight ? '☀️ Du wachst erholt auf. ♥ voll!' : '🌙 Der Abend bricht an. ♥ voll!', 3);
      audio.chime?.();
    },
  });

  // ---------- Braukessel: 4 Rezept-Stationen um den Kessel ----------
  const cauldronAngles = [-0.7, -0.25, 0.25, 0.7];
  RECIPES.forEach((r, i) => {
    const a = cauldronAngles[i];
    const sx = cauldronX + Math.sin(a) * 0.85, sz = cauldronZ + Math.cos(a) * 0.85 - 0.3;
    const jar = el(new THREE.MeshLambertMaterial({ color: 0x2c2c34, flatShading: true }), new THREE.CylinderGeometry(0.1, 0.12, 0.22, 6), sx, ky + 0.11, sz);
    furniture.add(jar);
    interact.register({
      x: sx, z: sz, r: 1.1,
      get enabled() { return heim.kate === 1; },
      get prompt() {
        const have = Object.entries(r.need).every(([k, n]) => heim.zutaten[k] >= n);
        const needStr = Object.entries(r.need).map(([k, n]) => `${n}× ${ZUTAT_NAMES[k]}`).join(' + ');
        return have
          ? `E — ${r.name} brauen (${needStr})`
          : `${r.name}: ${needStr} (nicht genug)`;
      },
      onInteract: () => {
        const have = Object.entries(r.need).every(([k, n]) => heim.zutaten[k] >= n);
        if (!have) { hud.showToast('Nicht genug Zutaten.', 2); return; }
        for (const [k, n] of Object.entries(r.need)) heim.zutaten[k] -= n;
        heim.trank.id = r.id;
        heim.trank.restT = POTION_DUR;
        hud.showToast(`🧪 ${r.name} gebraut! ${r.desc} (5 min)`, 4);
        audio.chime?.('fanfare');
        fx.burst({ x: cauldronX, y: cauldronY + 0.8, z: cauldronZ }, 0x4ad8a0, 22, 3, { gravity: -2, life: 0.8 });
        onChange?.();
      },
    });
  });

  // ---------- Meteor-Nächte: Sternsplitter in der Wildmark ----------
  const splitterMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xbfe0ff, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const splitters = [null, null]; // { sprite, x, z, entry } | null
  let lastNightGlow = 0;
  let meteorRolledTonight = false;

  function randSplitterSpot() {
    for (let i = 0; i < 8; i++) {
      const x = SPLITTER_BOX.x0 + Math.random() * (SPLITTER_BOX.x1 - SPLITTER_BOX.x0);
      const z = SPLITTER_BOX.z0 + Math.random() * (SPLITTER_BOX.z1 - SPLITTER_BOX.z0);
      const h = terrainHeight(x, z);
      if (h > 1) return { x, z, y: h };
    }
    return { x: SPLITTER_BOX.x0, z: SPLITTER_BOX.z0, y: terrainHeight(SPLITTER_BOX.x0, SPLITTER_BOX.z0) };
  }

  function spawnMeteorNight() {
    clearSplitters(); // Sicherheitsnetz: verhindert verwaiste Sprites, falls
    // der Debug-Hook mehrfach ohne Kollektion/Morgengrauen dazwischen feuert.
    for (let i = 0; i < 2; i++) {
      const spot = randSplitterSpot();
      const sprite = new THREE.Sprite(splitterMat.clone());
      sprite.position.set(spot.x, spot.y + 0.6, spot.z);
      sprite.scale.setScalar(0.5);
      scene.add(sprite);
      const light = new THREE.PointLight(0xbfe0ff, 3, 5, 2);
      light.position.copy(sprite.position);
      scene.add(light);
      splitters[i] = { sprite, light, x: spot.x, z: spot.z };
    }
    // Sternschnuppen-Streifen: ein paar hohe, schnell verblassende Bursts
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 80;
      fx.burst({ x: kx + Math.cos(a) * r, y: 90 + Math.random() * 30, z: kz + Math.sin(a) * r }, 0xd8f0ff, 14, 8, { gravity: -1, life: 0.7 });
    }
    hud.showToast('🌠 Eine Sternschnuppennacht! Irgendwo landeten Sternsplitter …', 3.5);
  }

  function clearSplitters() {
    for (let i = 0; i < splitters.length; i++) {
      const s = splitters[i];
      if (!s) continue;
      scene.remove(s.sprite);
      scene.remove(s.light);
      splitters[i] = null;
    }
  }

  function collectSplitter(i, player) {
    const s = splitters[i];
    if (!s) return;
    const dx = s.x - player.pos.x, dz = s.z - player.pos.z;
    if (dx * dx + dz * dz > SPLITTER_RANGE * SPLITTER_RANGE) return;
    scene.remove(s.sprite);
    scene.remove(s.light);
    splitters[i] = null;
    heim.zutaten.stern += 1;
    audio.chime?.();
    hud.showToast(`✨ Sternsplitter gefunden (${heim.zutaten.stern}× im Vorrat)`, 2.5);
    onChange?.();
  }

  // Tracker-Info (HUD-Kompass) für den nächsten Sternsplitter, Muster
  // broom.js getTrackerInfo() / collectibles.nearest() — {dist, angle}.
  function getSplitterTracker(player) {
    let best = null, bestD2 = Infinity;
    for (const s of splitters) {
      if (!s) continue;
      const dx = s.x - player.pos.x, dz = s.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = s; }
    }
    if (!best) return null;
    return { dist: Math.sqrt(bestD2), angle: Math.atan2(best.x - player.pos.x, -(best.z - player.pos.z)) };
  }

  return {
    set onChange(fn) { onChange = fn; },
    getSplitterTracker,
    // S9: Rastplatz für den weggeschickten Begleiter (Kreaturen-Ecke, s.o.) —
    // nur sinnvoll, solange heim.kate=1 ist (furniture.visible).
    restSpot: { x: rugX - 0.3, y: ky, z: rugZ + 0.3 },
    // S10: die 3 Podeste (Mesh + Weltposition), furniture-Sichtbarkeit
    // (an heim.kate gekoppelt) gilt automatisch mit, da die Icons als
    // Kind-Objekte der Podest-Meshes angehängt werden.
    podeste,

    update(dt, player) {
      currentPlayer = player;
      // Trankdauer läuft nur beim aktiven Spielen herunter (wie sky.timeOfDay).
      if (heim.trank.restT > 0) {
        heim.trank.restT -= dt;
        if (heim.trank.restT <= 0) {
          heim.trank.restT = 0;
          heim.trank.id = '';
          hud.showToast('Die Wirkung des Trankes lässt nach.', 2.2);
          onChange?.();
        }
      }
      cauldronBrewMat.opacity = heim.trank.id ? 0.75 + Math.sin(performance.now() * 0.004) * 0.15 : 0;

      updateTrophies();

      // Meteor-Nacht: einmal pro Abend-Übergang würfeln (nightGlow kreuzt
      // 0.35 aufwärts = Dämmerung), Splitter verschwinden beim nächsten
      // Morgengrauen (kreuzt 0.35 abwärts) — Muster Wilderer-Lager-Rotation.
      const ng = weather.state === 'klar' ? sky.state.nightGlow : sky.state.nightGlow;
      if (lastNightGlow < 0.35 && ng >= 0.35) {
        meteorRolledTonight = false;
      }
      if (!meteorRolledTonight && ng >= 0.35) {
        meteorRolledTonight = true;
        if (weather.state === 'klar' && Math.random() < METEOR_CHANCE) spawnMeteorNight();
      }
      if (lastNightGlow >= 0.35 && ng < 0.35) {
        clearSplitters();
      }
      lastNightGlow = ng;

      for (let i = 0; i < splitters.length; i++) collectSplitter(i, player);
    },

    // Reset-Button: Eigentum + Trank zurücksetzen, Läden/Kamin wieder
    // "verlassen", Splitter räumen. Zutaten-Reset läuft weiterhin zentral
    // in main.js (Object.assign auf heim.zutaten).
    restore() {
      kate.setOwned(!!heim.kate);
      furniture.visible = !!heim.kate;
      // ownEntry.enabled ist ein reaktiver Getter, siehe applyOwnership().
      if (!heim.kate) clearSplitters();
      meteorRolledTonight = false;
      cauldronBrewMat.opacity = 0;
    },

    // Debug-Hook (DoD-Test): erzwingt sofort eine Meteor-Nacht.
    forceMeteorNight() { spawnMeteorNight(); },
  };
}
