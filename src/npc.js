// NPCs & Quests: wandernde Schüler (reine Deko), Lena + Wirt Barnaby
// (Questgeber), Schlossgeist (dynamischer Hinweisgeber, liest den
// Spielstand), Katze Musch (Quest-Ziel Q1, Follow-FSM ohne Pathfinding).

import * as THREE from 'three';
import { terrainHeight, PATHS } from './terrain.js';
import { mulberry32 } from './noise.js';
import { GASTHAUS } from './village.js';
import { ARTIFACT_ORDER } from './puzzles.js';
import { GeoBatch } from './geo.js';
import { getMaterials } from './materials.js';
import { RUF_HIGH, RUF_LOW } from './economy.js';

const HOUSE_COLORS = [0xa62b2b, 0x2b6b35, 0x2b4b9b, 0xbfa32b];
const HAIR_COLORS = [0x2a1c10, 0x1a1a1a, 0x5a3c22, 0x8a7050];
const SKIN = 0xd9a878;
const ROBE_DARK = 0x272c3e;
const LENA_ROBE = 0x3a3350;
const BARNABY_ROBE = 0x4a3323;

const STUDENT_PATHS = [PATHS[0], PATHS[1], PATHS[3], PATHS[4]];
// Hexer-Route (S2): verkettete Wildmark-PATHS-Segmente aus S1 (Index 9-13,
// Steinkreis→Hügelgrab→Silberauen→Fahlholz→Kate→Waldlichtung) zu EINER
// langen Patrouille zusammengefügt (jeder Folge-Punkt lässt den doppelten
// Übergangspunkt weg, da die Segmente exakt aneinander anschließen).
const WIZARD_PATH = [
  ...PATHS[9], ...PATHS[10].slice(1), ...PATHS[11].slice(1), ...PATHS[12].slice(1), ...PATHS[13].slice(1),
];
const LENA_POS = { x: 14, z: 20 };
const BARNABY_POS = { x: GASTHAUS.x, z: GASTHAUS.z + GASTHAUS.d / 2 - 1.7 };
const CAT_POS = { x: -95, z: 165 };
const GEIST_POS = { x: -32, z: 8 };

const PUZZLE_HINTS = {
  flamme: 'den drei Feuerschalen auf dem Viadukt',
  krone: 'den Druckplatten im Nordgarten',
  stein: 'dem Lied der Steine im Steinkreis',
  karte: 'dem Sternbild am Astronomieturm — nur nachts sichtbar',
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ---------- Figur: Robe (Kegel) + Kopf (Kugel) + Haar (Halbkugel) + Schal (Torus-Segment) ----------
// hatColor (S2, optional): setzt zusätzlich einen Spitzhut auf — einziger
// visueller Unterschied zu Schülern, macht die wandernden Hexer erkennbar.
function buildFigure(scarfColor, hairColor, robeColor = ROBE_DARK, hatColor = null) {
  const group = new THREE.Group();

  const robeMat = new THREE.MeshLambertMaterial({ color: robeColor, flatShading: true, transparent: true });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 8), robeMat);
  robe.position.y = 0.575;
  robe.castShadow = true;
  group.add(robe);

  const headMat = new THREE.MeshLambertMaterial({ color: SKIN, flatShading: true, transparent: true });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), headMat);
  head.position.y = 1.28;
  group.add(head);

  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor, flatShading: true, transparent: true });
  const hairGeo = new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.3;
  group.add(hair);

  const scarfMat = new THREE.MeshLambertMaterial({ color: scarfColor, flatShading: true, transparent: true });
  const scarfGeo = new THREE.TorusGeometry(0.16, 0.05, 5, 10, Math.PI * 1.5);
  scarfGeo.rotateX(Math.PI / 2);
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.position.y = 1.08;
  scarf.rotation.y = Math.random() * Math.PI * 2;
  group.add(scarf);

  const mats = [robeMat, headMat, hairMat, scarfMat];
  if (hatColor) {
    const hatMat = new THREE.MeshLambertMaterial({ color: hatColor, flatShading: true, transparent: true });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 9), hatMat);
    brim.position.y = 1.41;
    group.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 8), hatMat);
    cone.position.y = 1.63;
    group.add(cone);
    mats.push(hatMat);
  }

  return { group, robe, head, mats, t: Math.random() * 10 };
}

