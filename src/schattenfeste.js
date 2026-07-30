// Die Schattenfeste (PLAN-DER-DUNKLE-LORD.md): fünfte und letzte neue
// Region, Nordosten (Koordinaten + Terrain-Erhebung bereits in V1, siehe
// terrain.js SCHATTENFESTE-Konstante). V2 lieferte Turm, Ruinen-Arena,
// Ward-Barriere (hartes Fortschritts-Gate) und den Prüfstein (weiche
// Buff-Checkliste). V3 ergänzte den Endboss (voldemort.js) mit Phase 1+2.
// V4 (dieser Stand) ergänzt Phasen 3-5 + Verbannungs-Logik — Belohnung/
// Titel/Atmosphäre-Feuerwerk nach dem Sieg folgen bewusst erst in V5/V6.
//
// Bewusst KEINE unsichtbare Barriere (Lehre aus dem Grimoire-/Läuterungs-
// Bugfix in dieser Session: ein Blocker ohne sichtbares Gegenstück wirkt wie
// ein Softlock-Bug, nicht wie Absicht) — die Ward-Wand ist ein sichtbarer,
// pulsierender Schleier, der sichtbar verschwindet, sobald das Gate erfüllt
// ist.
import * as THREE from 'three';
import { terrainHeight, SCHATTENFESTE } from './terrain.js';
import { GeoBatch, addBoxBlocker } from './geo.js';
import { getMaterials } from './materials.js';
import { DunklerLord } from './voldemort.js';

const C = { x: SCHATTENFESTE.x, z: SCHATTENFESTE.z };
const ARENA_R = 16;
// Zugang von Süden (Richtung Nebelmoor, von wo der einzige Weg herführt,
// siehe terrain.js PATHS-Eintrag "Nebelmoor → Die Schattenfeste").
const GATE_POS = { x: C.x, z: C.z + ARENA_R };
const GATE_WIDTH = 5;
const PRUEFSTEIN_POS = { x: C.x, z: GATE_POS.z + 4 };
const TOWER_POS = { x: C.x, z: C.z - 9 };

const STONE_DARK = 0x171319;
const STONE_DARK2 = 0x231c28;

function buildTower(batch) {
  const y0 = terrainHeight(TOWER_POS.x, TOWER_POS.z);
  // 4 Segmente mit abnehmendem Radius — zerfallen statt gleichmäßig glatt
  // (leicht wechselnde Farbtöne + unregelmäßige Radien pro Segment).
  const segs = [
    { r0: 5.2, r1: 4.6, h: 7 },
    { r0: 4.4, r1: 3.7, h: 6.5 },
    { r0: 3.5, r1: 2.7, h: 6 },
    { r0: 2.5, r1: 1.6, h: 5.5 },
  ];
  let y = y0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const cyl = new THREE.CylinderGeometry(s.r1, s.r0, s.h, 9);
    // Bugfix: X/Z fehlten — ohne sie landete der ganze Turm bei Weltursprung
    // (0,0) statt bei TOWER_POS (im Browser entdeckt: Turm stand nahe dem
    // Schloss statt in der Schattenfeste).
    cyl.translate(TOWER_POS.x, y + s.h / 2, TOWER_POS.z);
    batch.addRaw(cyl, i % 2 === 0 ? STONE_DARK : STONE_DARK2);
    y += s.h;
  }
  // Zerbrochene Zinnen statt sauberer Turmspitze: 7 unregelmäßige Schollen
  // am oberen Rand, verschieden hoch/gekippt.
  const topR = segs[segs.length - 1].r1;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (i % 2) * 0.2;
    const shard = new THREE.BoxGeometry(0.9, 1.4 + (i % 3) * 0.6, 0.7);
    // Bugfix: rotateY/rotateZ MÜSSEN vor translate() laufen — BufferGeometry-
    // Rotationen drehen immer um den lokalen Ursprung (0,0,0). Nach einem
    // translate() an die Weltposition (~250,y,-359) drehte rotateY(a) die
    // Scholle stattdessen im Radius ~437 um den WELTURSPRUNG (im Browser
    // entdeckt: 144 Vertices weit verstreut über die ganze Karte).
    shard.rotateZ((i % 2 ? 1 : -1) * 0.18);
    shard.rotateY(a);
    shard.translate(TOWER_POS.x + Math.cos(a) * topR * 0.82, y + 0.5, TOWER_POS.z + Math.sin(a) * topR * 0.82);
    batch.addRaw(shard, STONE_DARK);
  }
  return { x: TOWER_POS.x, z: TOWER_POS.z, topY: y + 1.6 };
}

