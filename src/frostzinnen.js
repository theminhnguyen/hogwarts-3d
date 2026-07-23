// Die Frostzinnen (E5, PLAN-EPISCHE-WELT.md Abschnitt 6.3): zweite echte
// RegionManager-Region. Eisige Bergzinnen im Norden mit gefrorenem See,
// Eis-Runen-Rätsel (schaltet den Zugang zur Höhle frei) und dem Miniboss
// "Rimefell". Neue Mechanik: der Spruch Eisblitz — wird an einem
// eigenständigen Eisaltar VOR dem Höhlentor gelehrt (kein Zirkelschluss:
// die Runen brauchen Eisblitz, der Altar selbst braucht ihn nicht).
//
// Boss-Mechanik bewusst ANDERS als Aschenschwinge (Vielfalt statt drittem
// Aufguss derselben Formel): Rimefell ist ein bodenständiger Fernkämpfer
// (Eiswurf, Muster wie Bleicher Königs Bolzen), IMMER verletzbar (kein
// Interrupt-Fenster wie beim Drachen) — reagiert aber auf Stupor/Crucio/Claw
// mit einer kurzen Unterbrechung, exakt wie der Troll. Eigenes Element
// (Eisblitz) wirkungslos, Incendio als Bonus-Schaden ("Feuer→Eis" laut
// Plan-Kasten in Abschnitt 6.2) — Spiegelbild zur Dragon/Incendio-Immunität.
//
// Der "gefrorene See" ist bewusst KEIN Terrain-Tiefpunkt (siehe terrain.js-
// Kommentar bei FROSTZINNEN) UND braucht anders als der Lavasee KEINEN
// Kollisions-Sperrring — Eis ist fest begehbar, nur eine Deko-Fläche auf
// normaler Gehhöhe.
import * as THREE from 'three';
import { GeoBatch, addBoxBlocker, addCircleBlocker } from './geo.js';
import { terrainHeight, FROSTZINNEN } from './terrain.js';
import { attachRimLight, buildLimbChain } from './model.js';

const C = { x: FROSTZINNEN.x, z: FROSTZINNEN.z };

const ALTAR = { x: C.x, z: C.z + 15 };
const LAKE_F = { x: C.x + 15, z: C.z - 10, r: 13 };
const GATE = { x: C.x - 2, z: C.z - 20 };
const RUNES = [
  { x: C.x - 14, z: C.z - 6 },
  { x: C.x + 2, z: C.z - 18 },
  { x: C.x + 10, z: C.z - 2 },
];
const LAIR = { x: C.x, z: C.z - 35 };

