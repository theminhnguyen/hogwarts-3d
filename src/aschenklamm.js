// Die Aschenklamm (E4, PLAN-EPISCHE-WELT.md Abschnitt 6.2): erste echte
// RegionManager-Region (E0 hatte nur eine synthetische Testregion). Vulkanische
// Schlucht mit Lavasee, Basaltsäulen, Feuer-Runen-Rätsel (öffnet den Weg zum
// Nest) und dem Miniboss-Drachen "Aschenschwinge". Quest "Das Drachenei":
// Ei stehlen -> Drache erwacht -> Kampf -> Truhe (Herz-Upgrade + Drachenschuppe
// fürs Feuerschutz-Rezept).
//
// Boss-Mechanik (wörtlich aus dem Plan): Stupor unterbricht den Feuerspeier
// WÄHREND des Telegraphs (wie beim Troll) -> kurzes Verwundbarkeits-Fenster
// für alle übrigen Sprüche. Incendio bleibt IMMER wirkungslos (Feuerdrache).
// hp-Modell wie beim Troll (avada gedeckelt auf 4, kein One-Shot) — NICHT das
// hitCount-Modell des Bleichen Königs, da der Plan hier ausdrücklich "wie
// beim Troll" fordert.
//
// Der "Lavasee" ist bewusst KEIN Terrain-Tiefpunkt (siehe terrain.js-Kommentar
// bei ASCHENKLAMM) — nur ein Deko-Mesh + Kollisions-Sperrring auf normaler
// Gehhöhe, dadurch kein Konflikt mit dem höhenbasierten Schwimm-Trigger.
//
// Platzierung (relativ zu ASCHENKLAMM-Zentrum C=(395,110), Kernradius 45 —
// alle Werte unten bleiben deutlich darunter, siehe einzelne Konstanten):
// Lavasee (409,90) r14 · Tor/Geröll (393,86) · 3 Feuerrunen · Thron+Nest
// (~399/391,72/74, Abstand zu C ≈36-38m). Ankunft vom Kate-Pfad liegt bei C
// selbst, die Route führt von dort nach Norden am See vorbei zum Tor.
import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, addCircleBlocker } from './geo.js';
import { terrainHeight, ASCHENKLAMM } from './terrain.js';
import { attachRimLight } from './model.js';

const C = { x: ASCHENKLAMM.x, z: ASCHENKLAMM.z };

const LAVA = { x: C.x + 14, z: C.z - 20, r: 13 };
const GATE = { x: C.x - 2, z: C.z - 24 };
const RUNES = [
  { x: C.x - 12, z: C.z - 6 },
  { x: C.x - 2, z: C.z - 20 },
  { x: C.x + 5, z: C.z - 2 },
];
const THRONE = { x: C.x + 4, z: C.z - 38 };
const NEST = { x: C.x - 4, z: C.z - 36 };

