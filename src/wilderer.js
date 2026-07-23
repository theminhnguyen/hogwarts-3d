// Wilderer-Lager & Duell-KI (S4, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt 5.4).
// Erste menschliche Gegner: patrouillieren, schießen dodgeable Bolzen, geben
// nach 3 Treffern auf (kein Tod/Blut) und fliehen. 3 Lager-Spots rotieren im
// Tageszyklus (je Morgengrauen, seeded), Käfig mit befreibarer/erntbarer
// Fauna-Kreatur. Duellring am Dorfplatz nutzt DIESELBE Wilderer-KI als fairer
// Duellant (Fechtmeisterin Ondra, 10-16 Uhr, Einsatz/Gewinn in Gold).

import * as THREE from 'three';
import { GeoBatch, addCircleBlocker, addBoxBlocker, pointBlocked } from './geo.js';
import { terrainHeight, FAHLHOLZ } from './terrain.js';
import { getMaterials } from './materials.js';
import { buildFigure, animateFigure, setFigureOpacity } from './npc.js';
import { buildRabbitModel, buildFoxModel, buildNifflerModel, buildBowtruckleModel } from './fauna.js';
import { IMPERIO_DUR, IMPERIO_DAZE_DUR } from './creatures.js';

const IMPERIO_POKE_RANGE = 6;
const IMPERIO_POKE_INTERVAL = 1;
const IMPERIO_FOLLOW_DIST = 2.5;

const CULL_FULL = 140;
const CULL_HIDE = 160;

const WILDERER_SPOTS = [
  { x: 320, z: -60 },
  { x: 260, z: 200 },
  { x: -260, z: -120 },
  // E8 (PLAN-EPISCHE-WELT.md, "Verdichtung der Alt-Welt"): 3 zusätzliche Lager
  // im Außenring (dieselben 3 Sektoren wie die neuen Wichtel/Geister/Fauna-
  // Cluster in creatures.js/fauna.js — Nordmark bewusst ausgelassen, Wilderer
  // passen thematisch besser zu den wärmeren Sektoren als zum eisigen Norden).
  // Rotation/Save/Interact-Code ist bereits vollständig generisch über
  // WILDERER_SPOTS.length, keine weiteren Codeänderungen nötig.
  { x: 370, z: -215 },  // Ostmark
  { x: 250, z: 350 },   // Südmark
  { x: -365, z: 255 },  // Westmark
];
// Kreidekreis am Dorfplatz — 12m Abstand zum nächsten Kollisions-Blocker
// live gegen village.js' colliders.blockers verifiziert (Lehre 3).
const DUELLRING_POS = { x: -82, z: -230 };
const DUELLRING_R = 3.2;

// ---------- S10 Umhang-Quest: Wilderer-ANFÜHRER (4. Wilderer) ----------
// Am östlichen Rand von Fahlholz (290,150,r22) — Distanz zum Zentrum ≈19,
// außerhalb des Baum-Streureichs der eigenen Deko (wildmark.js rng bis r-6=16)
// aber noch innerhalb der generischen Vegetations-Ausschlusszone (r22), also
// eine ungestörte Lichtung ohne Kollisions-Konflikt mit den 14 Fahlholz-Bäumen.
const LEADER_POS = { x: FAHLHOLZ.x + 18, z: FAHLHOLZ.z + 6 };
const LEADER_PATROL_R = 4;
const LEADER_SIGHT_RANGE = 8;
const LEADER_SIGHT_HALF_ANGLE = Math.PI / 3; // 60° Sichtkegel je Seite
const LEADER_UNRESOLVED_DAWNS = 2; // "2 Tage nicht geräumt" (Plan)

const TUNING = {
  hp: 3,
  aggroRange: 14,
  leaveAggroRange: 20,
  castRange: 15,       // darüber nähert er sich erst, statt zu schießen
  patrolRadius: 8,
  patrolSpeed: 1.3,
  chaseSpeed: 2.6,
  telegraphDur: 1.2,
  boltSpeed: 6,
  boltDmg: 0.5,
  boltLife: 4,
  boltHitR: 0.55,       // Spieler-Radius (player.js RADIUS=0.45) + Bolzen-Toleranz
  cooldownMin: 1.6,
  cooldownMax: 2.4,
  kneelDur: 1.1,
  fleeSpeed: 4.2,
  fleeDespawnDist: 26,  // Abstand vom Heimatpunkt, ab dem "verschwunden" gilt
  leash: 26,            // Positions-Clamp ums eigene Lager (Lehre 14) — NICHT beim Duellanten
};
const DAWN_LOW = 0.35; // Schwelle "wieder Tag" — dieselbe wie Student/Ghost-Fade

const CLOAK_COLORS = [0x2e2a24, 0x3a2e28, 0x28302c];
const CAGED_KINDS = ['hase', 'fuchs', 'niffler', 'bowtruckle'];
const CAGED_NAMES = { hase: 'Der Hase', fuchs: 'Der Fuchs', niffler: 'Der Niffler', bowtruckle: 'Der Bowtruckle' };
const CAGED_BUILDERS = { hase: buildRabbitModel, fuchs: buildFoxModel, niffler: buildNifflerModel, bowtruckle: buildBowtruckleModel };