function animateFigure(fig, dt, walking) {
  fig.t += dt;
  const freq = walking ? 6 : 1.4;
  const bobAmp = walking ? 0.035 : 0.015;
  fig.head.position.y = 1.28 + Math.sin(fig.t * freq) * bobAmp;
  fig.robe.rotation.z = Math.sin(fig.t * freq) * (walking ? 0.14 : 0.03);
}

function setFigureOpacity(fig, f) {
  for (const m of fig.mats) m.opacity = f;
  fig.group.visible = f > 0.01;
}

// Ruf-Reaktion (S3): reine Verhaltens-Variation, sperrt nichts (Ruf ist
// FLAVOR, K12). Ab RUF_LOW weichen Schüler dem Spieler aus, ab RUF_HIGH
// grüßen sie kurz (Blick zum Spieler), statt einfach vorbeizulaufen.
const RUF_FLEE_RANGE = 6, RUF_GREET_RANGE = 4, RUF_FLEE_SPEED = 2.6;

// ---------- Wandernde Schüler: reine Deko, kein Interakt ----------
class Student {
  constructor(scene, pathPts, idx) {
    const fig = buildFigure(HOUSE_COLORS[idx % 4], HAIR_COLORS[idx % 4]);
    for (const m of fig.mats) m.opacity = 1;
    this.fig = fig;
    this.group = fig.group;
    this.path = pathPts;
    this.idx = 1;
    this.dir = 1;
    this.speed = 1.2;
    this.state = 'walk';
    this.stateT = 0;
    this.pauseDur = 0;
    this.fade = 1;
    this._greeted = false;
    const [sx, sz] = pathPts[0];
    this.group.position.set(sx, terrainHeight(sx, sz), sz);
    scene.add(this.group);
  }

  update(dt, nightGlow, player, ruf) {
    if (nightGlow > 0.55) this.fade = Math.max(0, this.fade - dt / 2.5);
    else if (nightGlow < 0.35) this.fade = Math.min(1, this.fade + dt / 2.5);
    setFigureOpacity(this.fig, this.fade);
    if (this.fade <= 0.01) return;

    let dPlayer = Infinity;
    if (player) dPlayer = Math.hypot(player.pos.x - this.group.position.x, player.pos.z - this.group.position.z);

    if (ruf <= RUF_LOW && dPlayer < RUF_FLEE_RANGE) this.state = 'flee';
    else if (this.state === 'flee' && dPlayer >= RUF_FLEE_RANGE * 1.3) { this.state = 'walk'; }
    else if (ruf >= RUF_HIGH && dPlayer < RUF_GREET_RANGE && this.state === 'walk' && !this._greeted) {
      this.state = 'greet'; this.stateT = 0; this._greeted = true;
    }
    if (dPlayer >= RUF_GREET_RANGE * 1.5) this._greeted = false;

    if (this.state === 'flee') {
      const dx = this.group.position.x - player.pos.x, dz = this.group.position.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d, nz = dz / d;
      this.group.position.x += nx * RUF_FLEE_SPEED * dt;
      this.group.position.z += nz * RUF_FLEE_SPEED * dt;
      this.group.position.y = terrainHeight(this.group.position.x, this.group.position.z);
      this.group.rotation.y = Math.atan2(-nx, -nz);
      animateFigure(this.fig, dt, true);
      return;
    }
    if (this.state === 'greet') {
      this.stateT += dt;
      const dx = player.pos.x - this.group.position.x, dz = player.pos.z - this.group.position.z;
      this.group.rotation.y = Math.atan2(-dx, -dz);
      animateFigure(this.fig, dt, false);
      if (this.stateT >= 1.6) { this.state = 'walk'; this.stateT = 0; }
      return;
    }
    if (this.state === 'pause') {
      this.stateT += dt;
      animateFigure(this.fig, dt, false);
      if (this.stateT >= this.pauseDur) { this.state = 'walk'; this.stateT = 0; }
      return;
    }

    const [tx, tz] = this.path[this.idx];
    const dx = tx - this.group.position.x, dz = tz - this.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) {
      this.idx += this.dir;
      if (this.idx >= this.path.length) { this.idx = this.path.length - 2; this.dir = -1; }
      else if (this.idx < 0) { this.idx = 1; this.dir = 1; }
      if (Math.random() < 0.3) { this.state = 'pause'; this.stateT = 0; this.pauseDur = 7 + Math.random() * 5; }
    } else {
      const nx = dx / d, nz = dz / d;
      this.group.position.x += nx * this.speed * dt;
      this.group.position.z += nz * this.speed * dt;
      this.group.position.y = terrainHeight(this.group.position.x, this.group.position.z);
      this.group.rotation.y = Math.atan2(-nx, -nz);
      animateFigure(this.fig, dt, true);
    }
  }
}