const DRAGON_TUNING = {
  hp: 16,
  hoverY: 5.5,
  circleR: 12,
  circleSpeed: 0.32,
  aggroFireRange: 24,
  attackCdMin: 3.2, attackCdMax: 4.8,
  telegraphDur: 1.2,
  breathDur: 0.9,
  boltSpeed: 15,
  boltDmg: 0.6,
  staggerDur: 2.4,
  wakeDur: 2.2,
};

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Drache: prozedurales Low-Poly-Modell (Torso, Hals/Kopf, 2
// Flügel mit Flug-Animation, verjüngter Schwanz statisch mit ins Batch
// gemergt — Beine bleiben klein/eingezogen, der Drache ist fast nur im
// Flug zu sehen). ----------
function buildDragonParts(glowTex) {
  const SKIN = 0x4a2a22, SKIN_DARK = 0x35201a, BELLY = 0x8a5a3a, HORN = 0x2a2018;

  const b = new GeoBatch();
  // Torso (länglich, leicht nach vorn geneigt)
  const torso = new THREE.SphereGeometry(0.95, 9, 7);
  torso.scale(1.5, 1.05, 1.0);
  torso.translate(0, 0, -0.1);
  b.addRaw(torso, SKIN);
  const belly = new THREE.SphereGeometry(0.75, 8, 6, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.5);
  belly.scale(1.35, 1, 0.95);
  belly.rotateX(Math.PI);
  belly.translate(0, -0.35, -0.05);
  b.addRaw(belly, BELLY);
  // Rücken-Zacken (kleine Kegel entlang der Wirbelsäule)
  for (let i = 0; i < 5; i++) {
    const s = 0.22 - i * 0.025;
    const spike = new THREE.ConeGeometry(s * 0.5, s, 5);
    spike.translate(0, 0.75 - i * 0.03, 1.1 - i * 0.45);
    b.addRaw(spike, SKIN_DARK);
  }
  // Hals (verjüngter Zylinder) + Kopf
  const neck = new THREE.CylinderGeometry(0.32, 0.48, 1.1, 7);
  neck.rotateX(-0.55);
  neck.translate(0, 0.55, 1.15);
  b.addRaw(neck, SKIN);
  const head = new THREE.SphereGeometry(0.42, 8, 6);
  head.scale(1.3, 0.85, 0.95);
  head.translate(0, 1.0, 1.85);
  b.addRaw(head, SKIN);
  const jaw = new THREE.BoxGeometry(0.35, 0.18, 0.55);
  jaw.translate(0, 0.75, 2.25);
  b.addRaw(jaw, SKIN_DARK);
  for (const s of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.09, 0.5, 5);
    horn.rotateZ(s * 0.5);
    horn.rotateX(-0.5);
    horn.translate(s * 0.18, 1.3, 1.65);
    b.addRaw(horn, HORN);
  }
  // Schwanz: 4 statische, sich verjüngende Segmente nach hinten/unten
  let tx = 0, ty = 0.2, tz = -1.3, tr = 0.34;
  for (let i = 0; i < 4; i++) {
    const len = 0.85 - i * 0.06;
    const nr = tr * 0.72;
    const seg = new THREE.CylinderGeometry(nr, tr, len, 6);
    seg.rotateX(Math.PI / 2 + 0.18 + i * 0.05);
    seg.translate(tx, ty - i * 0.12, tz - len * 0.5);
    b.addRaw(seg, i % 2 === 0 ? SKIN : SKIN_DARK);
    tz -= len * 0.92;
    ty -= 0.14;
    tr = nr;
  }
  const tailSpike = new THREE.ConeGeometry(0.18, 0.4, 5);
  tailSpike.rotateX(Math.PI / 2 + 0.3);
  tailSpike.translate(tx, ty - 0.3, tz - 0.2);
  b.addRaw(tailSpike, SKIN_DARK);
  // Kleine eingezogene Beine (fast nur Silhouette — Drache fliegt meist)
  for (const s of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 6);
    leg.translate(s * 0.55, -0.75, 0.3);
    b.addRaw(leg, SKIN_DARK);
    const claw = new THREE.ConeGeometry(0.1, 0.24, 5);
    claw.rotateX(Math.PI * 0.5);
    claw.translate(s * 0.55, -0.98, 0.55);
    b.addRaw(claw, HORN);
  }

  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  attachRimLight(bodyMat, { color: 0xff8a40, power: 2.2, intensity: 0.5 });
  const bodyMesh = b.build(bodyMat, { castShadow: true, receiveShadow: true });

  // Flügel: 2× identische Gruppe, per rotation.y um 180° gespiegelt statt
  // eigener mirrored Geometrie (Cylinder/Box sind symmetrisch genug, keine
  // sichtbare Asymmetrie durch den Yaw-Flip).
  const boneMat = new THREE.MeshLambertMaterial({ color: SKIN_DARK, flatShading: true });
  const membraneMat = new THREE.MeshLambertMaterial({ color: 0x6a2a1e, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  function buildWing() {
    const g = new THREE.Group();
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.6, 5), boneMat);
    bone.rotation.z = Math.PI / 2;
    bone.position.set(1.3, 0.1, 0);
    bone.castShadow = true;
    g.add(bone);
    const membrane = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 1.5), membraneMat);
    membrane.position.set(1.35, -0.05, 0.05);
    membrane.castShadow = true;
    g.add(membrane);
    return g;
  }

  // Maulglühen (Telegraph-Feedback) + Augen
  const mouthGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffa030, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const eyeMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffcf40, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const vulnMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffe08a, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  return { bodyMesh, buildWing, mouthGlowMat, eyeMat, vulnMat };
}