const GIANT_TUNING = {
  hp: 14,
  patrolSpeed: 1.2, chaseSpeed: 3.0, patrolRadius: 10,
  throwRange: 13, minRange: 5, leaveAggroRange: 24,
  telegraphDur: 0.9, staggerDur: 0.6,
  attackCdMin: 2.2, attackCdMax: 3.4,
  boltSpeed: 13, boltDmg: 0.8,
};

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function rand(min, max) { return min + Math.random() * (max - min); }
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Rimefell: prozedurales Low-Poly-Modell (großer Torso, Kopf,
// 1 Wurfarm-Gelenk für den Telegraph, 2 Bein-Gelenkketten mit Gang wie beim
// Troll). ----------
function buildGiantParts(glowTex) {
  const SKIN = 0x9fc4d8, SKIN_DARK = 0x7aa4ba, ICE = 0xd8f0ff, ICE_DARK = 0xaed8ec;

  const b = new GeoBatch();
  const torso = new THREE.SphereGeometry(1.05, 9, 7);
  torso.scale(1.05, 1.35, 0.9);
  torso.translate(0, 2.3, 0);
  b.addRaw(torso, SKIN);
  const head = new THREE.SphereGeometry(0.5, 8, 6);
  head.scale(0.95, 0.9, 0.95);
  head.translate(0, 3.55, 0.05);
  b.addRaw(head, SKIN);
  // Eis-Zacken auf Schultern/Rücken (Rüstung aus gewachsenem Eis)
  for (const s of [-1, 1]) {
    const spike = new THREE.ConeGeometry(0.22, 0.6, 5);
    spike.rotateZ(s * 0.4);
    spike.translate(s * 0.75, 3.05, -0.15);
    b.addRaw(spike, ICE);
  }
  for (let i = 0; i < 3; i++) {
    const s = 0.26 - i * 0.04;
    const spike = new THREE.ConeGeometry(s, s * 1.8, 5);
    spike.translate(0, 3.0 - i * 0.05, -0.55 + i * 0.02);
    b.addRaw(spike, ICE_DARK);
  }
  // Nicht-werfender Arm (statisch, hängend)
  const arm = new THREE.CylinderGeometry(0.24, 0.28, 1.1, 6);
  arm.rotateZ(0.2);
  arm.translate(-1.05, 1.95, 0.1);
  b.addRaw(arm, SKIN_DARK);

  const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  attachRimLight(bodyMat, { color: 0xbfe8ff, power: 2.4, intensity: 0.5 });
  const bodyMesh = b.build(bodyMat, { castShadow: true, receiveShadow: true });

  const darkMat = new THREE.MeshLambertMaterial({ color: SKIN_DARK, flatShading: true });
  attachRimLight(darkMat, { color: 0xbfe8ff, power: 2.4, intensity: 0.5 });
  const iceMat = new THREE.MeshLambertMaterial({ color: ICE, flatShading: true });

  const mistMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xbfe8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const eyeMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9fe0ff, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  return { bodyMesh, darkMat, iceMat, mistMat, eyeMat };
}

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
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x9fe0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.position.set(0, 0.6, 0);
  glow.scale.setScalar(0.1);
  group.add(glow);
  group.visible = false;
  return { group, lidPivot, glow, opened: false, openT: -1, collected: false };
}