// ---------- Wandernde Hexer (S2): reine Atmosphäre, gleiche Wander-/Tag-
// Fade-Logik wie Student, aber Spitzhut + eigene Route durch die Wildmark.
// Bewusst eine EIGENE (kurze) Klasse statt Student zu parametrisieren —
// die Duell-KI in S4 (wilderer.js-Umfeld) wird sie um Kampfzustände
// erweitern, die bei Schülern nie vorkommen sollen.
const WIZARD_HAT_COLORS = [0x3a2f52, 0x4a2318];
class Wizard {
  constructor(scene, pathPts, idx) {
    const fig = buildFigure(HOUSE_COLORS[(idx + 2) % 4], HAIR_COLORS[(idx + 1) % 4], ROBE_DARK, WIZARD_HAT_COLORS[idx % 2]);
    for (const m of fig.mats) m.opacity = 1;
    this.fig = fig;
    this.group = fig.group;
    this.path = pathPts;
    this.idx = 1;
    this.dir = 1;
    this.speed = 1.1;
    this.state = 'walk';
    this.stateT = 0;
    this.pauseDur = 0;
    this.fade = 1;
    const [sx, sz] = pathPts[0];
    this.group.position.set(sx, terrainHeight(sx, sz), sz);
    scene.add(this.group);
  }

  update(dt, nightGlow) {
    if (nightGlow > 0.55) this.fade = Math.max(0, this.fade - dt / 2.5);
    else if (nightGlow < 0.35) this.fade = Math.min(1, this.fade + dt / 2.5);
    setFigureOpacity(this.fig, this.fade);
    if (this.fade <= 0.01) return;

    if (this.state === 'pause') {
      this.stateT += dt;
      animateFigure(this.fig, dt, false);
      if (this.stateT >= this.pauseDur) { this.state = 'walk'; this.stateT = 0; }
      return;
    }

    const [tx, tz] = this.path[this.idx];
    const dx = tx - this.group.position.x, dz = tz - this.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) {
      this.idx += this.dir;
      if (this.idx >= this.path.length) { this.idx = this.path.length - 2; this.dir = -1; }
      else if (this.idx < 0) { this.idx = 1; this.dir = 1; }
      if (Math.random() < 0.3) { this.state = 'pause'; this.stateT = 0; this.pauseDur = 6 + Math.random() * 6; }
    } else {
      const nx = dx / d, nz = dz / d;
      this.group.position.x += nx * this.speed * dt;
      this.group.position.z += nz * this.speed * dt;
      this.group.position.y = terrainHeight(this.group.position.x, this.group.position.z);
      this.group.rotation.y = Math.atan2(-nx, -nz);
      animateFigure(this.fig, dt, true);
    }
  }
}

// ---------- Katze Musch ----------
function buildCat(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x38363a, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), mat);
  body.scale.set(1.3, 0.9, 1.7);
  body.position.y = 0.18;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), mat);
  head.position.set(0, 0.27, 0.22);
  group.add(head);
  for (const s of [-1, 1]) {
    const earGeo = new THREE.ConeGeometry(0.04, 0.08, 4);
    earGeo.translate(s * 0.06, 0.34, 0.23);
    group.add(new THREE.Mesh(earGeo, mat));
  }
  const tailGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.4, 5);
  tailGeo.rotateX(-0.9);
  tailGeo.translate(0, 0.22, -0.26);
  const tail = new THREE.Mesh(tailGeo, mat);
  group.add(tail);
  scene.add(group);
  return { group, tail, t: 0 };
}