function buildArenaRing(batch) {
  const N = 14;
  const rng2 = (seed) => { let t = seed; return () => { t = (t * 1103515245 + 12345) & 0x7fffffff; return t / 0x7fffffff; }; };
  const rnd = rng2(777);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const px = C.x + Math.cos(a) * ARENA_R, pz = C.z + Math.sin(a) * ARENA_R;
    const y = terrainHeight(px, pz);
    const broken = rnd() < 0.35;
    const h = broken ? 0.9 + rnd() * 0.8 : 2.4 + rnd() * 1.3;
    const pillar = new THREE.CylinderGeometry(0.42, 0.5, h, 7);
    pillar.translate(0, h / 2, 0);
    if (broken) pillar.rotateZ((rnd() - 0.5) * 0.9); // umgestürzt/schräg
    pillar.translate(px, y, pz);
    batch.addRaw(pillar, i % 3 === 0 ? STONE_DARK2 : STONE_DARK);
    if (!broken) addBoxBlocker(px - 0.5, px + 0.5, y, y + h, pz - 0.5, pz + 0.5);
  }
}

function buildWard(root, glowTex) {
  const y = terrainHeight(GATE_POS.x, GATE_POS.z);
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x8a2fd1, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(GATE_WIDTH + 1.5, 4.4, 1);
  sprite.position.set(GATE_POS.x, y + 2.1, GATE_POS.z);
  root.add(sprite);
  const light = new THREE.PointLight(0x8a2fd1, 3, 12, 2);
  light.position.set(GATE_POS.x, y + 2.1, GATE_POS.z);
  root.add(light);
  const blocker = addBoxBlocker(GATE_POS.x - GATE_WIDTH / 2, GATE_POS.x + GATE_WIDTH / 2, y - 1, y + 3.5, GATE_POS.z - 0.5, GATE_POS.z + 0.5);
  return { sprite, mat, light, blocker };
}

function buildPruefstein(batch, glowTex) {
  const y = terrainHeight(PRUEFSTEIN_POS.x, PRUEFSTEIN_POS.z);
  const base = new THREE.CylinderGeometry(0.5, 0.62, 1.1, 8);
  base.translate(PRUEFSTEIN_POS.x, y + 0.55, PRUEFSTEIN_POS.z);
  batch.addRaw(base, STONE_DARK2);
  const shardMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xd8c0ff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  return { x: PRUEFSTEIN_POS.x, y: y + 1.3, z: PRUEFSTEIN_POS.z, shardMat };
}

// Harte Fortschritts-Prüfung fürs Tor — nur Besitz/Abschluss, nicht
// "ausgerüstet" (das prüft nur die weiche Checkliste am Prüfstein selbst,
// Abschnitt 5 des Plans).
function hardGateMet(pz, moor, hallowsSave, siegel) {
  return pz?.hauspokal === 1
    && moor?.laterne === 1
    && hallowsSave?.stab === 1 && hallowsSave?.umhang === 1 && hallowsSave?.stein === 1
    && siegel?.finaleWon === 1;
}