function rand(a, b) { return a + Math.random() * (b - a); }
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Wilderer-Zauberer: patrol → aggro → telegraph → Bolzen → cooldown ----------
// Kein eigener Tod: bei 0 HP knien sie, fliehen, verschwinden ("GEBEN AUF").
class WildererMage {
  constructor(system, seed) {
    this.system = system;
    this.species = 'wilderer';
    this.hp = TUNING.hp;
    this.maxHp = TUNING.hp;
    // inaktiv (noch nie gespawnt) MUSS alive=false sein — spells.js filtert
    // Bolzen-Ziele über !c.alive, sonst könnte ein Treffer nahe (0,0,0)
    // (Gruppenposition vor der ersten activate()) versehentlich zählen.
    this.alive = false;
    this.radius = 0.5;
    this.hitY = 1.1;
    this.state = 'inactive'; // inactive|patrol|aggro|telegraph|cooldown|kneel|fliehen|gone
    this.stateT = 0;
    this.homePos = { x: 0, z: 0 };
    this.isDuelist = false;
    this.speedMul = 1;
    this.attackCd = 0;
    this.vel = new THREE.Vector3();
    this.phaseA = Math.random() * Math.PI * 2;
    this.imperioT = 0; // S8: >0 während Besessenheit
    this._pokeT = 0;
    this.disarmDur = 0; // S9: >0 während Grabbel den Stab geklaut hat

    const idx = seed % CLOAK_COLORS.length;
    this.fig = buildFigure(0x5a4a3a, 0x2a2018, CLOAK_COLORS[idx], null, true);
    for (const m of this.fig.mats) m.opacity = 1;
    this.group = this.fig.group;
    this.pos = this.group.position;
    this.group.visible = false;
    system.scene.add(this.group);

    // Roter Telegraph-Funke (Muster: creatures.js/dementor.js-Glow-Sprites)
    this.sparkMat = new THREE.SpriteMaterial({
      map: system.glowTex, color: 0xff3030, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.spark = new THREE.Sprite(this.sparkMat);
    this.spark.scale.setScalar(0.01);
    this.spark.position.set(0.22, 1.05, 0.15);
    this.group.add(this.spark);
  }

  // Aktiviert (Lager-Spawn oder Duell-Start) an einer Position, frischer Zustand.
  activate(x, z, isDuelist) {
    this.hp = this.maxHp;
    this.alive = true;
    this.homePos = { x, z };
    this.isDuelist = isDuelist;
    this.speedMul = 1;
    this.state = 'patrol';
    this.stateT = 0;
    this.attackCd = rand(0.5, 1.5);
    this.pos.set(x, terrainHeight(x, z), z);
    this.group.visible = true;
    this.group.scale.setScalar(1);
    this.group.rotation.x = 0;
    setFigureOpacity(this.fig, 1);
    this.sparkMat.opacity = 0;
  }

  deactivate() {
    this.state = 'inactive';
    this.alive = false;
    this.group.visible = false;
    this.group.rotation.x = 0;
    this.sparkMat.opacity = 0;
  }

  _steerXZ(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  applyHit(spellId, _boltVel, dmgMul = 1) {
    if (!this.alive || this.state === 'inactive' || this.state === 'gone') return;
    if (this.state === 'kneel' || this.state === 'fliehen') return; // gibt schon auf
    // avada (S8): sofortige Aufgabe (kein Tod, Wilderer sterben nie — siehe
    // _surrender()). crucio: 0.5 dmg/s in 0.5s-Ticks (0.25 pro Tick) +
    // unterbricht sofort einen laufenden Telegraph (Plan: "taktisch gegen
    // Troll/Wilderer").
    const dmg = spellId === 'avada' ? this.hp
      : spellId === 'crucio' ? 0.25
      : spellId === 'incendio' ? 2
      : spellId === 'claw' ? 0.5
      : (spellId === 'stupor' || spellId === 'kick' || spellId === 'bite') ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg * dmgMul;
    this.system.fx.burst(this.pos, 0xd8c8a0, 8, 2.5, { gravity: -3, life: 0.35 });
    if (this.hp <= 0) { this._surrender(); return; }
    if ((spellId === 'crucio' || spellId === 'claw') && this.state === 'telegraph') {
      this.sparkMat.opacity = 0;
      this.state = 'aggro';
      this.stateT = 0;
    }
  }

  // S8 Imperio: kämpft für dich statt gegen dich (folgt dem Spieler, pokt
  // den nächsten anderen Feind). Bei einem Lager-Wilderer öffnet das sofort
  // den Käfig (Plan: "kann den Käfig öffnen lassen — Lager-Alternativlösung").
  startImperio() {
    if (!this.alive || this.state === 'inactive' || this.state === 'gone') return;
    this.state = 'imperio';
    this.stateT = 0;
    this.imperioT = IMPERIO_DUR;
    this._pokeT = 0;
    this.sparkMat.opacity = 0;
    if (!this.isDuelist) this.system.onCampMageImperio?.();
  }

  // S9 Grabbel (Niffler-Begleiter): klaut den Stab — 3s keine Zauber, egal
  // in welchem Zustand er gerade war (auch mitten im Telegraph).
  disarm(dur) {
    if (!this.alive || this.state === 'inactive' || this.state === 'gone'
      || this.state === 'kneel' || this.state === 'fliehen' || this.state === 'imperio') return;
    this.state = 'entwaffnet';
    this.stateT = 0;
    this.disarmDur = dur;
    this.sparkMat.opacity = 0;
    this.vel.set(0, 0, 0);
  }

  // Kein Tod — sie geben auf: knien kurz, fliehen dann (K-Vorgabe aus dem Plan).
  _surrender() {
    this.alive = false;
    this.state = 'kneel';
    this.stateT = 0;
    this.sparkMat.opacity = 0;
    this.system.audio.wildererSurrender?.();
    this.system.fx.burst(this.pos, 0xc8c0b0, 14, 2, { gravity: -1, life: 0.6 });
    if (this.isDuelist) this.system.onDuelistDefeated?.();
  }

  update(dt, player) {
    if (this.state === 'inactive' || this.state === 'gone') return;

    // Sterbe-Äquivalent (knien→fliehen) läuft IMMER zu Ende, unabhängig vom
    // Distanz-Culling (Lehre 6/N2/W6 — sonst bliebe eine Figur für immer hängen).
    if (this.state === 'kneel') {
      this.stateT += dt;
      this.group.rotation.x = Math.min(0.5, this.stateT * 1.2);
      if (this.stateT >= TUNING.kneelDur) { this.state = 'fliehen'; this.stateT = 0; }
      return;
    }
    if (this.state === 'fliehen') {
      this.stateT += dt;
      this.group.rotation.x = Math.max(0, 0.5 - this.stateT * 2);
      const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this._steerXZ(this.pos.x + (dx / d) * 10, this.pos.z + (dz / d) * 10, TUNING.fleeSpeed, dt);
      this.pos.y = terrainHeight(this.pos.x, this.pos.z);
      animateFigure(this.fig, dt, true);
      const homeD = Math.hypot(this.pos.x - this.homePos.x, this.pos.z - this.homePos.z);
      if (homeD > TUNING.fleeDespawnDist || this.stateT > 12) {
        this.state = 'gone';
        this.group.visible = false;
      }
      return;
    }

    const distSq = this.pos.distanceToSquared(player.pos);
    if (!this.isDuelist) {
      if (distSq > CULL_HIDE * CULL_HIDE) { this.group.visible = false; return; }
      this.group.visible = true;
      if (distSq > CULL_FULL * CULL_FULL) return;
    }

    // Harte Leine ums eigene Lager (Lehre 14) — Duellanten bleiben im Ring,
    // ihre eigene sehr enge castRange hält sie ohnehin nah am Zentrum.
    if (!this.isDuelist) {
      const ldx = this.pos.x - this.homePos.x, ldz = this.pos.z - this.homePos.z;
      const ld = Math.hypot(ldx, ldz);
      if (ld > TUNING.leash) {
        this.pos.x = this.homePos.x + (ldx / ld) * TUNING.leash;
        this.pos.z = this.homePos.z + (ldz / ld) * TUNING.leash;
      }
    }

    const dist = Math.sqrt(distSq);
    switch (this.state) {
      case 'patrol': {
        const t = this.system.time;
        const lx = this.homePos.x + Math.sin(t * 0.25 + this.phaseA) * TUNING.patrolRadius;
        const lz = this.homePos.z + Math.cos(t * 0.2 + this.phaseA) * TUNING.patrolRadius;
        this._steerXZ(lx, lz, TUNING.patrolSpeed, dt);
        // S11: Katzen-Schleichen verkleinert den Aggro-Radius aller Feinde.
        if (!player.invisible && dist < TUNING.aggroRange * this.system.catStealthMul) { this.state = 'aggro'; this.stateT = 0; }
        break;
      }
      case 'aggro': {
        this.stateT += dt;
        this.attackCd -= dt;
        if (dist > TUNING.castRange) {
          this._steerXZ(player.pos.x, player.pos.z, TUNING.chaseSpeed * this.speedMul, dt);
        } else {
          this.vel.set(0, 0, 0);
          this.group.rotation.y = angleLerp(this.group.rotation.y,
            Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), Math.min(1, dt * 5));
        }
        if (this.attackCd <= 0 && dist <= TUNING.castRange) {
          this.state = 'telegraph'; this.stateT = 0;
        }
        if (dist > TUNING.leaveAggroRange) { this.state = 'patrol'; this.stateT = 0; }
        break;
      }
      case 'telegraph': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / TUNING.telegraphDur);
        this.sparkMat.opacity = f * 0.9;
        this.spark.scale.setScalar(0.05 + f * 0.4);
        this.group.rotation.y = angleLerp(this.group.rotation.y,
          Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z), Math.min(1, dt * 8));
        if (this.stateT >= TUNING.telegraphDur) {
          this._fireBolt(player);
          this.sparkMat.opacity = 0;
          this.state = 'cooldown'; this.stateT = 0;
          this.attackCd = rand(TUNING.cooldownMin, TUNING.cooldownMax) / this.speedMul;
        }
        break;
      }
      case 'cooldown': {
        this.stateT += dt;
        if (this.stateT >= 0.3) { this.state = 'aggro'; this.stateT = 0; }
        break;
      }
      // S8 Imperio: siehe creatures.js Pixie.update() für dasselbe Muster
      // (folgt dem Spieler, pokt den nächsten anderen Wilderer in
      // Reichweite, dann benommen — kein echtes Ziel-Tracking).
      case 'imperio': {
        this.imperioT -= dt;
        if (dist > IMPERIO_FOLLOW_DIST) {
          this._steerXZ(player.pos.x, player.pos.z, TUNING.chaseSpeed * this.speedMul, dt);
        } else {
          this.vel.set(0, 0, 0);
        }
        this._pokeT -= dt;
        if (this._pokeT <= 0) {
          this._pokeT = IMPERIO_POKE_INTERVAL;
          let best = null, bestD2 = IMPERIO_POKE_RANGE * IMPERIO_POKE_RANGE;
          for (const m of this.system.list) {
            if (m === this || !m.alive || m.state === 'imperio') continue;
            const d2 = this.pos.distanceToSquared(m.pos);
            if (d2 < bestD2) { bestD2 = d2; best = m; }
          }
          if (best) best.applyHit('stupor', null);
        }
        if (this.imperioT <= 0) { this.state = 'benommen'; this.stateT = 0; }
        break;
      }
      case 'benommen': {
        this.stateT += dt;
        this.vel.set(0, 0, 0);
        if (this.stateT >= IMPERIO_DAZE_DUR) { this.state = 'aggro'; this.stateT = 0; }
        break;
      }
      // S9 Grabbel: Stab geklaut — steht hilflos, keine Zauber, bis die Zeit
      // abläuft, dann zurück in den Kampf.
      case 'entwaffnet': {
        this.stateT += dt;
        this.vel.set(0, 0, 0);
        if (this.stateT >= this.disarmDur) { this.state = 'aggro'; this.stateT = 0; }
        break;
      }
    }

    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.15) {
      this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(this.vel.x, this.vel.z), Math.min(1, dt * 5));
      animateFigure(this.fig, dt, true);
    } else {
      animateFigure(this.fig, dt, false);
    }
  }

  _fireBolt(player) {
    const castX = this.pos.x, castY = this.pos.y + 1.1, castZ = this.pos.z;
    const tx = player.pos.x, ty = player.pos.y + 1.0, tz = player.pos.z;
    const dx = tx - castX, dy = ty - castY, dz = tz - castZ;
    const d = Math.hypot(dx, dy, dz) || 1;
    this.system.spawnBolt(
      castX, castY, castZ,
      (dx / d) * TUNING.boltSpeed, (dy / d) * TUNING.boltSpeed, (dz / d) * TUNING.boltSpeed,
    );
    this.system.audio.wildererBolt?.();
  }
}