// ---------- Truhe (Muster: Troll-Truhe aus creatures.js) ----------
function buildChest(pos) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a3826, flatShading: true });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0xb08840, flatShading: true });
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
  const glowMat = new THREE.SpriteMaterial({
    map: null, color: 0xffb060, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(0, 0.6, 0);
  glow.scale.setScalar(0.1);
  group.add(glow);
  group.visible = false;
  return { group, lidPivot, glow, opened: false, openT: -1, collected: false };
}

// ---------- Drache-Klasse ----------
class Dragon {
  constructor(system, parts, glowTex) {
    this.system = system;
    this.species = 'aschenschwinge';
    this.hp = DRAGON_TUNING.hp;
    this.maxHp = DRAGON_TUNING.hp;
    this.alive = false; // erst ab 'flying' gültiges Spruchziel (wie Bleicher König)
    this.radius = 1.6;
    this.hitY = 0; // pos ist bereits Körpermitte (Flughöhe), kein Fußpunkt-Anker
    this.state = 'sleeping'; // sleeping|waking|flying|telegraph|firebreath|staggered|dying|dead
    this.stateT = 0;
    this.attackCd = 0;
    this.flapT = Math.random() * Math.PI * 2;
    this.circleA = 0;
    this.groundY = terrainHeight(THRONE.x, THRONE.z);
    this.homeX = THRONE.x;
    this.homeZ = THRONE.z;

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(THRONE.x, this.groundY, THRONE.z);
    system.scene.add(this.group);

    // Nur EIN Drache pro Welt — parts.bodyMesh direkt verwenden (kein
    // clone() nötig, das Rim-Light steckt bereits im Material aus buildDragonParts()).
    this.group.add(parts.bodyMesh);

    this.wingL = parts.buildWing();
    this.wingL.position.set(0.5, 0.55, -0.3);
    this.group.add(this.wingL);
    this.wingR = parts.buildWing();
    this.wingR.position.set(-0.5, 0.55, -0.3);
    this.wingR.rotation.y = Math.PI;
    this.group.add(this.wingR);

    this.mouthGlow = new THREE.Sprite(parts.mouthGlowMat.clone());
    this.mouthGlow.scale.setScalar(0.3);
    this.mouthGlow.position.set(0, 0.72, 2.35);
    this.group.add(this.mouthGlow);
    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(parts.eyeMat.clone());
      eye.scale.setScalar(0.14);
      eye.position.set(s * 0.2, 1.05, 2.05);
      this.group.add(eye);
    }
    this.vulnGlow = new THREE.Sprite(parts.vulnMat.clone());
    this.vulnGlow.scale.setScalar(2.6);
    this.vulnGlow.position.set(0, 0, 0);
    this.group.add(this.vulnGlow);

    this.chest = buildChest({ x: NEST.x + 2.2, y: terrainHeight(NEST.x + 2.2, NEST.z), z: NEST.z });
    system.scene.add(this.chest.group);
  }

  wake() {
    if (this.state !== 'sleeping') return;
    this.state = 'waking';
    this.stateT = 0;
  }

  applyHit(spellId, _boltVel, dmgMul = 1) {
    if (!this.alive) return;
    // Feuerdrache: gegen Incendio IMMER immun (Plan 6.2, keine Ausnahme).
    if (spellId === 'incendio') return;
    // Kern-Mechanik (Plan 6.2): Stupor unterbricht den Feuerspeier NUR
    // während des Telegraphs — öffnet das Verwundbarkeits-Fenster.
    if (spellId === 'stupor' && this.state === 'telegraph') {
      this.state = 'staggered';
      this.stateT = 0;
      this.mouthGlow.material.opacity = 0;
      this.system.audio.dragonHit?.();
      this.system.fx.burst(this.pos, 0xffb060, 18, 4, { gravity: -1, life: 0.5 });
      return;
    }
    // Sonst nur im Verwundbarkeits-Fenster überhaupt verletzbar.
    if (this.state !== 'staggered') return;
    // Eisblitz (E5): "Region-Verzahnung Eis→Drache" aus dem Plan (Abschnitt
    // 6.2/6.3) — ein optionaler Bonus für Spieler, die zuerst die
    // Frostzinnen gemacht haben, NIE Voraussetzung (Eisblitz existiert
    // unabhängig davon, ob E5 schon gespielt wurde).
    const dmg = spellId === 'avada' ? 4
      : spellId === 'eisblitz' ? 2
      : spellId === 'crucio' ? 0.25
      : spellId === 'claw' ? 0.5
      : (spellId === 'stupor' || spellId === 'kick' || spellId === 'bite') ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg * dmgMul;
    this.system.audio.dragonHit?.();
    this.system.fx.burst(this.pos, 0xffb060, 12, 3.5, { gravity: -1, life: 0.4 });
    if (this.hp <= 0) this._die();
  }

  _die() {
    this.alive = false;
    this.state = 'dying';
    this.stateT = 0;
    this.mouthGlow.material.opacity = 0;
    this.vulnGlow.material.opacity = 0;
    this.system.fx.burst(this.pos, 0xffb060, 50, 6, { gravity: -1, life: 1.2 });
    this.system.audio.chime?.('fanfare');
    this.system.hud?.showToast('🐉 Aschenschwinge ist bezwungen! Eine Truhe erscheint …', 4);
  }

  _breatheFire(player) {
    const dx0 = player.pos.x - this.pos.x, dz0 = player.pos.z - this.pos.z;
    const baseAngle = Math.atan2(dx0, dz0);
    for (const off of [-0.16, 0, 0.16]) {
      const a = baseAngle + off;
      const vx = Math.sin(a) * DRAGON_TUNING.boltSpeed, vz = Math.cos(a) * DRAGON_TUNING.boltSpeed;
      this.system.spawnBolt(this.pos.x, this.pos.y - 0.2, this.pos.z + 1.9, vx, -0.6, vz);
    }
    this.system.audio.dragonBreath?.();
  }

  update(dt, player) {
    if (this.state === 'dead') { this._updateChest(dt, player); return; }
    if (this.state === 'dying') {
      this.stateT += dt;
      this.group.scale.setScalar(Math.max(0, 1 - this.stateT / 1.2));
      this.pos.y -= dt * 0.7;
      if (this.stateT >= 1.2) {
        this.state = 'dead';
        this.group.visible = false;
        this.chest.group.visible = true;
      }
      this._updateChest(dt, player);
      return;
    }
    if (this.state === 'sleeping') {
      this.stateT += dt;
      this.pos.y = this.groundY + Math.sin(this.stateT * 0.8) * 0.05;
      return;
    }
    if (this.state === 'waking') {
      this.stateT += dt;
      const f = clamp01(this.stateT / DRAGON_TUNING.wakeDur);
      this.wingL.rotation.z = -0.2 + f * 0.6;
      this.wingR.rotation.z = 0.2 - f * 0.6;
      this.pos.y = this.groundY + f * f * DRAGON_TUNING.hoverY;
      if (this.stateT >= DRAGON_TUNING.wakeDur) {
        this.alive = true;
        this.state = 'flying';
        this.stateT = 0;
        this.circleA = Math.random() * Math.PI * 2;
        this.attackCd = rand(1.5, 2.5);
      }
      return;
    }

    switch (this.state) {
      case 'flying': {
        this.stateT += dt;
        this.attackCd -= dt;
        this.circleA += dt * DRAGON_TUNING.circleSpeed;
        this.pos.x = this.homeX + Math.cos(this.circleA) * DRAGON_TUNING.circleR;
        this.pos.z = this.homeZ + Math.sin(this.circleA) * DRAGON_TUNING.circleR;
        this.pos.y = this.groundY + DRAGON_TUNING.hoverY + Math.sin(this.system.time * 0.6) * 0.4;
        const dist = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        if (this.attackCd <= 0 && dist < DRAGON_TUNING.aggroFireRange) {
          this.state = 'telegraph';
          this.stateT = 0;
        }
        break;
      }
      case 'telegraph': {
        this.stateT += dt;
        this.circleA += dt * DRAGON_TUNING.circleSpeed * 0.35;
        this.pos.x = this.homeX + Math.cos(this.circleA) * DRAGON_TUNING.circleR;
        this.pos.z = this.homeZ + Math.sin(this.circleA) * DRAGON_TUNING.circleR;
        this.pos.y = this.groundY + DRAGON_TUNING.hoverY;
        const f = clamp01(this.stateT / DRAGON_TUNING.telegraphDur);
        this.mouthGlow.material.opacity = f * 0.95;
        this.mouthGlow.scale.setScalar(0.25 + f * 0.6);
        if (this.stateT >= DRAGON_TUNING.telegraphDur) {
          this._breatheFire(player);
          this.mouthGlow.material.opacity = 0;
          this.state = 'firebreath';
          this.stateT = 0;
        }
        break;
      }
      case 'firebreath': {
        this.stateT += dt;
        if (this.stateT >= DRAGON_TUNING.breathDur) {
          this.state = 'flying';
          this.stateT = 0;
          this.attackCd = rand(DRAGON_TUNING.attackCdMin, DRAGON_TUNING.attackCdMax);
        }
        break;
      }
      case 'staggered': {
        this.stateT += dt;
        const f = clamp01(this.stateT / 0.4);
        this.pos.y = lerp(this.groundY + DRAGON_TUNING.hoverY, this.groundY + 2.2, f);
        this.vulnGlow.material.opacity = 0.35 + Math.sin(this.system.time * 8) * 0.15;
        if (this.stateT >= DRAGON_TUNING.staggerDur) {
          this.vulnGlow.material.opacity = 0;
          this.state = 'flying';
          this.stateT = 0;
          this.attackCd = rand(DRAGON_TUNING.attackCdMin, DRAGON_TUNING.attackCdMax);
        }
        break;
      }
    }

    // Flügelschlag (außer im Verwundbarkeits-Fenster: dort nur sacktes Segeln)
    const flapSpeed = this.state === 'staggered' ? 1.2 : 4.5;
    this.flapT += dt * flapSpeed;
    const flap = Math.sin(this.flapT) * 0.55;
    this.wingL.rotation.z = 0.25 + flap;
    this.wingR.rotation.z = -(0.25 + flap);

    // Blickrichtung: Modell-Gieren zur Bewegungsrichtung (Kreisbahn-Tangente).
    const tangent = this.circleA + Math.PI / 2;
    const targetYaw = Math.atan2(Math.cos(tangent), -Math.sin(tangent));
    this.group.rotation.y = angleLerp(this.group.rotation.y, targetYaw, Math.min(1, dt * 3));

    this._updateChest(dt, player);
  }

  _updateChest(dt, player) {
    const chest = this.chest;
    if (!chest.group.visible || chest.collected) return;
    if (!chest.opened) {
      const dx = player.pos.x - chest.group.position.x, dz = player.pos.z - chest.group.position.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        chest.opened = true;
        chest.openT = 0;
        this.system.audio.chime?.('fanfare');
        this.system.fx.burst(chest.group.position, 0xffb060, 26, 4, { gravity: -1, life: 1.0 });
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
        this.system.onDragonChest?.();
      }
    }
  }
}