class Rimefell {
  constructor(system, parts) {
    this.system = system;
    this.species = 'rimefell';
    this.hp = GIANT_TUNING.hp;
    this.maxHp = GIANT_TUNING.hp;
    this.alive = false; // erst ab 'aggro' gültiges Spruchziel (wie Bleicher König/Drache)
    this.radius = 1.3;
    this.hitY = 2.0; // pos ist Fußpunkt — Treffer-Kugel auf Torso-Höhe heben
    this.state = 'sleeping'; // sleeping|waking|patrol|aggro|telegraph|throw|stagger|dying|dead
    this.stateT = 0;
    this.attackCd = 0;
    this.gaitT = 0;
    this.homeX = LAIR.x;
    this.homeZ = LAIR.z;
    this.phaseA = Math.random() * Math.PI * 2;
    this.vel = new THREE.Vector3();

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(LAIR.x, terrainHeight(LAIR.x, LAIR.z), LAIR.z);
    system.scene.add(this.group);
    this.group.add(parts.bodyMesh);

    this.throwArm = new THREE.Group();
    this.throwArm.position.set(1.05, 3.15, 0.1);
    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.6, 6), parts.darkMat);
    upperArm.position.set(0, -0.3, 0);
    this.throwArm.add(upperArm);
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.55, 6), parts.darkMat);
    forearm.position.set(0, -0.82, 0);
    this.throwArm.add(forearm);
    const iceShard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), parts.iceMat);
    iceShard.position.set(0, -1.2, 0);
    this.throwArm.add(iceShard);
    this.group.add(this.throwArm);

    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(parts.eyeMat.clone());
      eye.scale.setScalar(0.16);
      eye.position.set(s * 0.16, 3.6, 0.42);
      this.group.add(eye);
    }
    this.mist = new THREE.Sprite(parts.mistMat.clone());
    this.mist.scale.setScalar(0.6);
    this.mist.position.set(0, 3.35, 0.5);
    this.group.add(this.mist);

    // Beine: Gelenkketten wie beim Troll (2 Segmente, nur Hüfte animiert).
    this.legs = [];
    for (const s of [-1, 1]) {
      const chain = buildLimbChain(this.group, {
        pos: { x: s * 0.5, y: 2.15, z: 0 },
        down: true,
        segments: [
          { radiusTop: 0.26, radiusBot: 0.22, length: 1.05, material: parts.darkMat, restRotX: 0.05 },
          { radiusTop: 0.2, radiusBot: 0.16, length: 1.0, material: parts.darkMat, restRotX: -0.05 },
        ],
      });
      this.legs.push({ hip: chain.joints[0], phase: s > 0 ? 0 : Math.PI });
    }

    this.chest = buildChest({ x: LAIR.x + 2.4, y: terrainHeight(LAIR.x + 2.4, LAIR.z), z: LAIR.z });
    system.scene.add(this.chest.group);
  }

  wake() {
    if (this.state !== 'sleeping') return;
    this.state = 'waking';
    this.stateT = 0;
  }

  applyHit(spellId, _boltVel, dmgMul = 1) {
    if (!this.alive) return;
    // Eigenes Element: Eisblitz bleibt wirkungslos (Symmetrie zu Incendio/Drache).
    if (spellId === 'eisblitz') return;
    // Feuer→Eis-Bonus (Plan-Kasten Abschnitt 6.2): Incendio schadet mehr als üblich.
    const dmg = spellId === 'avada' ? 4
      : spellId === 'incendio' ? 3
      : spellId === 'crucio' ? 0.25
      : spellId === 'claw' ? 0.5
      : (spellId === 'stupor' || spellId === 'kick' || spellId === 'bite') ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg * dmgMul;
    this.system.audio.frostGiantHit?.();
    this.system.fx.burst(this.pos.clone().setY(this.pos.y + this.hitY), 0xbfe8ff, 12, 3.5, { gravity: -1, life: 0.4 });
    if (this.hp <= 0) { this._die(); return; }
    // Stupor/Crucio/Claw unterbrechen jede laufende Aktion (Muster: Troll).
    if ((spellId === 'stupor' || spellId === 'crucio' || spellId === 'claw') && this.state !== 'dying') {
      this.state = 'stagger';
      this.stateT = 0;
    }
  }

  _die() {
    this.alive = false;
    this.state = 'dying';
    this.stateT = 0;
    this.mist.material.opacity = 0;
    this.system.fx.burst(this.pos.clone().setY(this.pos.y + 2), 0xbfe8ff, 50, 6, { gravity: -1, life: 1.2 });
    this.system.audio.chime?.('fanfare');
    this.system.hud?.showToast('🧊 Rimefell ist bezwungen! Eine Truhe erscheint …', 4);
  }

  _steerXZ(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  _throwIce(player) {
    const dx = player.pos.x - this.pos.x, dy = (player.pos.y + 1.0) - (this.pos.y + 3.2), dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    this.system.spawnBolt(
      this.pos.x, this.pos.y + 3.2, this.pos.z,
      (dx / d) * GIANT_TUNING.boltSpeed, (dy / d) * GIANT_TUNING.boltSpeed, (dz / d) * GIANT_TUNING.boltSpeed,
    );
    this.system.audio.frostGiantThrow?.();
  }

  update(dt, player) {
    if (this.state === 'dead') { this._updateChest(dt, player); return; }
    if (this.state === 'dying') {
      this.stateT += dt;
      this.group.scale.setScalar(Math.max(0, 1 - this.stateT / 1.2));
      this.pos.y -= dt * 0.3;
      if (this.stateT >= 1.2) {
        this.state = 'dead';
        this.group.visible = false;
        this.chest.group.visible = true;
      }
      this._updateChest(dt, player);
      return;
    }
    if (this.state === 'sleeping') return;
    if (this.state === 'waking') {
      this.stateT += dt;
      const f = clamp01(this.stateT / 1.4);
      this.group.scale.setScalar(0.6 + f * 0.4);
      if (this.stateT >= 1.4) {
        this.alive = true;
        this.state = 'patrol';
        this.stateT = 0;
        this.attackCd = rand(1.0, 2.0);
        this.system.audio.frostGiantRoar?.();
      }
      this._updateChest(dt, player);
      return;
    }

    const dx0 = player.pos.x - this.pos.x, dz0 = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx0, dz0);
    switch (this.state) {
      case 'patrol': {
        const t = this.system.time;
        const lx = this.homeX + Math.sin(t * 0.2 + this.phaseA) * GIANT_TUNING.patrolRadius;
        const lz = this.homeZ + Math.cos(t * 0.17 + this.phaseA) * GIANT_TUNING.patrolRadius;
        this._steerXZ(lx, lz, GIANT_TUNING.patrolSpeed, dt);
        break;
      }
      case 'aggro': {
        this.stateT += dt;
        this.attackCd -= dt;
        if (dist > GIANT_TUNING.throwRange) {
          this._steerXZ(player.pos.x, player.pos.z, GIANT_TUNING.chaseSpeed, dt);
        } else if (dist < GIANT_TUNING.minRange) {
          this._steerXZ(this.pos.x - dx0, this.pos.z - dz0, GIANT_TUNING.chaseSpeed * 0.7, dt);
        } else {
          this.vel.set(0, 0, 0);
        }
        if (this.attackCd <= 0 && dist <= GIANT_TUNING.throwRange) {
          this.state = 'telegraph';
          this.stateT = 0;
        }
        if (dist > GIANT_TUNING.leaveAggroRange) {
          this.state = 'patrol';
          this.stateT = 0;
        }
        break;
      }
      case 'telegraph': {
        this.stateT += dt;
        const f = clamp01(this.stateT / GIANT_TUNING.telegraphDur);
        this.throwArm.rotation.x = -f * 2.0;
        this.mist.material.opacity = f * 0.85;
        this.mist.scale.setScalar(0.5 + f * 0.4);
        if (this.stateT >= GIANT_TUNING.telegraphDur) {
          this._throwIce(player);
          this.mist.material.opacity = 0;
          this.state = 'aggro';
          this.stateT = 0;
          this.attackCd = rand(GIANT_TUNING.attackCdMin, GIANT_TUNING.attackCdMax);
        }
        break;
      }
      case 'stagger': {
        this.stateT += dt;
        this.throwArm.rotation.x *= Math.max(0, 1 - dt * 3);
        this.mist.material.opacity = 0;
        if (this.stateT >= GIANT_TUNING.staggerDur) {
          this.state = 'aggro';
          this.stateT = 0;
        }
        break;
      }
    }

    // Aggro-Trigger (nur außerhalb der bereits behandelten Zustände relevant)
    if (this.state === 'patrol' && dist < GIANT_TUNING.throwRange * 1.6) {
      this.state = 'aggro';
      this.stateT = 0;
      this.system.audio.frostGiantRoar?.();
    }

    this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > 0.2) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      this.group.rotation.y = angleLerp(this.group.rotation.y, targetYaw, Math.min(1, dt * 4));
    }
    this.gaitT += dt * (hSpeed > 0.15 ? 2.2 + hSpeed * 0.6 : 0.3);
    const legAmp = hSpeed > 0.15 ? 0.36 : 0.03;
    for (const leg of this.legs) leg.hip.rotation.x = Math.sin(this.gaitT + leg.phase) * legAmp;

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
        this.system.fx.burst(chest.group.position, 0x9fe0ff, 26, 4, { gravity: -1, life: 1.0 });
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
        this.system.onGiantChest?.();
      }
    }
  }
}