// ---------- S10 Umhang-Quest: Anführer (reine Sichtkegel-Wache, kein Kampf —
// "muss GESTOHLEN werden", kein Duell) ----------
class LeaderGuard {
  constructor(scene) {
    this.fig = buildFigure(0x6b1a1a, 0x1a1410, 0x2a1414, null, true);
    for (const m of this.fig.mats) m.opacity = 1;
    this.group = this.fig.group;
    this.pos = this.group.position;
    this.pos.set(LEADER_POS.x, terrainHeight(LEADER_POS.x, LEADER_POS.z), LEADER_POS.z);
    this.facing = 0;
    this.t = Math.random() * Math.PI * 2;
    scene.add(this.group);
  }

  update(dt) {
    this.t += dt * 0.3;
    const tx = LEADER_POS.x + Math.sin(this.t) * LEADER_PATROL_R;
    const tz = LEADER_POS.z + Math.cos(this.t) * LEADER_PATROL_R;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const speed = 1.1;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    if (d > 0.05) this.facing = Math.atan2(dx, dz);
    this.group.rotation.y = this.facing;
    animateFigure(this.fig, dt, true);
  }

  // Sichtkegel-Check (Plan: "<8m" + Blickrichtung), nur nachts relevant —
  // tagsüber ruht das Lager, kein Diebstahlsversuch nötig/möglich.
  sees(player, night) {
    if (!night) return false;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > LEADER_SIGHT_RANGE) return false;
    const angleToPlayer = Math.atan2(dx, dz);
    let diff = Math.abs(angleToPlayer - this.facing) % (Math.PI * 2);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;
    return diff < LEADER_SIGHT_HALF_ANGLE;
  }
}