// ---------- Lavasee, Basaltsäulen, Tor+Runen, Nest+Ei ----------
function buildDecor(root, glowTex) {
  const batch = new GeoBatch();
  const ROCK = 0x2a2622, ROCK_DARK = 0x1a1815;

  // Basaltsäulen (Sechskant-Prismen, wie echte Basaltformationen) — verstreut
  // um See und Tor, ein paar auch als Sperre neben dem Geröll.
  const rng = (() => { let s = 9001; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  const columns = [];
  const spots = [
    { x: LAVA.x - 10, z: LAVA.z + 6 }, { x: LAVA.x + 9, z: LAVA.z - 8 },
    { x: LAVA.x - 4, z: LAVA.z - 12 }, { x: LAVA.x + 12, z: LAVA.z + 4 },
    { x: GATE.x - 4, z: GATE.z + 1 }, { x: GATE.x + 4, z: GATE.z + 1 },
    { x: THRONE.x + 8, z: THRONE.z - 3 }, { x: THRONE.x - 9, z: THRONE.z + 4 },
    { x: C.x - 8, z: C.z - 2 }, { x: C.x + 16, z: C.z - 14 },
  ];
  for (const spot of spots) {
    const h = 3 + rng() * 5;
    const r = 0.5 + rng() * 0.35;
    const y = terrainHeight(spot.x, spot.z);
    const col = new THREE.CylinderGeometry(r * 0.85, r, h, 6);
    col.translate(spot.x, y + h / 2, spot.z);
    batch.addRaw(col, rng() > 0.5 ? ROCK : ROCK_DARK);
    columns.push({ x: spot.x, z: spot.z, r });
    if (r > 0.65) addCircleBlocker(spot.x, spot.z, r * 0.8, y - 1, y + h);
  }

  // Tor-Geröll: blockiert den Weg zum Thron, bis alle 3 Runen entzündet sind.
  const gateY = terrainHeight(GATE.x, GATE.z);
  const gateGroup = new THREE.Group();
  gateGroup.position.set(GATE.x, gateY, GATE.z);
  for (let i = 0; i < 6; i++) {
    const s = 0.5 + rng() * 0.6;
    const rock = new THREE.DodecahedronGeometry(s, 0);
    const rockMesh = new THREE.Mesh(rock, new THREE.MeshLambertMaterial({ color: rng() > 0.5 ? ROCK : ROCK_DARK, flatShading: true }));
    rockMesh.position.set((rng() - 0.5) * 3.4, s * 0.5, (rng() - 0.5) * 1.6);
    rockMesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rockMesh.castShadow = true;
    gateGroup.add(rockMesh);
  }
  root.add(gateGroup);
  // Kollisionsbox eng an den tatsächlichen Gesteinshaufen angelehnt (Rock-
  // Offsets oben: x±1.7, z±0.8, dazu Radius bis 1.1 -> Worst-Case-Ausdehnung
  // x±2.8/z±1.9). Vorher war die Box mit x±5 deutlich breiter als das
  // sichtbare Geröll — der Spieler lief spürbar gegen eine unsichtbare Wand,
  // weit außerhalb der sichtbaren Steine (gemeldeter Bug: "unsichtbarer
  // Stein"). Das eigentliche Rätsel-Gate ist ohnehin der `enabled`-Getter am
  // Ei-Interact weiter unten (gateOpened && !eggStolen) — diese Box muss nur
  // noch verhindern, direkt DURCH die sichtbaren Felsen zu laufen, nicht die
  // gesamte offene Fläche drumherum sperren.
  const gateBlocker = addBoxBlocker(GATE.x - 3, GATE.x + 3, gateY - 1, gateY + 3, GATE.z - 2, GATE.z + 2);
  const gateBaseY = gateGroup.position.y;

  // 3 Feuerrunen: Sockel + erlöschende/glühende Rune (Sprite), Muster wie
  // die Feuerschalen in puzzles.js R1 (kein Timer nötig, Reihenfolge egal).
  const runeBraziers = [];
  for (const spot of RUNES) {
    const y = terrainHeight(spot.x, spot.z);
    batch.addRaw(new THREE.CylinderGeometry(0.28, 0.34, 0.7, 8).translate(spot.x, y + 0.35, spot.z), ROCK);
    const runeMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xff7a30, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const rune = new THREE.Sprite(runeMat);
    rune.position.set(spot.x, y + 0.85, spot.z);
    rune.scale.set(1.4, 1.9, 1);
    root.add(rune);
    const light = new THREE.PointLight(0xff7a30, 0, 7, 2);
    light.position.copy(rune.position);
    root.add(light);
    runeBraziers.push({ x: spot.x, y: y + 0.7, z: spot.z, rune, light, lit: false });
  }

  // Nest + Ei
  const nestY = terrainHeight(NEST.x, NEST.z);
  batch.addRaw(new THREE.TorusGeometry(0.7, 0.22, 6, 10).rotateX(Math.PI / 2).translate(NEST.x, nestY + 0.15, NEST.z), 0x5c4020);
  const eggMat = new THREE.MeshLambertMaterial({ color: 0xd8a050, flatShading: true });
  const egg = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 7), eggMat);
  egg.scale.set(0.85, 1.15, 0.85);
  egg.position.set(NEST.x, nestY + 0.4, NEST.z);
  egg.castShadow = true;
  root.add(egg);
  const eggGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffb860, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const eggGlow = new THREE.Sprite(eggGlowMat);
  eggGlow.scale.setScalar(1.1);
  eggGlow.position.copy(egg.position);
  root.add(eggGlow);

  // Thron (Basalt-Podest, auf dem der Drache schläft/landet)
  const throneY = terrainHeight(THRONE.x, THRONE.z);
  batch.addRaw(new THREE.CylinderGeometry(1.6, 2.0, 1.4, 8).translate(THRONE.x, throneY + 0.7, THRONE.z), ROCK_DARK);
  addCircleBlocker(THRONE.x, THRONE.z, 1.9, throneY - 1, throneY + 1.4);

  const decorMesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { castShadow: true, receiveShadow: true });
  if (decorMesh) root.add(decorMesh);

  // Lavasee: Deko-Scheibe (KEIN Terrain-Tiefpunkt, siehe Kopf-Kommentar) +
  // Sperr-Ring, damit der Spieler nicht buchstäblich in die Lava läuft.
  const lavaY = terrainHeight(LAVA.x, LAVA.z) + 0.05;
  const lavaGeo = new THREE.CircleGeometry(LAVA.r, 24);
  lavaGeo.rotateX(-Math.PI / 2);
  const col = new THREE.Color();
  const colors = new Float32Array(lavaGeo.attributes.position.count * 3);
  const pos = lavaGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i), pos.getZ(i)) / LAVA.r;
    col.setRGB(1, 0.55 - d * 0.35, 0.08).lerp(new THREE.Color(0x3a1408), d * 0.7);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  lavaGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lavaMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const lavaMesh = new THREE.Mesh(lavaGeo, lavaMat);
  lavaMesh.position.set(LAVA.x, lavaY, LAVA.z);
  root.add(lavaMesh);
  const lavaGlow = new THREE.PointLight(0xff5a20, 6, LAVA.r * 2.4, 2);
  lavaGlow.position.set(LAVA.x, lavaY + 1.5, LAVA.z);
  root.add(lavaGlow);
  addCircleBlocker(LAVA.x, LAVA.z, LAVA.r + 0.6, lavaY - 1, lavaY + 2.5);

  return {
    gateGroup, gateBlocker, gateBaseY, runeBraziers,
    egg, eggGlow, lavaMesh, lavaMat, lavaGlow, lavaY,
  };
}