// ---------- Schlossgeist: halbtransparent, freundlich warmweiß ----------
function buildGeist(scene, glowTex) {
  const group = new THREE.Group();
  const cloakMat = new THREE.MeshLambertMaterial({
    color: 0xfff3d6, transparent: true, opacity: 0.5, flatShading: true, side: THREE.DoubleSide,
  });
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.7, 10, 1, true), cloakMat);
  cloak.position.y = 0.85;
  group.add(cloak);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), cloakMat);
  head.position.y = 1.75;
  group.add(head);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(3.2);
  glow.position.y = 1.1;
  group.add(glow);
  group.position.set(GEIST_POS.x, terrainHeight(GEIST_POS.x, GEIST_POS.z) + 1.3, GEIST_POS.z);
  scene.add(group);
  return { group, cloak, head, t: 0 };
}

// ---------- Fero der Wanderhändler (S3): reist mit dem Zug, steht nur
// während der Bahnhofs-Haltephase am Bahnsteig (Figur + Karren). Kein
// Shop-UI (K-Vorgabe aus dem Plan) — jeder Kauf ist eine eigene Interakt-
// Stelle am Karren (Muster Leuchtkraut-Pickup aus Q2), Fero selbst gibt
// nur eine kurze Begrüßung per Dialog.
const FERO_ZUTATEN = ['glitzer', 'seide', 'stern'];
const ZUTAT_NAMES = { glitzer: 'Glitzerstaub', seide: 'Spinnenseide', stern: 'Sternsplitter', essenz: 'Dunkle Essenz' };
// Tagesangebot (Plan-Flavor): welche Zutat Fero gerade führt, wechselt alle
// paar Minuten — an sky.js' DAY_LENGTH (300s) angelehnt, aber bewusst ohne
// Import (rein kosmetisch, keine echte Tageszeit-Kopplung nötig).
const FERO_OFFER_CYCLE = 300;

function buildFeroCart() {
  const batch = new GeoBatch();
  const body = new THREE.BoxGeometry(1.0, 0.9, 1.6);
  body.translate(0, 0.75, 0);
  batch.addRaw(body, 0x4a3323);
  const board = new THREE.BoxGeometry(1.1, 0.08, 1.7);
  board.translate(0, 1.22, 0);
  batch.addRaw(board, 0x5a3f28);
  // Zutaten-Kiste, Fischfass, Sattel-Kiste — Deko, deren Weltposition
  // unten via denselben Local-Z-Versatz für die Interakt-Punkte genutzt wird.
  const crate = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  crate.translate(0, 1.42, -0.6);
  batch.addRaw(crate, 0x8a6b45);
  const barrelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8);
  barrelGeo.translate(0, 1.47, 0);
  batch.addRaw(barrelGeo, 0x5a3a20);
  const saddleGeo = new THREE.BoxGeometry(0.32, 0.28, 0.5);
  saddleGeo.translate(0, 1.36, 0.6);
  batch.addRaw(saddleGeo, 0x6b3a26);
  const mesh = batch.build(getMaterials().deco);
  const group = new THREE.Group();
  if (mesh) group.add(mesh);

  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a, flatShading: true });
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.14, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const side of [-0.55, 0.55]) {
    for (const z of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(side, 0.32, z);
      group.add(wheel);
    }
  }
  return group;
}