// ---------- Gefrorener See, Höhlentor+Runen, Eisaltar ----------
function buildDecor(root, glowTex) {
  const batch = new GeoBatch();
  const ICE_ROCK = 0x8fb8cc, ICE_ROCK_LIGHT = 0xb8dcec;

  const rng = (() => { let s = 4242; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

  // Basaltartige Eiszacken verstreut (Muster Aschenklamm-Säulen, hier Eis-
  // Formationen statt Basalt) — ein paar rahmen das Höhlentor.
  const spots = [
    { x: LAKE_F.x - 10, z: LAKE_F.z + 5 }, { x: LAKE_F.x + 9, z: LAKE_F.z - 7 },
    { x: GATE.x - 4, z: GATE.z + 1 }, { x: GATE.x + 4, z: GATE.z + 1 },
    { x: LAIR.x + 8, z: LAIR.z - 3 }, { x: LAIR.x - 9, z: LAIR.z + 4 },
    { x: C.x - 8, z: C.z - 2 }, { x: C.x + 14, z: C.z + 10 },
  ];
  for (const spot of spots) {
    const h = 2.5 + rng() * 4;
    const r = 0.45 + rng() * 0.3;
    const y = terrainHeight(spot.x, spot.z);
    const col = new THREE.ConeGeometry(r, h, 6);
    col.translate(spot.x, y + h / 2, spot.z);
    batch.addRaw(col, rng() > 0.5 ? ICE_ROCK : ICE_ROCK_LIGHT);
    if (r > 0.6) addCircleBlocker(spot.x, spot.z, r * 0.75, y - 1, y + h);
  }

  // Höhlentor-Geröll (Eisblöcke statt Basaltbrocken)
  const gateY = terrainHeight(GATE.x, GATE.z);
  const gateGroup = new THREE.Group();
  gateGroup.position.set(GATE.x, gateY, GATE.z);
  for (let i = 0; i < 6; i++) {
    const s = 0.45 + rng() * 0.55;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 0),
      new THREE.MeshLambertMaterial({ color: rng() > 0.5 ? ICE_ROCK : ICE_ROCK_LIGHT, flatShading: true, transparent: true, opacity: 0.92 }),
    );
    rock.position.set((rng() - 0.5) * 3.4, s * 0.5, (rng() - 0.5) * 1.6);
    rock.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    rock.castShadow = true;
    gateGroup.add(rock);
  }
  root.add(gateGroup);
  const gateBlocker = addBoxBlocker(GATE.x - 5, GATE.x + 5, gateY - 1, gateY + 3, GATE.z - 1.6, GATE.z + 1.6);
  const gateBaseY = gateGroup.position.y;

  // 3 Eisrunen: Sockel + erlöschende/glühende Rune (Sprite), Muster wie
  // die Feuerrunen in aschenklamm.js — hier akzeptiert der Spruch 'eisblitz'.
  const runeBraziers = [];
  for (const spot of RUNES) {
    const y = terrainHeight(spot.x, spot.z);
    batch.addRaw(new THREE.CylinderGeometry(0.28, 0.34, 0.7, 8).translate(spot.x, y + 0.35, spot.z), ICE_ROCK);
    const runeMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x9fe0ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const rune = new THREE.Sprite(runeMat);
    rune.position.set(spot.x, y + 0.85, spot.z);
    rune.scale.set(1.4, 1.9, 1);
    root.add(rune);
    const light = new THREE.PointLight(0x9fe0ff, 0, 7, 2);
    light.position.copy(rune.position);
    root.add(light);
    runeBraziers.push({ x: spot.x, y: y + 0.7, z: spot.z, rune, light, lit: false });
  }

  // Eisaltar: eigenständiger Fundort für Eisblitz, VOR dem Tor (kein
  // Zirkelschluss — mit E4-Mitteln allein erreichbar).
  const altarY = terrainHeight(ALTAR.x, ALTAR.z);
  batch.addRaw(new THREE.CylinderGeometry(0.55, 0.65, 1.1, 8).translate(ALTAR.x, altarY + 0.55, ALTAR.z), ICE_ROCK_LIGHT);
  const altarCrystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.4, 0),
    new THREE.MeshLambertMaterial({ color: 0xcdf0ff, flatShading: true, transparent: true, opacity: 0.9 }),
  );
  altarCrystal.position.set(ALTAR.x, altarY + 1.4, ALTAR.z);
  root.add(altarCrystal);
  const altarGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9fe0ff, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const altarGlow = new THREE.Sprite(altarGlowMat);
  altarGlow.scale.setScalar(1.3);
  altarGlow.position.copy(altarCrystal.position);
  root.add(altarGlow);
  const altarLight = new THREE.PointLight(0x9fe0ff, 4, 8, 2);
  altarLight.position.copy(altarCrystal.position);
  root.add(altarLight);

  const decorMesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { castShadow: true, receiveShadow: true });
  if (decorMesh) root.add(decorMesh);

  // Gefrorener See: Deko-Scheibe, fest begehbar (KEIN Sperr-Ring — anders
  // als der Lavasee in Aschenklamm, siehe Kopf-Kommentar).
  const lakeY = terrainHeight(LAKE_F.x, LAKE_F.z) + 0.04;
  const lakeGeo = new THREE.CircleGeometry(LAKE_F.r, 24);
  lakeGeo.rotateX(-Math.PI / 2);
  const col = new THREE.Color();
  const colors = new Float32Array(lakeGeo.attributes.position.count * 3);
  const posAttr = lakeGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const d = Math.hypot(posAttr.getX(i), posAttr.getZ(i)) / LAKE_F.r;
    col.setRGB(0.75, 0.9, 1.0).lerp(new THREE.Color(0xbfe0f0), d * 0.6);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  lakeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lakeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.85 });
  const lakeMesh = new THREE.Mesh(lakeGeo, lakeMat);
  lakeMesh.position.set(LAKE_F.x, lakeY, LAKE_F.z);
  lakeMesh.receiveShadow = true;
  root.add(lakeMesh);

  return { gateGroup, gateBlocker, gateBaseY, runeBraziers, altarCrystal, altarGlow, altarLight };
}