// ---------- Bolzen-Sichtvisualisierung (kleine additive Sprites, kein Pool nötig) ----------
function makeBoltSprite(glowTex) {
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff5030, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(0.35);
  return s;
}

// ---------- Käfig (Deko-Kreatur + E-Interakt: befreien/ernten) ----------
function buildCage(scene) {
  const batch = new GeoBatch();
  const barMat = 0x2a2a30;
  const postH = 1.3, w = 1.3;
  for (const [px, pz] of [[-w / 2, -w / 2], [w / 2, -w / 2], [-w / 2, w / 2], [w / 2, w / 2]]) {
    batch.add(new THREE.CylinderGeometry(0.05, 0.06, postH, 6), barMat, px, postH / 2, pz);
  }
  for (const y of [postH]) {
    batch.add(new THREE.BoxGeometry(w + 0.1, 0.05, 0.05), barMat, 0, y, -w / 2);
    batch.add(new THREE.BoxGeometry(w + 0.1, 0.05, 0.05), barMat, 0, y, w / 2);
    batch.add(new THREE.BoxGeometry(0.05, 0.05, w + 0.1), barMat, -w / 2, y, 0);
    batch.add(new THREE.BoxGeometry(0.05, 0.05, w + 0.1), barMat, w / 2, y, 0);
  }
  // 5 senkrechte Gitterstäbe an der Vorderseite (Spieler-zugewandt, -Z)
  for (let i = 0; i < 5; i++) {
    const px = -w / 2 + 0.15 + i * ((w - 0.3) / 4);
    batch.add(new THREE.CylinderGeometry(0.025, 0.025, postH, 5), barMat, px, postH / 2, -w / 2);
  }
  const mesh = batch.build(getMaterials().deco, { castShadow: false });
  const group = new THREE.Group();
  if (mesh) group.add(mesh);
  scene.add(group);
  return group;
}

// ---------- Ein Lager-Spot: Zelte + Feuer + Käfig (alle 3 vorab gebaut, nur .visible geschaltet) ----------
function buildCampSite(scene, glowTex, spot) {
  const group = new THREE.Group();
  group.position.set(spot.x, terrainHeight(spot.x, spot.z), spot.z);
  group.visible = false;
  scene.add(group);

  const batch = new GeoBatch();
  const CANVAS = 0x9a8560, CANVAS_DARK = 0x7a6a48;
  // 2 Zelte (vierseitige Kegel, leicht verzerrt wirkende Positionen)
  for (const [tx, tz, ry] of [[-2.2, 1.0, 0.4], [2.0, -1.4, -0.6]]) {
    const tent = new THREE.ConeGeometry(1.1, 1.5, 4);
    tent.rotateY(Math.PI / 4 + ry);
    batch.addRaw(tent.translate(tx, 0.75, tz), CANVAS);
    const flapGeo = new THREE.ConeGeometry(1.12, 1.52, 4, 1, true, 0, Math.PI / 2);
    flapGeo.rotateY(Math.PI / 4 + ry);
    batch.addRaw(flapGeo.translate(tx, 0.75, tz), CANVAS_DARK);
  }
  // Feuerstelle: Ring aus Steinen + Holzscheite
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    batch.add(new THREE.SphereGeometry(0.16, 5, 4), 0x6b6660, Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6);
  }
  for (const ry of [0, 0.9, 1.9]) {
    const log = new THREE.CylinderGeometry(0.06, 0.07, 0.7, 5);
    log.rotateZ(Math.PI / 2);
    log.rotateY(ry);
    batch.addRaw(log.translate(0, 0.1, 0), 0x4a3826);
  }
  const mesh = batch.build(getMaterials().deco, { castShadow: true });
  if (mesh) group.add(mesh);

  // Feuer-Glow + Licht (Muster: village.js-Kamin)
  const fireGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const fireGlow = new THREE.Sprite(fireGlowMat);
  fireGlow.position.set(0, 0.5, 0);
  fireGlow.scale.set(1.0, 1.2, 1);
  group.add(fireGlow);
  const fireLight = new THREE.PointLight(0xff9a3c, 5, 9, 2);
  fireLight.position.set(0, 0.6, 0);
  group.add(fireLight);

  addCircleBlocker(spot.x - 2.2, spot.z + 1.0, 1.15, group.position.y - 1, group.position.y + 2);
  addCircleBlocker(spot.x + 2.0, spot.z - 1.4, 1.15, group.position.y - 1, group.position.y + 2);

  // Käfig (Spieler-zugewandt Richtung -Z relativ zum Camp, 2.5m vom Zentrum)
  const cagePos = { x: spot.x, z: spot.z + 2.6 };
  const cage = buildCage(scene);
  cage.position.set(cagePos.x, terrainHeight(cagePos.x, cagePos.z), cagePos.z);
  cage.visible = false;
  addCircleBlocker(cagePos.x, cagePos.z, 0.9, cage.position.y - 1, cage.position.y + 2);

  return { group, fireGlowMat, fireLight, cage, cagePos, spot };
}