function buildFero(scene, hud, audio, interact, deps) {
  const { train, economy, heim, mounts } = deps;
  const st = train.station;
  const perpX = Math.cos(st.ang), perpZ = -Math.sin(st.ang);
  const alongX = Math.sin(st.ang), alongZ = Math.cos(st.ang);
  const stallPos = (z) => ({ x: cartX + alongX * z, z: cartZ + alongZ * z });

  const fig = buildFigure(0x8a6a2a, 0x3a2412, 0x5a3d22, 0x6b4a2a);
  for (const m of fig.mats) m.opacity = 1;
  fig.group.scale.setScalar(1.08);
  fig.group.position.set(st.feroX, terrainHeight(st.feroX, st.feroZ), st.feroZ);
  fig.group.rotation.y = Math.atan2(-perpX, -perpZ); // Blick weg vom Karren, zum Gleis hin
  fig.group.visible = false;
  scene.add(fig.group);

  const cartX = st.feroX - perpX * 1.5, cartZ = st.feroZ - perpZ * 1.5;
  const cart = buildFeroCart();
  cart.rotation.y = st.ang;
  cart.position.set(cartX, terrainHeight(cartX, cartZ), cartZ);
  cart.visible = false;
  scene.add(cart);

  let visible = false;
  let feroGreeted = false;
  let onChange = null;
  const feroState = { frischfisch: 0 };
  let offerT = Math.random() * FERO_OFFER_CYCLE;
  let offerItem = FERO_ZUTATEN[Math.floor(Math.random() * FERO_ZUTATEN.length)];
  let zutatPrice = 5 + Math.floor(Math.random() * 6);

  const feroEntry = interact.register({
    x: st.feroX, z: st.feroZ, r: 2.2, prompt: 'E — Mit Fero sprechen', enabled: false,
    onInteract: () => {
      const lines = feroGreeted
        ? ['Immer noch auf Reisen, wie du siehst.', 'Schau am Karren vorbei, wenn du etwas brauchst.']
        : ['Fero, fahrender Händler, zu deinen Diensten!',
           'Zutaten, Frischfisch, sogar ein Sattel — alles gegen Gold.',
           'Der Zug hält nicht lange — sei zügig!'];
      feroGreeted = true;
      hud.showDialog('Fero', lines);
    },
  });

  const zutatenPos = stallPos(-0.6);
  const zutatenEntry = interact.register({
    x: zutatenPos.x, z: zutatenPos.z, r: 1.3, enabled: false,
    get prompt() {
      const item = economy.rufLow ? 'essenz' : offerItem;
      return `E — ${ZUTAT_NAMES[item]} kaufen (${Math.round(zutatPrice * economy.priceMul)} Gold)`;
    },
    onInteract: () => {
      const item = economy.rufLow ? 'essenz' : offerItem;
      if (!economy.spendGold(zutatPrice)) { hud.showToast('Nicht genug Gold.', 2); return; }
      heim.zutaten[item]++;
      audio.chime();
      hud.showToast(`✦ ${ZUTAT_NAMES[item]} gekauft (${heim.zutaten[item]}×)`, 2.5);
      onChange?.();
    },
  });

  const fischPos = stallPos(0);
  const fischEntry = interact.register({
    x: fischPos.x, z: fischPos.z, r: 1.3, prompt: 'E — Frischfisch kaufen (8 Gold)', enabled: false,
    onInteract: () => {
      if (!economy.spendGold(8)) { hud.showToast('Nicht genug Gold.', 2); return; }
      feroState.frischfisch++;
      audio.chime();
      hud.showToast(`🐟 Frischfisch gekauft (${feroState.frischfisch}× — nützlich für Zähmungen)`, 2.5);
      onChange?.();
    },
  });

  const sattelPos = stallPos(0.6);
  const sattelEntry = interact.register({
    x: sattelPos.x, z: sattelPos.z, r: 1.3, enabled: false,
    get prompt() { return mounts.sattel ? 'Sattel bereits gekauft' : 'E — Sattel kaufen (40 Gold)'; },
    onInteract: () => {
      if (mounts.sattel) return;
      if (!economy.spendGold(40)) { hud.showToast('Nicht genug Gold.', 2); return; }
      mounts.sattel = 1;
      audio.chime('fanfare');
      hud.showToast('🐴 Sattel gekauft — Mounts sprinten jetzt schneller!', 3);
      onChange?.();
    },
  });

  return {
    feroState,
    set onChange(fn) { onChange = fn; },
    update(dt) {
      offerT += dt;
      if (offerT >= FERO_OFFER_CYCLE) {
        offerT = 0;
        offerItem = FERO_ZUTATEN[Math.floor(Math.random() * FERO_ZUTATEN.length)];
      }
      const halt = train.phase === 'halt';
      if (halt !== visible) {
        visible = halt;
        fig.group.visible = visible;
        cart.visible = visible;
        if (visible) zutatPrice = 5 + Math.floor(Math.random() * 6);
        else feroGreeted = false;
      }
      feroEntry.enabled = visible;
      zutatenEntry.enabled = visible;
      fischEntry.enabled = visible;
      sattelEntry.enabled = visible && !mounts.sattel;
    },
  };
}