// ---------- Haupt-Einstieg (regions.js ruft dies EINMALIG beim ersten
// Wecken auf — root ist bereits an die Szene gehängt). ----------
export function buildFrostzinnen(root, deps) {
  const { glowTex, hud, audio, fx, health, interact, spells, frostzinnen, siegel, heim, onChange } = deps;

  const system = {
    scene: root, glowTex, fx, audio, hud, time: 0, peaceful: false,
    bolts: [], iceThrowImmune: false,
    onGiantChest: null,
  };

  const decor = buildDecor(root, glowTex);
  const parts = buildGiantParts(glowTex);
  const giant = new Rimefell(system, parts);

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
    hud.showToast('🧊 Das Eis birst — der Weg zur Höhle ist frei!', 3);
  }

  decor.runeBraziers.forEach((r, i) => {
    spells.registerTarget({
      kind: 'frostzinnen-rune', radius: 0.9, accepts: ['eisblitz'],
      getPos: () => ({ x: r.x, y: r.y, z: r.z }),
      onSpell: () => igniteRune(i),
    });
  });

  interact.register({
    x: ALTAR.x, z: ALTAR.z, r: 2.0,
    get enabled() { return !frostzinnen.eisblitzLearned; },
    prompt: 'E — Den Eisaltar berühren',
    onInteract: () => {
      frostzinnen.eisblitzLearned = 1;
      decor.altarGlow.material.opacity = 0;
      decor.altarLight.intensity = 0;
      spells.unlockEisblitz(true);
      onChange?.();
    },
  });

  system.spawnBolt = (x, y, z, vx, vy, vz) => {
    const b = { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), life: 3.5, dmg: GIANT_TUNING.boltDmg };
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x9fe0ff, transparent: true, opacity: 0.95,
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
        if (!system.iceThrowImmune && !system.peaceful && !player.invisible) {
          const d = Math.hypot(dx, dz) || 1;
          health.damage(b.dmg, { x: dx / d, y: 0.2, z: dz / d });
        }
        fx.burst(b.pos, 0x9fe0ff, 12, 2.5, { gravity: -1, life: 0.4 });
      }
      if (hit || b.life <= 0) {
        root.remove(b.mesh);
        system.bolts.splice(i, 1);
      } else {
        b.mesh.position.copy(b.pos);
      }
    }
  }

  system.onGiantChest = () => {
    // +1 relativ (nicht fest "8") — siehe aschenklamm.js: Dragon/Rimefell
    // sind gleichrangige Bosse, beliebige Reihenfolge muss beide Boni geben.
    health.upgradeMaxHearts(health.maxHearts + 1);
    hud.setHearts(health.hearts, health.effectiveMaxHearts);
    heim.zutaten.frostkristall += 3;
    frostzinnen.giantDefeated = 1;
    frostzinnen.chestCollected = 1;
    siegel.frost = 1;
    hud.showToast('❤️ Herz-Upgrade! · 🧊 3× Frostkristall · Titel „Frostbezwinger" errungen!', 5);
    onChange?.();
  };

  function applySavedState() {
    for (const r of decor.runeBraziers) { r.lit = false; r.rune.material.opacity = 0; r.light.intensity = 0; }
    gateOpened = false;
    decor.gateBlocker.disabled = false;
    decor.gateGroup.position.y = decor.gateBaseY;

    if (frostzinnen.eisblitzLearned) {
      decor.altarGlow.material.opacity = 0;
      decor.altarLight.intensity = 0;
      spells.unlockEisblitz(false);
    }

    if (frostzinnen.giantDefeated) {
      gateOpened = true;
      decor.gateBlocker.disabled = true;
      decor.gateGroup.position.y = decor.gateBaseY - 2.6;
      giant.alive = false;
      giant.state = 'dead';
      giant.hp = 0;
      giant.group.visible = false;
      giant.chest.group.visible = true;
      giant.chest.opened = frostzinnen.chestCollected === 1;
      giant.chest.collected = frostzinnen.chestCollected === 1;
      giant.chest.openT = -1;
      giant.chest.lidPivot.rotation.x = frostzinnen.chestCollected ? -1.9 : 0;
      giant.chest.glow.material.opacity = 0;
      if (frostzinnen.chestCollected) giant.chest.group.visible = false;
    } else {
      giant.group.visible = true;
      giant.alive = false;
      giant.state = 'sleeping';
      giant.stateT = 0;
      giant.hp = GIANT_TUNING.hp;
      giant.pos.set(LAIR.x, terrainHeight(LAIR.x, LAIR.z), LAIR.z);
      giant.group.scale.setScalar(1);
      giant.chest.group.visible = false;
      giant.chest.opened = false;
      giant.chest.collected = false;
      giant.chest.openT = -1;
    }
  }
  applySavedState();

  let altarT = 0;

  return {
    giant,
    get iceThrowImmune() { return system.iceThrowImmune; },
    set iceThrowImmune(v) { system.iceThrowImmune = v; },

    update(dt, player) {
      system.time += dt;
      altarT += dt;
      if (!frostzinnen.eisblitzLearned) {
        decor.altarLight.intensity = 4 + Math.sin(altarT * 1.6) * 1;
        decor.altarGlow.material.opacity = 0.55 + Math.sin(altarT * 1.6) * 0.15;
        decor.altarCrystal.rotation.y += dt * 0.5;
      }
      for (const r of decor.runeBraziers) {
        if (!r.lit) continue;
        const flick = 0.85 + Math.sin(system.time * 9 + r.x) * 0.15;
        r.light.intensity = 9 * flick;
      }
      if (gateOpened && decor.gateGroup.position.y > decor.gateBaseY - 2.6) {
        decor.gateGroup.position.y -= dt * 1.4;
      }
      // Ei-Diebstahl-Analogon entfällt hier — Rimefell erwacht stattdessen,
      // sobald der Spieler das Höhlentor durchquert (Annäherung an sein Lager).
      if (giant.state === 'sleeping' && gateOpened) {
        const d = Math.hypot(player.pos.x - LAIR.x, player.pos.z - LAIR.z);
        if (d < 22) giant.wake();
      }
      giant.update(dt, player);
      updateBolts(dt, player);
    },

    restore() { applySavedState(); },
  };
}