export function buildWilderer(scene, glowTex, hud, audio, fx, health, interact, economy, deps) {
  // deps = { heim, dunkel, wild } — direkte Save-Referenzen (Muster aus
  // S3/Fero: mutieren dieselben Objekte, main.js' persist() liest sie
  // unverändert durch, solange main.js dieselbe Referenz übergeben hat.
  const { heim, dunkel, wild, hallows, hallowsUnlocked, spells } = deps;
  let currentTimeOfDay = 0.4;
  let currentPlayer = null;

  const system = {
    scene, glowTex, hud, audio, fx, health, economy,
    peaceful: false,
    catStealthMul: 1, // S11: von main.js aus player.animalForm gesetzt
    time: 0,
    list: [], // für spells.js-Zielliste: alle aktiven Wilderer-Instanzen
    bolts: [],
    onDuelistDefeated: null,
    onCampMageImperio: null, // S8: Imperio auf einen Lager-Wilderer öffnet sofort den Käfig
  };

  // ---------- Pool: 3 Mage-Instanzen, wiederverwendet für Lager UND Duell ----------
  const mages = [new WildererMage(system, 0), new WildererMage(system, 1), new WildererMage(system, 2)];
  system.list = mages;
  const duelist = new WildererMage(system, 3);
  // Duellant ist KEIN reguläres Lager-Mitglied — eigene Instanz, damit ein
  // laufendes Duell nie mit einem Lager-Kampf kollidiert. Trotzdem Ziel für
  // Sprüche: gehört ebenfalls in system.list.
  system.list = [...mages, duelist];

  // ---------- 3 Lager-Sites vorab bauen (kein Geometrie-Churn bei Rotation) ----------
  const sites = WILDERER_SPOTS.map((spot) => buildCampSite(scene, glowTex, spot));
  const cagedModels = sites.map(() => null);
  const cageEntries = [];

  let activeCampIdx = -1;
  let lastSpotIdx = -1;
  let campResolved = false;
  let prevNightGlow = 0.5;
  // S8: Imperio auf einen Lager-Wilderer schaltet den Käfig SOFORT frei —
  // "Lager-Alternativlösung" aus dem Plan, unabhängig vom sonst nötigen
  // "alle 3 Wilderer besiegt"-Zustand.
  let campImperioBypass = false;
  system.onCampMageImperio = () => { campImperioBypass = true; };

  // ---------- S10: Anführer-Versteck (nur sichtbar, sobald erschienen) ----------
  const leaderGuard = new LeaderGuard(scene);
  leaderGuard.group.visible = false;
  const leaderChestGroup = new THREE.Group();
  const leaderChestY = terrainHeight(LEADER_POS.x, LEADER_POS.z);
  leaderChestGroup.position.set(LEADER_POS.x, leaderChestY, LEADER_POS.z + 1.8);
  leaderChestGroup.visible = false;
  scene.add(leaderChestGroup);
  const leaderChestBodyMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1c, flatShading: true });
  const leaderChestTrimMat = new THREE.MeshLambertMaterial({ color: 0x8a6a2a, flatShading: true });
  const leaderChestBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), leaderChestBodyMat);
  leaderChestBody.position.y = 0.25;
  leaderChestGroup.add(leaderChestBody);
  for (const s of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.57), leaderChestTrimMat);
    band.position.set(s * 0.38, 0.25, 0);
    leaderChestGroup.add(band);
  }
  const leaderChestLid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.3, 0.58), leaderChestBodyMat);
  leaderChestLid.position.set(0, 0.65, -0.27);
  leaderChestGroup.add(leaderChestLid);
  addBoxBlocker(LEADER_POS.x - 0.5, LEADER_POS.x + 0.5, leaderChestY, leaderChestY + 0.9, LEADER_POS.z + 1.5, LEADER_POS.z + 2.1);

  let leaderSpawned = false; // erschienen (Versteck sichtbar, Chance auf Diebstahl)
  let leaderResolved = false; // Umhang bereits gestohlen — Versteck bleibt für immer verlassen
  let unresolvedDawns = 0; // Morgengrauen in Folge mit demselben ungeräumten Lager
  let leaderBusted = false; // heute Nacht schon entdeckt worden — "Versuch morgen neu"

  function spawnLeader() {
    if (leaderSpawned || leaderResolved) return;
    // S10 ist erst nach Hauspokal+Seelenlaterne freigeschaltet (Plan) — vorher
    // zählt der Ungeräumt-Timer zwar mit, löst aber noch nichts aus.
    if (!hallowsUnlocked?.()) return;
    leaderSpawned = true;
    hud.showToast('🏴 Gerüchte erzählen von einem Wilderer-Anführer, der sich in Fahlholz verkrochen hat …', 4.5);
  }

  const leaderChestEntry = interact.register({
    x: LEADER_POS.x, z: LEADER_POS.z + 1.8, r: 2, enabled: false,
    prompt: 'E — Die Truhe durchsuchen (lautlos!)',
    onInteract: () => {
      if (!leaderSpawned || leaderResolved || leaderBusted) return;
      if (leaderGuard.sees(currentPlayer, true)) {
        leaderBusted = true;
        hud.showToast('⚠️ Entdeckt! Der Anführer schlägt Alarm — versuch es morgen Nacht wieder.', 3.5);
        audio.wildererSurrender?.();
        return;
      }
      leaderResolved = true;
      hallows.umhang = 1;
      leaderChestLid.rotation.x = -1.9;
      leaderGuard.group.visible = false;
      audio.chime?.('fanfare');
      fx.burst({ x: LEADER_POS.x, y: leaderChestY + 0.6, z: LEADER_POS.z + 1.8 }, 0x2e2a24, 22, 3, { gravity: -1, life: 0.9 });
      hud.showToast('🧥 Der Umhang der Unsichtbarkeit! Lautlos erbeutet. (Taste U)', 4.5);
      spells?.unlockHallowsSpell('umhang', false); // eigener Toast oben, kein zweiter nötig
      onWildChange?.();
    },
  });

  function spawnCagedCreature(siteIdx) {
    const kind = CAGED_KINDS[Math.floor(Math.random() * CAGED_KINDS.length)];
    const model = CAGED_BUILDERS[kind]();
    model.group.scale.setScalar(kind === 'bowtruckle' ? 2.2 : 1.4);
    const site = sites[siteIdx];
    model.group.position.set(site.cagePos.x, terrainHeight(site.cagePos.x, site.cagePos.z), site.cagePos.z);
    scene.add(model.group);
    cagedModels[siteIdx] = { kind, model, released: false, releaseT: -1 };
  }

  let onWildChange = null;

  function activateCamp(idx) {
    activeCampIdx = idx;
    wild.aktivCamp = idx;
    campResolved = false;
    campImperioBypass = false;
    const spot = WILDERER_SPOTS[idx];
    for (let i = 0; i < mages.length; i++) {
      const a = (i / mages.length) * Math.PI * 2;
      mages[i].activate(spot.x + Math.cos(a) * 3, spot.z + Math.sin(a) * 3, false);
    }
    sites[idx].group.visible = true;
    sites[idx].cage.visible = true;
    spawnCagedCreature(idx);
    cageEntries[idx].enabled = false; // erst aktiv, wenn alle 3 Wilderer weg sind
    onWildChange?.();
  }

  function deactivateCamp() {
    if (activeCampIdx < 0) return;
    sites[activeCampIdx].group.visible = false;
    sites[activeCampIdx].cage.visible = false;
    const caged = cagedModels[activeCampIdx];
    if (caged) { scene.remove(caged.model.group); cagedModels[activeCampIdx] = null; }
    cageEntries[activeCampIdx].enabled = false;
    for (const m of mages) m.deactivate();
    activeCampIdx = -1;
    wild.aktivCamp = -1;
    campImperioBypass = false;
    onWildChange?.();
  }

  // Interakt-Punkte für alle 3 Spots vorab registrieren (nie entfernt, nur enabled umgeschaltet)
  for (let i = 0; i < WILDERER_SPOTS.length; i++) {
    const site = sites[i];
    const entry = interact.register({
      x: site.cagePos.x, z: site.cagePos.z, r: 2.2, enabled: false,
      get prompt() {
        return dunkel.pfad === 'dunkel' ? 'E — Essenz ernten' : 'E — Käfig öffnen';
      },
      onInteract: () => {
        if (i !== activeCampIdx || campResolved) return;
        const caged = cagedModels[i];
        campResolved = true;
        entry.enabled = false;
        if (dunkel.pfad === 'dunkel') {
          heim.zutaten.essenz += 3;
          economy.addRuf(-5);
          wild.geerntet = (wild.geerntet || 0) + 1;
          fx.burst(site.cagePos, 0x5a2a5a, 20, 3, { gravity: -1, life: 0.8 });
          audio.chime?.();
          hud.showToast('🖤 Essenz geerntet — die Kreatur vergeht zu Schatten. (+3 Dunkle Essenz, −5 Ruf)', 4);
          if (caged) { scene.remove(caged.model.group); cagedModels[i] = null; }
        } else {
          economy.addGold(15);
          economy.addRuf(5);
          wild.befreit = (wild.befreit || 0) + 1;
          audio.chime?.('fanfare');
          fx.burst(site.cagePos, 0xffd98c, 24, 4, { gravity: -2, life: 0.9 });
          hud.showToast(`✨ ${caged ? CAGED_NAMES[caged.kind] : 'Die Kreatur'} hüpft davon! (+15 Gold, +5 Ruf)`, 4);
          if (caged) caged.releaseT = 0;
        }
        onWildChange?.();
      },
    });
    cageEntries.push(entry);
  }

  // ---------- Duellring: Fechtmeisterin Ondra ----------
  const ondraFig = buildFigure(0xbfa32b, 0x2a1c10, 0x3a2f52);
  for (const m of ondraFig.mats) m.opacity = 1;
  ondraFig.group.position.set(DUELLRING_POS.x, terrainHeight(DUELLRING_POS.x, DUELLRING_POS.z), DUELLRING_POS.z - DUELLRING_R - 1.3);
  scene.add(ondraFig.group);
  addCircleBlocker(DUELLRING_POS.x, DUELLRING_POS.z - DUELLRING_R - 1.3, 0.6,
    ondraFig.group.position.y - 1, ondraFig.group.position.y + 2.2);

  // Kreidekreis: dünner, heller Ring auf dem Boden
  const ringGeo = new THREE.RingGeometry(DUELLRING_R - 0.12, DUELLRING_R, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: 0xe8ddc0, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  }));
  ringMesh.position.set(DUELLRING_POS.x, terrainHeight(DUELLRING_POS.x, DUELLRING_POS.z) + 0.03, DUELLRING_POS.z);
  scene.add(ringMesh);

  let duelActive = false;
  let duelStartT = -1; // 3-2-1-Ansage
  let winStreak = 0;
  let ondraGreeted = false;

  function inDuelHours(timeOfDay) {
    const h = timeOfDay * 24;
    return h >= 10 && h < 16;
  }

  function startDuel() {
    duelActive = true;
    duelStartT = 0;
    duelist.deactivate(); // sauberer Reset, falls vom letzten Duell noch aktiv
  }

  system.onDuelistDefeated = () => {
    if (!duelActive) return;
    winStreak++;
    economy.addGold(20);
    economy.addRuf(3);
    hud.showToast(`⚔️ Duell gewonnen! +20 Gold, +3 Ruf (Serie: ${winStreak})`, 4);
    duelActive = false;
  };

  const ondraEntry = interact.register({
    x: DUELLRING_POS.x, z: DUELLRING_POS.z - DUELLRING_R - 1.3, r: 2.4, prompt: 'E — Mit Ondra sprechen',
    onInteract: () => {
      if (duelActive) { hud.showDialog('Ondra', ['Wir sind mitten im Duell — konzentrier dich!']); return; }
      if (!inDuelHours(currentTimeOfDay)) {
        hud.showDialog('Ondra', ['Der Ring ruht. Komm zwischen 10 und 16 Uhr wieder, wenn du dich messen willst.']);
        return;
      }
      if (economy.gold < 10) {
        hud.showDialog('Ondra', ['Zehn Gold Einsatz, fair und ehrlich. Du hast nicht genug.']);
        return;
      }
      // K5 (S10): Duellring verbietet den Umhang der Unsichtbarkeit.
      if (currentPlayer?.invisible) {
        hud.showDialog('Ondra', ['Ich sehe alles, oder gar nichts — nimm den Umhang ab, dann reden wir.']);
        return;
      }
      const lines = ondraGreeted
        ? [`Bereit für eine weitere Runde? Zehn Gold Einsatz.`]
        : ['Ondra, Fechtmeisterin von Eulenbrück. Zehn Gold Einsatz, ein faires Duell.',
           'Kein Umhang im Ring — ich sehe alles, oder gar nichts.'];
      ondraGreeted = true;
      hud.showDialog('Ondra', lines, () => {
        economy.spendGold(10);
        hud.showToast('Der Ring ruft — 3…', 1);
        startDuel();
      });
    },
  });

  // ---------- Bolzen-Update (gemeinsam für Lager + Duell) ----------
  const boltMeshes = new Map();
  system.spawnBolt = (x, y, z, vx, vy, vz) => {
    const b = { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), life: TUNING.boltLife };
    const mesh = makeBoltSprite(glowTex);
    mesh.position.copy(b.pos);
    scene.add(mesh);
    boltMeshes.set(b, mesh);
    system.bolts.push(b);
  };

  function updateBolts(dt, player) {
    for (let i = system.bolts.length - 1; i >= 0; i--) {
      const b = system.bolts[i];
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      const mesh = boltMeshes.get(b);
      let hit = false, blocked = false;
      const dx = b.pos.x - player.pos.x, dy = b.pos.y - (player.pos.y + 1.0), dz = b.pos.z - player.pos.z;
      if (dx * dx + dy * dy + dz * dz < TUNING.boltHitR * TUNING.boltHitR) hit = true;
      else if (pointBlocked(b.pos.x, b.pos.y, b.pos.z)) blocked = true;
      if (hit) {
        if (!system.peaceful) {
          const d = Math.hypot(dx, dz) || 1;
          health.damage(TUNING.boltDmg, { x: dx / d, y: 0.2, z: dz / d });
        } else {
          audio.spellFizzle?.();
        }
        fx.burst(b.pos, 0xff5030, 10, 2.5, { gravity: -2, life: 0.4 });
      } else if (blocked) {
        fx.burst(b.pos, 0x8a8478, 6, 1.5, { gravity: -1, life: 0.3 });
      }
      if (hit || blocked || b.life <= 0) {
        scene.remove(mesh);
        boltMeshes.delete(b);
        system.bolts.splice(i, 1);
        continue;
      }
      mesh.position.copy(b.pos);
    }
  }

  return {
    list: system.list,
    set peaceful(v) { system.peaceful = v; },
    get peaceful() { return system.peaceful; },
    set catStealthMul(v) { system.catStealthMul = v; },
    set onWildChange(fn) { onWildChange = fn; },

    // sky (main.js' SkySystem-Instanz, NICHT nur sky.state): braucht sowohl
    // state.nightGlow (Morgengrauen-Erkennung) als auch timeOfDay (Ondras
    // 10-16-Uhr-Fenster) — sky.state selbst führt kein timeOfDay-Feld.
    update(dt, player, sky) {
      system.time += dt;
      currentTimeOfDay = sky.timeOfDay;
      currentPlayer = player;

      // Morgengrauen-Erkennung (dieselbe Schwelle wie Student/Ghost-Fade):
      // ein bereits GELÖSTES Lager verschwindet erst hier, ein freier Slot
      // wird sofort im selben Tick neu besetzt (rotierend).
      const night = sky.state.nightGlow;
      if (prevNightGlow >= DAWN_LOW && night < DAWN_LOW) {
        if (activeCampIdx >= 0 && campResolved) deactivateCamp();
        if (activeCampIdx === -1) {
          const next = (lastSpotIdx + 1) % WILDERER_SPOTS.length;
          lastSpotIdx = next;
          activateCamp(next);
        }
        // S10 Umhang-Quest: dieselbe Morgengrauen-Erkennung zählt, wie viele
        // Tage in Folge das AKTUELLE Lager ungeräumt blieb (ein ungeräumtes
        // Lager rotiert nie weg, siehe oben — bleibt also über den Zähler
        // hinweg dieselbe Instanz, kein Verwechslungsrisiko mit einem neuen).
        if (activeCampIdx >= 0 && !campResolved) {
          unresolvedDawns++;
          if (unresolvedDawns >= LEADER_UNRESOLVED_DAWNS) spawnLeader();
        } else {
          unresolvedDawns = 0;
        }
      }
      // Neue Nacht bricht an: ein gestriger Alarm verjährt ("Versuch morgen
      // neu" aus dem Plan) — Muster identisch zu home.js' Meteor-Nacht-Reset.
      if (prevNightGlow < DAWN_LOW && night >= DAWN_LOW) leaderBusted = false;
      prevNightGlow = night;

      if (leaderSpawned && !leaderResolved) {
        leaderGuard.update(dt);
        leaderGuard.group.visible = true;
        leaderChestGroup.visible = true;
        leaderChestEntry.enabled = night >= DAWN_LOW && !leaderBusted;
      }

      for (const m of mages) m.update(dt, player);
      if (activeCampIdx >= 0) {
        // S8: Imperio auf einen der 3 Lager-Wilderer schaltet den Käfig
        // sofort frei, unabhängig davon, ob die anderen beiden noch aktiv sind.
        cageEntries[activeCampIdx].enabled = !campResolved
          && (campImperioBypass || mages.every((m) => m.state === 'gone' || m.state === 'inactive'));
        const site = sites[activeCampIdx];
        const flick = 0.8 + Math.sin(system.time * 9) * 0.12 + Math.sin(system.time * 21) * 0.08;
        site.fireGlowMat.opacity = 0.8 * flick;
        site.fireLight.intensity = 5 * flick;
        const caged = cagedModels[activeCampIdx];
        if (caged && caged.releaseT >= 0) {
          caged.releaseT += dt;
          const g = caged.model.group;
          g.position.x += Math.sin(caged.releaseT * 3) * dt * 0.3;
          g.position.z -= dt * 2.2;
          g.position.y = terrainHeight(g.position.x, g.position.z) + Math.abs(Math.sin(caged.releaseT * 10)) * 0.15;
          if (caged.releaseT > 1.6) { scene.remove(g); cagedModels[activeCampIdx] = null; }
        }
      }

      // ---------- Duell ----------
      if (duelStartT >= 0) {
        duelStartT += dt;
        if (duelStartT > 0.9 && duelStartT - dt <= 0.9) hud.showToast('2…', 1);
        if (duelStartT > 1.8 && duelStartT - dt <= 1.8) hud.showToast('1…', 1);
        if (duelStartT >= 2.7) {
          duelStartT = -1;
          hud.showToast('Kämpft! ⚔️', 1.5);
          duelist.speedMul = 1 + Math.min(0.3, winStreak * 0.04);
          duelist.activate(DUELLRING_POS.x, DUELLRING_POS.z + DUELLRING_R * 0.5, true);
        }
      }
      if (duelActive) {
        duelist.update(dt, player);
        // Niederlage: Spieler stirbt während des Duells (dieselbe Real-
        // Gesundheit wie überall sonst — kein separates Schein-HP-System).
        if (health.dead) {
          duelActive = false;
          duelist.deactivate();
          hud.showToast('Das Duell ist verloren … Ondra nickt trotzdem anerkennend.', 3.5);
        }
      } else if (duelist.state !== 'inactive' && duelist.state !== 'gone' && !duelActive) {
        duelist.update(dt, player); // Flucht-/Knien-Animation zu Ende laufen lassen
      }

      updateBolts(dt, player);
      ondraEntry.enabled = !duelActive;

      ondraFig.group.rotation.y = Math.sin(system.time * 0.3) * 0.15; // dezentes Idle-Wiegen
      animateFigure(ondraFig, dt, false);
    },

    // Reset-Button (main.js) — kein eigenes save()/restore()-Objekt nötig,
    // main.js reicht save.wild bereits direkt durch (Muster S3/Fero heim/mounts).
    restore(savedWild) {
      deactivateCamp();
      duelActive = false;
      duelStartT = -1;
      duelist.deactivate();
      lastSpotIdx = -1;
      prevNightGlow = 0.5;
      if (savedWild && savedWild.aktivCamp >= 0 && savedWild.aktivCamp < WILDERER_SPOTS.length) {
        // lastSpotIdx MUSS gleich dem reaktivierten Spot sein, nicht seinem
        // Vorgänger — die Rotation rechnet beim nächsten Morgengrauen mit
        // (lastSpotIdx+1)%3, sonst würde exakt derselbe Spot erneut gewählt.
        lastSpotIdx = savedWild.aktivCamp;
        activateCamp(savedWild.aktivCamp);
      }
      // S10 Anführer: leaderResolved wird IMMER aus hallows.umhang abgeleitet
      // (nicht selbst gespeichert) — ein bereits erbeuteter Umhang darf das
      // Versteck nie wieder auftauchen lassen, egal wie oft neu geladen wird.
      // unresolvedDawns/leaderSpawned bleiben bewusst Session-Zustand (wie
      // S7 dailyPicked/S9 following) — bei einem Reload läuft die 2-Tage-
      // Zählung im schlimmsten Fall einfach neu an, kein Korrektheitsproblem.
      leaderResolved = !!hallows.umhang;
      leaderSpawned = leaderResolved;
      leaderBusted = false;
      unresolvedDawns = 0;
      leaderGuard.group.visible = leaderSpawned && !leaderResolved;
      leaderChestGroup.visible = leaderGuard.group.visible;
      leaderChestEntry.enabled = false;
      leaderChestLid.rotation.x = leaderResolved ? -1.9 : 0;
    },

    get activeCampIdx() { return activeCampIdx; },
    get duelActive() { return duelActive; },
    get winStreak() { return winStreak; },
  };
}