export function buildNpcs(scene, glowTex, hud, audio, fx, health, interact, deps) {
  // deps = { collectibles, puzzles, spells, moor, dementors, train, economy,
  //          heim, mounts, leuchtkraeuter }
  const students = STUDENT_PATHS.map((p, i) => new Student(scene, p, i));
  // 2 wandernde Hexer (S2): eine läuft die Route vorwärts, die andere rückwärts
  // los (idx=1 wie Student, aber entgegengesetzte Startrichtung), damit sie
  // sich nicht die ganze Zeit auf demselben Wegabschnitt begegnen.
  const wizards = [new Wizard(scene, WIZARD_PATH, 0), new Wizard(scene, WIZARD_PATH, 1)];
  wizards[1].idx = WIZARD_PATH.length - 2;
  wizards[1].dir = -1;
  wizards[1].group.position.set(WIZARD_PATH[WIZARD_PATH.length - 1][0], terrainHeight(WIZARD_PATH[WIZARD_PATH.length - 1][0], WIZARD_PATH[WIZARD_PATH.length - 1][1]), WIZARD_PATH[WIZARD_PATH.length - 1][1]);

  const lenaFig = buildFigure(0x8a4a6a, 0x3a2412, LENA_ROBE);
  for (const m of lenaFig.mats) m.opacity = 1;
  lenaFig.group.position.set(LENA_POS.x, terrainHeight(LENA_POS.x, LENA_POS.z), LENA_POS.z);
  scene.add(lenaFig.group);

  const barnabyFig = buildFigure(0x2b6b35, 0x1a1a1a, BARNABY_ROBE);
  for (const m of barnabyFig.mats) m.opacity = 1;
  barnabyFig.group.scale.setScalar(1.12);
  barnabyFig.group.position.set(BARNABY_POS.x, terrainHeight(BARNABY_POS.x, BARNABY_POS.z), BARNABY_POS.z);
  scene.add(barnabyFig.group);

  const geist = buildGeist(scene, glowTex);
  const cat = buildCat(scene);
  let catFollowing = false;
  let currentPlayer = null;

  const fero = buildFero(scene, hud, audio, interact, deps);

  const quests = { katze: 0, kraeuter: 0, kraeuterDone: 0, kraeuterStarted: 0 };
  let onQuestChange = null; // von main.js gesetzt, ruft persist()
  fero.onChange = () => onQuestChange?.();

  const leuchtkraeuter = deps.leuchtkraeuter || [];
  const kraeuterEntries = [];

  function placeCatHome() {
    if (quests.katze >= 2) {
      cat.group.position.set(LENA_POS.x + 1.1, terrainHeight(LENA_POS.x + 1.1, LENA_POS.z + 0.6), LENA_POS.z + 0.6);
    } else {
      cat.group.position.set(CAT_POS.x, terrainHeight(CAT_POS.x, CAT_POS.z), CAT_POS.z);
    }
    catFollowing = false;
  }
  placeCatHome();

  interact.register({
    x: LENA_POS.x, z: LENA_POS.z, r: 2.4, prompt: 'E — Mit Lena sprechen',
    onInteract: () => {
      if (quests.katze === 0) {
        hud.showDialog('Lena', [
          'Hast du meine Katze gesehen? Musch ist weggelaufen…',
          'Ich glaube, sie ist Richtung See gelaufen, zum Bootshaus.',
          'Bitte, wenn du sie findest — sag ihr, sie soll heimkommen!',
        ], () => { quests.katze = 1; onQuestChange?.(); });
      } else if (quests.katze === 1 && catFollowing) {
        hud.showDialog('Lena', [
          'Musch! Da bist du ja! Vielen Dank, dass du sie gefunden hast!',
          'Hier — das ist für dich.',
        ], () => {
          quests.katze = 2;
          placeCatHome();
          health.hearts = health.maxHearts;
          audio.chime('fanfare');
          fx.burst(
            { x: lenaFig.group.position.x, y: lenaFig.group.position.y + 1.2, z: lenaFig.group.position.z },
            0xffcf8a, 24, 4, { gravity: -3, life: 0.9, size: 0.3 }
          );
          hud.showToast('✨ Quest abgeschlossen: Die verlorene Katze — Herzen aufgefrischt!', 4);
          onQuestChange?.();
        });
      } else if (quests.katze === 1) {
        hud.showDialog('Lena', ['Hast du Musch schon gefunden? Sie war zuletzt beim Bootshaus.']);
      } else {
        hud.showDialog('Lena', ['Danke nochmal, dass du Musch gefunden hast!']);
      }
    },
  });

  interact.register({
    x: BARNABY_POS.x, z: BARNABY_POS.z, r: 2.4, prompt: 'E — Mit Barnaby sprechen',
    onInteract: () => {
      if (!quests.kraeuterStarted && !quests.kraeuterDone) {
        hud.showDialog('Barnaby', [
          'Ah, ein Abenteurer! Ich brauche etwas für meinen Kessel.',
          'Im Gewächshaus wachsen Leuchtkräuter — bring mir drei davon!',
        ], () => { quests.kraeuterStarted = 1; onQuestChange?.(); });
      } else if (!quests.kraeuterDone && quests.kraeuter < 3) {
        hud.showDialog('Barnaby', [`Noch ${3 - quests.kraeuter} Leuchtkräuter, dann kann ich brauen!`]);
      } else if (!quests.kraeuterDone) {
        hud.showDialog('Barnaby', [
          'Alle drei? Wunderbar, danke dir!',
          'Als Dank braue ich dir etwas Wärmendes — das hält den Frost fern.',
        ], () => {
          quests.kraeuterDone = 1;
          audio.chime('fanfare');
          hud.showToast('🔥 Quest abgeschlossen: Kräuter für den Kessel — "Warm ums Herz" wirkt jetzt dauerhaft!', 4.5);
          onQuestChange?.();
        });
      } else {
        hud.showDialog('Barnaby', ['Danke nochmal für die Leuchtkräuter — mein Kessel dampft wie nie zuvor.']);
      }
    },
  });

  leuchtkraeuter.slice(0, 3).forEach((lk, i) => {
    const entry = interact.register({
      x: lk.x, z: lk.z, r: 1.6, prompt: 'E — Leuchtkraut pflücken',
      enabled: false,
      onInteract: () => {
        if (quests.kraeuter > i) return;
        quests.kraeuter++;
        lk.sprite.visible = false;
        entry.enabled = false;
        audio.chime();
        hud.showToast(`✦ Leuchtkraut eingesammelt (${quests.kraeuter}/3)`, 2);
        onQuestChange?.();
      },
    });
    kraeuterEntries.push(entry);
  });

  const catEntry = interact.register({
    get x() { return cat.group.position.x; },
    get z() { return cat.group.position.z; },
    r: 2, prompt: 'E — Musch ansprechen', enabled: false,
    onInteract: () => {
      if (quests.katze !== 1 || catFollowing) return;
      catFollowing = true;
      hud.showToast('🐾 Musch schnurrt und folgt dir jetzt!', 2.5);
    },
  });

  interact.register({
    x: GEIST_POS.x, z: GEIST_POS.z, r: 3, prompt: 'E — Mit dem Schlossgeist sprechen',
    onInteract: () => {
      const lines = [];
      if (deps.spells.epUnlocked && !deps.moor.laterneCollected) {
        lines.push('Im Nebelmoor wartet noch die Silberne Seelenlaterne auf dich…');
        lines.push('Fünf Seelenlichter müssen heimkehren, bevor sich die Krypta öffnet.');
      } else if (deps.puzzles.artifactCount < ARTIFACT_ORDER.length) {
        const missing = ARTIFACT_ORDER.find((id) => !deps.puzzles.artifacts.has(id));
        const hint = PUZZLE_HINTS[missing] || 'einen vergessenen Winkel des Schlosses';
        lines.push('Noch nicht alle Geheimnisse dieses Schlosses sind gelüftet…');
        lines.push(`Versuch dich an ${hint}.`);
      } else if (deps.collectibles.count < deps.collectibles.total) {
        let nearest = null, nearestD = Infinity;
        if (currentPlayer) {
          for (const item of deps.collectibles.items) {
            if (item.collected) continue;
            const d = Math.hypot(item.group.position.x - currentPlayer.pos.x, item.group.position.z - currentPlayer.pos.z);
            if (d < nearestD) { nearestD = d; nearest = item; }
          }
        }
        lines.push(`${deps.collectibles.total - deps.collectibles.count} Schnätze schweben noch irgendwo im Schloss…`);
        lines.push(nearest ? `Ich spüre goldenes Glitzern — „${nearest.name}“.` : 'Wo genau, weiß selbst ich nicht mehr.');
      } else {
        lines.push('Du hast schon fast alles gesehen, was dieses Schloss zu bieten hat.');
        lines.push('Ich bin stolz auf dich, kleiner Zauberer.');
      }
      hud.showDialog('Schlossgeist', lines);
    },
  });

  return {
    quests,
    fero,
    set onQuestChange(fn) { onQuestChange = fn; },

    save() { return { ...quests }; },

    // Lehre aus moor.js/creatures.js: restore setzt ALLES synchron zurück —
    // auch die Katzen-Position, nicht nur den Zahlenstand.
    restore(saved) {
      Object.assign(quests, {
        katze: 0, kraeuter: 0, kraeuterDone: 0, kraeuterStarted: 0,
      }, saved || {});
      catFollowing = false; // Save-Reload holt die Katze IMMER zurück nach Hause
      placeCatHome();
      for (let i = 0; i < kraeuterEntries.length; i++) {
        const picked = quests.kraeuter > i;
        leuchtkraeuter[i].sprite.visible = !picked;
        kraeuterEntries[i].enabled = false;
      }
    },

    update(dt, player, skyState, ruf = 0) {
      currentPlayer = player;
      for (const s of students) s.update(dt, skyState.nightGlow, player, ruf);
      for (const w of wizards) w.update(dt, skyState.nightGlow);
      fero.update(dt);

      animateFigure(lenaFig, dt, false);
      animateFigure(barnabyFig, dt, false);

      geist.t += dt;
      geist.group.position.y = terrainHeight(GEIST_POS.x, GEIST_POS.z) + 1.3 + Math.sin(geist.t * 0.6) * 0.15;
      geist.group.rotation.y = geist.t * 0.2;

      cat.t += dt;
      cat.tail.rotation.z = Math.sin(cat.t * 2.4) * 0.2;
      if (catFollowing && currentPlayer) {
        const dx = currentPlayer.pos.x - cat.group.position.x, dz = currentPlayer.pos.z - cat.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 25) {
          // Kein Pathfinding: bei zu großer Distanz einfach hinter den Spieler springen.
          const bx = currentPlayer.pos.x + Math.sin(currentPlayer.yaw) * 2.2;
          const bz = currentPlayer.pos.z + Math.cos(currentPlayer.yaw) * 2.2;
          cat.group.position.set(bx, terrainHeight(bx, bz), bz);
        } else if (d > 1.4) {
          const speed = 3.4;
          const nx = dx / d, nz = dz / d;
          cat.group.position.x += nx * speed * dt;
          cat.group.position.z += nz * speed * dt;
          cat.group.position.y = terrainHeight(cat.group.position.x, cat.group.position.z);
          cat.group.rotation.y = Math.atan2(-nx, -nz);
        }
      }

      // Interakt-Reichweiten für bewegliche/zustandsabhängige Ziele live nachziehen
      catEntry.enabled = quests.katze === 1 && !catFollowing;
      for (let i = 0; i < kraeuterEntries.length; i++) {
        kraeuterEntries[i].enabled = quests.kraeuterStarted === 1 && !quests.kraeuterDone && quests.kraeuter <= i;
      }
    },
  };
}