// ---------- Haupt-Einstieg: von regions.js EINMALIG beim ersten Wecken
// aufgerufen (root = frische, bereits an die Szene gehängte Group). ----------
export function buildAschenklamm(root, deps) {
  const { glowTex, hud, audio, fx, health, interact, spells, aschenklamm, siegel, heim, onChange } = deps;

  const system = {
    scene: root, glowTex, fx, audio, hud, time: 0, peaceful: false,
    bolts: [], fireImmune: false,
    onDragonChest: null,
  };

  const decor = buildDecor(root, glowTex);
  const parts = buildDragonParts(glowTex);
  const dragon = new Dragon(system, parts, glowTex);

  let gateOpened = false;

  function litCount() { return decor.runeBraziers.filter(r => r.lit).length; }

  function igniteRune(i) {
    const r = decor.runeBraziers[i];
    if (!r || r.lit || gateOpened) return;
    r.lit = true;
    r.rune.material.opacity = 0.95;
    r.light.intensity = 9;
    audio.chime?.();
    if (litCount() === decor.runeBraziers.length) openGate();
  }

  function openGate() {
    gateOpened = true;
    decor.gateBlocker.disabled = true;
    audio.puzzleRumble?.(1.6);
    hud.showToast('🔥 Das Geröll birst — der Weg zum Drachennest ist frei!', 3);
  }

  decor.runeBraziers.forEach((r, i) => {
    spells.registerTarget({
      kind: 'aschenklamm-rune', radius: 0.9, accepts: ['incendio'],
      getPos: () => ({ x: r.x, y: r.y, z: r.z }),
      onSpell: () => igniteRune(i),
    });
  });

  interact.register({
    x: NEST.x, z: NEST.z, r: 1.9,
    get enabled() { return gateOpened && !aschenklamm.eggStolen; },
    prompt: 'E — Das Drachenei stehlen',
    onInteract: () => {
      aschenklamm.eggStolen = 1;
      decor.egg.visible = false;
      decor.eggGlow.visible = false;
      hud.showToast('🥚 Du stiehlst das Drachenei! Ein ohrenbetäubender Schrei hallt durch die Klamm …', 4.5);
      dragon.wake();
      onChange?.();
    },
  });

  system.spawnBolt = (x, y, z, vx, vy, vz) => {
    const b = { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), life: 3, dmg: DRAGON_TUNING.boltDmg };
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xff6a20, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Sprite(mat);
    mesh.scale.setScalar(0.45);
    mesh.position.copy(b.pos);
    root.add(mesh);
    b.mesh = mesh;
    system.bolts.push(b);
  };

  function updateBolts(dt, player) {
    for (let i = system.bolts.length - 1; i >= 0; i--) {
      const b = system.bolts[i];
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      const dx = b.pos.x - player.pos.x, dy = b.pos.y - (player.pos.y + 1.0), dz = b.pos.z - player.pos.z;
      const hit = dx * dx + dy * dy + dz * dz < 0.6 * 0.6;
      if (hit) {
        if (!system.fireImmune && !system.peaceful && !player.invisible) {
          const d = Math.hypot(dx, dz) || 1;
          health.damage(b.dmg, { x: dx / d, y: 0.2, z: dz / d });
        }
        fx.burst(b.pos, 0xff6a20, 12, 2.5, { gravity: -1, life: 0.4 });
      }
      if (hit || b.life <= 0) {
        root.remove(b.mesh);
        system.bolts.splice(i, 1);
      } else {
        b.mesh.position.copy(b.pos);
      }
    }
  }

  system.onDragonChest = () => {
    // +1 relativ zum aktuellen Maximum (nicht fest "7") — Dragon/Frostriese
    // (E4/E5) sind gleichrangige Bosse, die in beliebiger Reihenfolge
    // gespielt werden können; ein hartes Ziel hätte den zweiten Bonus
    // stillschweigend verschluckt, falls er zuerst käme.
    health.upgradeMaxHearts(health.maxHearts + 1);
    hud.setHearts(health.hearts, health.effectiveMaxHearts);
    heim.zutaten.schuppe += 3;
    aschenklamm.dragonDefeated = 1;
    aschenklamm.chestCollected = 1;
    siegel.drache = 1;
    hud.showToast('❤️ Herz-Upgrade! Maximale Herzen: 7 · 🐲 3× Drachenschuppe · Titel „Drachenbezwinger" errungen!', 5);
    onChange?.();
  };

  // Save-Stand anwenden (Erstaufbau UND Reset-Button nutzen denselben Weg —
  // die Region baut nur EINMAL, ein Reset danach ruft nur diese Funktion neu).
  function applySavedState() {
    for (const r of decor.runeBraziers) { r.lit = false; r.rune.material.opacity = 0; r.light.intensity = 0; }
    gateOpened = false;
    decor.gateBlocker.disabled = false;
    decor.gateGroup.position.y = decor.gateBaseY;

    if (aschenklamm.dragonDefeated) {
      gateOpened = true;
      decor.gateBlocker.disabled = true;
      decor.gateGroup.position.y = decor.gateBaseY - 2.6; // schon gesunken, keine Replay-Animation
      decor.egg.visible = false;
      decor.eggGlow.visible = false;
      dragon.alive = false;
      dragon.state = 'dead';
      dragon.hp = 0;
      dragon.group.visible = false;
      dragon.chest.group.visible = true;
      dragon.chest.opened = aschenklamm.chestCollected === 1;
      dragon.chest.collected = aschenklamm.chestCollected === 1;
      dragon.chest.openT = -1;
      dragon.chest.lidPivot.rotation.x = aschenklamm.chestCollected ? -1.9 : 0;
      dragon.chest.glow.material.opacity = 0;
      if (aschenklamm.chestCollected) dragon.chest.group.visible = false;
    } else if (aschenklamm.eggStolen) {
      gateOpened = true;
      decor.gateBlocker.disabled = true;
      decor.gateGroup.position.y = decor.gateBaseY - 2.6;
      decor.egg.visible = false;
      decor.eggGlow.visible = false;
      dragon.group.visible = true;
      dragon.alive = true;
      dragon.state = 'flying';
      dragon.hp = DRAGON_TUNING.hp;
      dragon.circleA = Math.random() * Math.PI * 2;
      dragon.attackCd = rand(1.5, 2.5);
    } else {
      decor.egg.visible = true;
      decor.eggGlow.visible = true;
      dragon.group.visible = true;
      dragon.alive = false;
      dragon.state = 'sleeping';
      dragon.stateT = 0;
      dragon.hp = DRAGON_TUNING.hp;
      dragon.pos.set(THRONE.x, dragon.groundY, THRONE.z);
      dragon.chest.group.visible = false;
      dragon.chest.opened = false;
      dragon.chest.collected = false;
      dragon.chest.openT = -1;
    }
  }
  applySavedState();

  let lavaT = 0;

  return {
    dragon,
    get fireImmune() { return system.fireImmune; },
    set fireImmune(v) { system.fireImmune = v; },

    update(dt, player) {
      system.time += dt;
      lavaT += dt;
      decor.lavaGlow.intensity = 6 + Math.sin(lavaT * 1.3) * 1.5 + Math.sin(lavaT * 3.1) * 0.8;
      for (const r of decor.runeBraziers) {
        if (!r.lit) continue;
        const flick = 0.85 + Math.sin(system.time * 9 + r.x) * 0.15;
        r.light.intensity = 9 * flick;
      }
      // Nach dem Öffnen sinkt das Geröll langsam in den Boden ab.
      if (gateOpened && decor.gateGroup.position.y > decor.gateBaseY - 2.6) {
        decor.gateGroup.position.y -= dt * 1.4;
      }
      dragon.update(dt, player);
      updateBolts(dt, player);
    },

    // Reset-Button (main.js): Save-Felder sind zu diesem Zeitpunkt bereits
    // extern auf 0 gesetzt (Object.assign) — hier nur die Live-Objekte
    // synchron nachziehen, exakt dieselbe Funktion wie beim Erstaufbau.
    restore() { applySavedState(); },
  };
}