export function buildSchattenfeste(root, deps) {
  const { glowTex, hud, audio, fx, interact, spells, hallowsSys, health, pz, moor, hallowsSave, siegel, lord, economy, onChange } = deps;

  // V3: eigenes System-Shim für den Endboss (Muster: hallows.js' `system` für
  // PaleKing) — `peaceful` wird EINMALIG aus dem Getter in deps übernommen
  // (buildSchattenfeste läuft lazy beim ersten Wecken, siehe schwarzwasser.js-
  // Präzedenzfall), spätere Umschaltungen laufen über die peaceful-Property
  // am zurückgegebenen Handle unten.
  // hallowsSys/hallowsSave (V4): Phase 4 braucht beide für die steinCd-
  // Warnung ("Stein heute schon verbraucht") — dieselben Referenzen, die
  // checklistLines() oben schon nutzt, hier nur zusätzlich ins System-Shim
  // durchgereicht.
  const lordSystem = {
    scene: root, fx, audio, hud, health, peaceful: !!deps.peaceful, time: 0,
    hallowsSys, hallowsSave,
  };
  const dunklerLord = new DunklerLord(lordSystem, glowTex, C, ARENA_R);
  dunklerLord.onPhaseReached = (n) => {
    if (n > (lord.phaseMax || 0)) { lord.phaseMax = n; onChange?.(); }
  };
  // V4: Sieg-Persistenz — `besiegt` selbst. Titel (marauders-map, V6) liest
  // dieses Flag bereits. V8 (Plan-Abschnitt 8, Belohnungszeile "größter
  // Einzelbetrag im Spiel"): +200 Gold/+40 Ruf im selben Einmal-Guard —
  // das Atmosphäre-Feuerwerk bleibt bewusst außen vor (kein Plan-Punkt).
  dunklerLord.onDefeated = () => {
    if (lord.besiegt !== 1) {
      lord.besiegt = 1;
      economy.addGold(200);
      economy.addRuf(40);
      onChange?.();
      hud.showToast('🖤 Der Dunkle Lord ist besiegt. +200 Gold, +40 Ruf.', 5);
    }
  };

  const batch = new GeoBatch();
  const tower = buildTower(batch);
  buildArenaRing(batch);
  const pruefstein = buildPruefstein(batch, glowTex);
  // deco (untexturiert, reine Vertexfarbe) statt stone — Turm/Säulen sind
  // freie Batch-Formen wie die Standsteine in finale.js, keine Mauerwerk-
  // Wandflächen wie in castle.js/village.js (dort ist die UV-gemappte
  // stone-Textur richtig, hier würde sie auf der gemergten Geometrie verzerrt
  // wirken).
  const mesh = batch.build(getMaterials().deco, { castShadow: true, receiveShadow: true });
  if (mesh) root.add(mesh);

  const ward = buildWard(root, glowTex);
  const pruefsteinShard = new THREE.Sprite(pruefstein.shardMat);
  pruefsteinShard.scale.setScalar(0.55);
  pruefsteinShard.position.set(pruefstein.x, pruefstein.y, pruefstein.z);
  root.add(pruefsteinShard);

  let gateOpen = false;
  let time = 0;

  function setWardOpen(open) {
    gateOpen = open;
    ward.blocker.disabled = open;
    ward.mat.opacity = open ? 0 : 0.55;
    ward.light.intensity = open ? 0 : 3;
  }

  // Stiller Sync beim (erneuten) Aufwachen der Region — KEIN Toast/Effekt,
  // falls das Tor schon in einer früheren Sitzung geöffnet wurde (Muster:
  // aschenklamm.js applySavedState — Replay-Animationen nur beim EINMALIGEN
  // Live-Übergang, nie beim bloßen Wiederbetreten).
  function applySavedState() {
    setWardOpen(lord.torOffen === 1);
  }
  applySavedState();

  function checklistLines() {
    const lines = ['Der Stein prüft dich:'];
    const item = (ok, label, hint) => `${ok ? '✓' : '✗'} ${label}${ok ? '' : ` — ${hint}`}`;
    lines.push(item(!!spells.eisblitzUnlocked, 'Eisblitz', 'der Schild fürchtet ihn'));
    lines.push(item(!!spells.epUnlocked, 'Expecto Patronum', 'gegen das, was er ruft'));
    lines.push(item(hallowsSys.umhangActive, 'Umhang angelegt', 'sein Blick durchbohrt dich sonst'));
    lines.push(item(hallowsSys.steinActive, 'Stein angelegt', 'er schlägt einmal tödlich zu'));
    lines.push(item(hallowsSys.elderstabActive, 'Elderstab angelegt', 'sonst heilt er schneller, als du schlägst'));
    lines.push(item(health.hearts >= health.maxHearts, `${health.hearts} von ${health.maxHearts} Herzen`, 'volle Herzen rein zur Sicherheit'));
    return lines;
  }

  interact.register({
    x: PRUEFSTEIN_POS.x, z: PRUEFSTEIN_POS.z, r: 2.4,
    prompt: 'E — Den Prüfstein befragen',
    onInteract: () => {
      if (!hardGateMet(pz, moor, hallowsSave, siegel)) {
        hud.showDialog('Der Prüfstein', [
          'Der Stein bleibt kalt und stumm.',
          'Erst wenn Hauspokal, Seelenlaterne, alle drei Heiligtümer und das Sternentor dein sind, öffnet sich der Weg.',
        ]);
        return;
      }
      hud.showDialog('Der Prüfstein', checklistLines());
      audio.chime?.();
    },
  });

  return {
    update(dt, player) {
      time += dt;
      pruefsteinShard.scale.setScalar(0.5 + Math.sin(time * 1.6) * 0.08);
      if (!gateOpen) {
        ward.mat.opacity = 0.45 + Math.sin(time * 1.8) * 0.12;
        ward.light.intensity = 2.6 + Math.sin(time * 1.8) * 0.8;
        if (hardGateMet(pz, moor, hallowsSave, siegel)) {
          lord.torOffen = 1;
          setWardOpen(true);
          hud.showToast('🖤 Die Ward-Barriere vor der Schattenfeste zerfällt — der Weg zum Dunklen Lord ist frei.', 5);
          audio.ritualChant?.();
          fx.burst({ x: GATE_POS.x, y: ward.sprite.position.y, z: GATE_POS.z }, 0x8a2fd1, 30, 4, { gravity: -1, life: 1.1 });
          onChange?.();
        }
      }
      // V3: der Kampf beginnt, sobald das Tor offen ist UND der Spieler die
      // Arena betritt — kein Auto-Trigger von außerhalb (Muster: PaleKing
      // triggert per Mitternacht, hier per Betreten, da die Ward das
      // "verfrühte Betreten" bereits verhindert hat).
      if (gateOpen && dunklerLord.state === 'sealed') {
        const dx = player.pos.x - C.x, dz = player.pos.z - C.z;
        if (dx * dx + dz * dz < ARENA_R * ARENA_R) {
          lord.versuche = (lord.versuche || 0) + 1;
          onChange?.();
          dunklerLord.rise();
        }
      }
      dunklerLord.update(dt, player);
    },
    restore() {
      applySavedState();
      dunklerLord.reset();
    },
    lord: dunklerLord,
    get peaceful() { return lordSystem.peaceful; },
    set peaceful(v) { lordSystem.peaceful = v; },
  };
}
