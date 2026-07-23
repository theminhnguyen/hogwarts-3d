// Schwarzwasser (E7, PLAN-EPISCHE-WELT.md Abschnitt 6.5): vierte und letzte
// neue Region, bewusst "kompakter" als die anderen drei (Plan-Vorgabe).
// Zweiter, dunkler See im Westen mit einer versunkenen Ruine (Tauch-
// Mechanismus-Rätsel: 3 Hebel öffnen einen Tresor), Grindeloh-Wassergeister
// (echte, schwache Kreaturen — sterben an Sprüchen wie überall sonst) und
// dem Schwarzen Schlund: bewusst NUR Kopf/Tentakel (kein Vollmodell, kein
// hp-Modell) — eine unbesiegbare, nur ausweichbare Umwelt-Gefahr im Willow-
// Telegraph/Swing-Muster, kein klassischer Bosskampf. Leuchtturm + Wärter
// Alaric am Ufer, Quest an den gelösten Tresor gekoppelt (Muster: Selas
// Quest in silberhain.js — ein Gespräch NACH der Leistung reicht).
import * as THREE from 'three';
import { GeoBatch } from './geo.js';
import { terrainHeight, SCHWARZWASSER, buildWater } from './terrain.js';
import { buildFigure, animateFigure } from './npc.js';

const C = { x: SCHWARZWASSER.x, z: SCHWARZWASSER.z };
const LIGHTHOUSE = { x: C.x - 40, z: C.z - 40 };
const KEEPER_POS = { x: C.x - 33, z: C.z - 35 };
const CHEST_POS = { x: C.x, y: -3.6, z: C.z };
const LEVERS = [
  { x: C.x - 10, y: -2.2, z: C.z + 6 },
  { x: C.x + 8, y: -3.2, z: C.z - 4 },
  { x: C.x - 2, y: -4.3, z: C.z + 10 },
];
const GRINDYLOW_SPOTS = [
  { x: C.x + 12, y: -1.8, z: C.z + 8 },
  { x: C.x - 14, y: -2.6, z: C.z - 6 },
  { x: C.x + 4, y: -3.4, z: C.z - 14 },
];

const GRINDYLOW_TUNING = {
  hp: 2, wanderR: 8, aggroRange: 6, speed: 2.2, chaseSpeed: 3.6, dmg: 0.5, cd: 1.2,
};
const SCHLUND_TUNING = {
  triggerRange: 22, telegraphDur: 1.3, lungeDur: 0.45, retreatDur: 1.2,
  cooldownMin: 16, cooldownMax: 28, dmg: 1, hitRange: 6,
};

function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
function rand(min, max) { return min + Math.random() * (max - min); }

// ---------- Leuchtturm: Turm + Laterne (Leuchtfeuer erst nach der Quest an) ----------
function buildLighthouse(root) {
  const y = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xa8a09a, flatShading: true });
  const stripeMat = new THREE.MeshLambertMaterial({ color: 0xc23a3a, flatShading: true });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3a42, flatShading: true });
  const group = new THREE.Group();
  group.position.set(LIGHTHOUSE.x, y, LIGHTHOUSE.z);
  root.add(group);

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 11, 10), stoneMat);
  tower.position.y = 5.5;
  tower.castShadow = true;
  group.add(tower);
  for (let i = 0; i < 3; i++) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.8, 1.1, 10), stripeMat);
    stripe.position.y = 2.5 + i * 3.2;
    group.add(stripe);
  }
  const lanternRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 1.6, 10), stoneMat);
  lanternRoom.position.y = 11.8;
  group.add(lanternRoom);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.6, 10), roofMat);
  roof.position.y = 13.4;
  group.add(roof);

  const beaconMat = new THREE.SpriteMaterial({
    color: 0xfff2c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beacon = new THREE.Sprite(beaconMat);
  beacon.scale.setScalar(1.6);
  beacon.position.set(0, 11.8, 0);
  group.add(beacon);
  const beaconLight = new THREE.PointLight(0xfff2c0, 0, 60, 2);
  beaconLight.position.set(0, 11.8, 0);
  group.add(beaconLight);

  return { group, beacon, beaconLight };
}

// ---------- Versunkene Ruine: gebrochene Säulen/Torbögen, tief genug für
// den Tauch-Rätsel-Anspruch, aber nicht so tief, dass airRemaining knapp wird. ----------
function buildRuin(root) {
  const batch = new GeoBatch();
  const STONE = 0x5a6862, STONE_DARK = 0x424e49;
  const spots = [
    { x: C.x - 6, z: C.z + 3, h: 3.2, r: 0.6 },
    { x: C.x + 5, z: C.z - 3, h: 2.6, r: 0.55 },
    { x: C.x - 2, z: C.z - 6, h: 3.6, r: 0.65 },
    { x: C.x + 7, z: C.z + 7, h: 2.2, r: 0.5 },
  ];
  for (const s of spots) {
    const col = new THREE.CylinderGeometry(s.r, s.r * 1.15, s.h, 7);
    col.translate(s.x, -5.5 + s.h / 2, s.z);
    batch.addRaw(col, Math.random() > 0.5 ? STONE : STONE_DARK);
  }
  // Zwei liegende Torbogen-Reste (halbe Torusse) als Bodenstruktur zwischen den Säulen.
  for (const [ax, az, rot] of [[C.x, C.z, 0], [C.x + 2, C.z + 4, 0.6]]) {
    const arch = new THREE.TorusGeometry(2.6, 0.32, 6, 10, Math.PI);
    arch.rotateX(Math.PI / 2);
    arch.rotateZ(rot);
    arch.translate(ax, -5.2, az);
    batch.addRaw(arch, STONE_DARK);
  }
  const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { castShadow: false, receiveShadow: false });
  if (mesh) root.add(mesh);
}

// ---------- 3 Hebel (Muster: Runen-Sockel aus frostzinnen.js, hier ohne
// Feuer/Eis-Glow — ein einfacher Metallhebel mit Glimmer-Sprite). ----------
function buildLevers(root, glowTex) {
  const batch = new GeoBatch();
  const levers = [];
  for (const spot of LEVERS) {
    batch.addRaw(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 7).translate(spot.x, spot.y - 0.3, spot.z), 0x3a3832);
    const armPivot = new THREE.Group();
    armPivot.position.set(spot.x, spot.y, spot.z);
    root.add(armPivot);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6), new THREE.MeshLambertMaterial({ color: 0x8a7a5a, flatShading: true }));
    arm.position.y = 0.35;
    arm.rotation.z = 0.9;
    armPivot.add(arm);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x6ad8c8, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(0.5);
    glow.position.set(spot.x, spot.y + 0.2, spot.z);
    root.add(glow);
    const light = new THREE.PointLight(0x6ad8c8, 0, 4, 2);
    light.position.copy(glow.position);
    root.add(light);
    levers.push({ x: spot.x, y: spot.y, z: spot.z, armPivot, glow, light, lit: false });
  }
  const mesh = batch.build(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { castShadow: false, receiveShadow: false });
  if (mesh) root.add(mesh);
  return levers;
}

// ---------- Tresor (Muster aschenklamm.js/frostzinnen.js buildChest, hier
// nassgrün-messing statt Holz/Birke). ----------
function buildChest(pos) {
  const group = new THREE.Group();
  group.position.set(pos.x, pos.y, pos.z);
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a4a42, flatShading: true });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x8a9a6a, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.55), bodyMat);
  body.position.y = 0.25;
  group.add(body);
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, 0.5, -0.275);
  group.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.55), trimMat);
  lid.position.set(0, 0.14, 0.275);
  lidPivot.add(lid);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    color: 0x8ad8c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.position.set(0, 0.6, 0);
  glow.scale.setScalar(0.1);
  group.add(glow);
  group.visible = false;
  return { group, lidPivot, glow, opened: false, openT: -1, collected: false };
}

// ---------- Grindeloh: kleiner, schwacher Wassergeist (Muster: normale
// Kreatur mit hp/applyHit, kein Umwelt-Gefahr-FSM wie der Schlund). ----------
function buildGrindylowModel() {
  const skinMat = new THREE.MeshLambertMaterial({ color: 0x2e5a48, flatShading: true, transparent: true, opacity: 0.92 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xbfffe0 });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 5), skinMat);
  body.scale.set(1, 1.1, 1);
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), skinMat);
  head.position.y = 0.38;
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), eyeMat);
    eye.position.set(s * 0.09, 0.42, 0.16);
    group.add(eye);
  }
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 4), skinMat);
    fin.rotation.z = s * 1.1;
    fin.position.set(s * 0.32, 0.05, 0);
    group.add(fin);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), skinMat);
  tail.rotation.x = Math.PI / 2.4;
  tail.position.set(0, -0.05, -0.32);
  group.add(tail);
  return group;
}

class Grindylow {
  constructor(system, spot) {
    this.system = system;
    this.species = 'grindylow';
    this.hp = GRINDYLOW_TUNING.hp;
    this.maxHp = GRINDYLOW_TUNING.hp;
    this.alive = true;
    this.radius = 0.6;
    this.hitY = 0;
    this.state = 'wander';
    this.stateT = rand(0, 3);
    this.cd = 0;
    this.home = { x: spot.x, y: spot.y, z: spot.z };
    this.target = { x: spot.x, z: spot.z };
    this.group = buildGrindylowModel();
    this.pos = this.group.position;
    this.pos.set(spot.x, spot.y, spot.z);
    system.scene.add(this.group);
  }

  applyHit(spellId, _v, dmgMul = 1) {
    if (!this.alive) return;
    const dmg = spellId === 'avada' ? 4
      : spellId === 'crucio' ? 0.25
      : spellId === 'claw' ? 0.5
      : (spellId === 'stupor' || spellId === 'kick' || spellId === 'bite') ? 1 : 0;
    if (dmg <= 0) return;
    this.hp -= dmg * dmgMul;
    this.system.audio.grindylowHiss?.();
    this.system.fx.burst(this.pos, 0x6ad8b0, 8, 2.5, { gravity: 0, life: 0.4 });
    if (this.hp <= 0) {
      this.alive = false;
      this.state = 'dead';
      this.group.visible = false;
    }
  }

  update(dt, player) {
    if (!this.alive) return;
    this.cd -= dt;
    const dx = player.pos.x - this.pos.x, dy = player.pos.y - this.pos.y, dz = player.pos.z - this.pos.z;
    const dist3D = Math.hypot(dx, dy, dz);
    const submerged = player.swimming || player.diving;
    if (this.state === 'wander') {
      this.stateT -= dt;
      if (this.stateT <= 0) {
        this.stateT = rand(3, 6);
        const a = Math.random() * Math.PI * 2, r = Math.random() * GRINDYLOW_TUNING.wanderR;
        this.target.x = this.home.x + Math.cos(a) * r;
        this.target.z = this.home.z + Math.sin(a) * r;
      }
      if (submerged && dist3D < GRINDYLOW_TUNING.aggroRange && !player.invisible) {
        this.state = 'aggro';
        this.system.audio.grindylowHiss?.();
      }
    } else if (this.state === 'aggro') {
      this.target.x = player.pos.x;
      this.target.z = player.pos.z;
      if (!submerged || dist3D > GRINDYLOW_TUNING.aggroRange * 1.8) {
        this.state = 'wander';
        this.stateT = rand(2, 4);
      }
      if (dist3D < 1.3 && this.cd <= 0 && !this.system.peaceful && !this.system.grindylowImmune && !player.invisible) {
        const d = dist3D || 1;
        this.system.health.damage(GRINDYLOW_TUNING.dmg, { x: dx / d, y: 0.15, z: dz / d });
        this.system.fx.shake(0.12);
        this.cd = GRINDYLOW_TUNING.cd;
      }
    }
    const speed = this.state === 'aggro' ? GRINDYLOW_TUNING.chaseSpeed : GRINDYLOW_TUNING.speed;
    const tdx = this.target.x - this.pos.x, tdz = this.target.z - this.pos.z;
    const td = Math.hypot(tdx, tdz);
    if (td > 0.3) {
      this.pos.x += (tdx / td) * speed * dt;
      this.pos.z += (tdz / td) * speed * dt;
      this.group.rotation.y = Math.atan2(tdx, tdz);
    }
    this.pos.y = this.home.y + Math.sin(this.system.time * 1.3 + this.home.x) * 0.35;
  }
}

// ---------- Der Schwarze Schlund: nur Kopf/Tentakel, unbesiegbar — reines
// Willow-Telegraph/Swing-Muster (Lehre 5: Rückschwung läuft in JEDEM
// Zustand weiter, kein früher Return). Kein hp, keine spells-Zielliste. ----------
function buildSchlundModel() {
  const skinMat = new THREE.MeshLambertMaterial({ color: 0x1c1e22, flatShading: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd83a3a });
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), skinMat);
  head.scale.set(1, 0.75, 1.1);
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), eyeMat);
    eye.position.set(s * 0.4, 0.25, 0.85);
    group.add(eye);
  }
  const tentacles = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const tent = new THREE.Mesh(new THREE.ConeGeometry(0.25, 2.2, 6), skinMat);
    tent.position.set(Math.cos(a) * 1.3, -0.6, Math.sin(a) * 1.3 + 0.4);
    tent.rotation.set(0.6, a, 0);
    group.add(tent);
    tentacles.push(tent);
  }
  return { group, tentacles };
}

class Schlund {
  constructor(system) {
    this.system = system;
    this.state = 'hidden'; // hidden|telegraph|lunge|retreat
    this.stateT = 0;
    this.cooldown = rand(SCHLUND_TUNING.cooldownMin, SCHLUND_TUNING.cooldownMax);
    this.hitApplied = false;
    const parts = buildSchlundModel();
    this.group = parts.group;
    this.tentacles = parts.tentacles;
    this.pos = this.group.position;
    this.pos.set(C.x, -3, C.z);
    this.group.visible = false;
    system.scene.add(this.group);
  }

  update(dt, player) {
    const dx = player.pos.x - C.x, dz = player.pos.z - C.z;
    const dist = Math.hypot(dx, dz);
    const submerged = player.swimming || player.diving;
    switch (this.state) {
      case 'hidden': {
        this.cooldown -= dt;
        if (this.cooldown <= 0 && submerged && dist < SCHLUND_TUNING.triggerRange) {
          this.state = 'telegraph';
          this.stateT = 0;
          const a = Math.random() * Math.PI * 2, r = rand(3, 8);
          this.pos.set(player.pos.x + Math.cos(a) * r, -1.6, player.pos.z + Math.sin(a) * r);
          this.group.rotation.y = Math.random() * Math.PI * 2;
          this.group.visible = true;
          this.system.audio.schlundRoar?.();
        }
        break;
      }
      case 'telegraph': {
        this.stateT += dt;
        const f = clamp01(this.stateT / SCHLUND_TUNING.telegraphDur);
        this.pos.y = -1.6 + f * 1.9;
        for (const t of this.tentacles) t.rotation.x = 0.6 - f * 0.9;
        if (this.stateT >= SCHLUND_TUNING.telegraphDur) {
          this.state = 'lunge';
          this.stateT = 0;
          this.hitApplied = false;
        }
        break;
      }
      case 'lunge': {
        this.stateT += dt;
        const dpx = player.pos.x - this.pos.x, dpz = player.pos.z - this.pos.z;
        const d = Math.hypot(dpx, dpz);
        if (!this.hitApplied && d < SCHLUND_TUNING.hitRange) {
          if (!this.system.peaceful && !player.invisible) {
            const dd = d || 1;
            this.system.health.damage(SCHLUND_TUNING.dmg, { x: dpx / dd, y: 0.3, z: dpz / dd });
            this.system.fx.shake(0.4);
          }
          this.system.audio.schlundSplash?.();
          this.hitApplied = true;
        }
        if (this.stateT >= SCHLUND_TUNING.lungeDur) {
          this.state = 'retreat';
          this.stateT = 0;
        }
        break;
      }
      case 'retreat': {
        // Lehre 5 (FSM-Sackgassen-Falle): läuft immer weiter, kein früher Return.
        this.stateT += dt;
        const fr = clamp01(this.stateT / SCHLUND_TUNING.retreatDur);
        this.pos.y = 0.3 - fr * 1.9;
        for (const t of this.tentacles) t.rotation.x = -0.3 + fr * 0.9;
        if (this.stateT >= SCHLUND_TUNING.retreatDur) {
          this.state = 'hidden';
          this.group.visible = false;
          this.cooldown = rand(SCHLUND_TUNING.cooldownMin, SCHLUND_TUNING.cooldownMax);
          this.system.audio.schlundSplash?.();
        }
        break;
      }
    }
  }
}

export function buildSchwarzwasser(root, deps) {
  const { glowTex, hud, audio, fx, health, interact, economy, heim, schwarzwasser, siegel, onChange } = deps;

  // deps.peaceful ist ein Getter (main.js) — hier einmalig beim ersten
  // Wecken gelesen, liefert dadurch immer den WIRKLICH aktuellen Zahm/Wild-
  // Stand (nicht den vom Weltaufbau, falls zwischenzeitlich umgeschaltet).
  const system = { scene: root, audio, fx, health, time: 0, peaceful: !!deps.peaceful, grindylowImmune: false };

  const water = buildWater(SCHWARZWASSER, { deep: 0x0a1418, shallow: 0x162a2e });
  root.add(water.mesh);
  buildRuin(root);
  const lighthouse = buildLighthouse(root);
  const levers = buildLevers(root, glowTex);
  const chest = buildChest(CHEST_POS);
  root.add(chest.group);

  const grindylows = GRINDYLOW_SPOTS.map((spot) => new Grindylow(system, spot));
  const schlund = new Schlund(system);

  const keeper = buildFigure(0x2a4a6a, 0x5a4a38, 0x3a4a56, 0x2a3a48);
  for (const m of keeper.mats) m.opacity = 1;
  keeper.group.position.set(KEEPER_POS.x, terrainHeight(KEEPER_POS.x, KEEPER_POS.z), KEEPER_POS.z);
  keeper.group.rotation.y = Math.atan2(-(C.x - KEEPER_POS.x), -(C.z - KEEPER_POS.z));
  root.add(keeper.group);

  function litCount() { return levers.filter(l => l.lit).length; }

  function activateLever(i) {
    const l = levers[i];
    if (!l || l.lit) return;
    l.lit = true;
    l.armPivot.rotation.z = -0.9;
    l.glow.material.opacity = 0.9;
    l.light.intensity = 5;
    audio.puzzleClonk?.();
    if (litCount() === levers.length) openVault();
  }

  function openVault() {
    chest.group.visible = true;
    audio.puzzleRumble?.(1.4);
    hud.showToast('🔱 Die Mechanik rastet ein — ein Tresor öffnet sich in der Ruine!', 4);
  }

  levers.forEach((l, i) => interact.register({
    x: l.x, z: l.z, r: 1.6,
    get enabled() { return !l.lit; },
    prompt: 'E — Hebel umlegen',
    onInteract: () => activateLever(i),
  }));

  interact.register({
    x: KEEPER_POS.x, z: KEEPER_POS.z, r: 2.4, prompt: 'E — Mit Alaric sprechen',
    onInteract: () => {
      if (schwarzwasser.puzzleSolved && !schwarzwasser.keeperQuestDone) {
        hud.showDialog('Alaric', [
          'Alaric starrt auf die ruhige Wasseroberfläche — zum ersten Mal seit Jahren.',
          '„Die Tiefe schweigt … du hast es geschafft." Er zündet mit zitternden Händen das Leuchtfeuer an.',
        ], () => {
          schwarzwasser.keeperQuestDone = 1;
          lighthouse.beaconLight.intensity = 14;
          lighthouse.beacon.material.opacity = 0.85;
          economy.addRuf(3);
          hud.showToast('🗼 Das Leuchtfeuer brennt wieder! +3 Ruf', 3);
          onChange?.();
        });
        return;
      }
      if (schwarzwasser.keeperQuestDone) {
        hud.showDialog('Alaric', ['„Solange das Feuer brennt, fürchte ich die Tiefe nicht mehr. Danke, Fremder."']);
        return;
      }
      hud.showDialog('Alaric', [
        'Alaric, der Leuchtturmwärter, deutet auf eine versunkene Ruine im Schwarzwasser.',
        '„Dort unten liegt ein altes Mechanismus-Werk — und etwas Großes wacht darüber."',
        '„Löse die Hebel, wenn du dich traust. Dann kann ich das Feuer wieder anzünden."',
      ]);
    },
  });

  function updateChest(dt, player) {
    if (!chest.group.visible || chest.collected) return;
    if (!chest.opened) {
      const dx = player.pos.x - chest.group.position.x, dz = player.pos.z - chest.group.position.z;
      if (dx * dx + dz * dz < 2.5 * 2.5) {
        chest.opened = true;
        chest.openT = 0;
        audio.chime?.('fanfare');
        fx.burst(chest.group.position, 0x8ad8c8, 26, 4, { gravity: -1, life: 1.0 });
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
        // +1 relativ (nicht fest), siehe aschenklamm.js/frostzinnen.js: alle
        // Boss-/Risiko-Regionen sind gleichrangig, beliebige Reihenfolge
        // muss jeweils ihren eigenen Bonus geben.
        health.upgradeMaxHearts(health.maxHearts + 1);
        hud.setHearts(health.hearts, health.effectiveMaxHearts);
        heim.zutaten.tiefenperle += 3;
        schwarzwasser.puzzleSolved = 1;
        schwarzwasser.chestCollected = 1;
        siegel.tiefe = 1;
        hud.showToast('❤️ Herz-Upgrade! · 🔱 3× Tiefenperle · Titel „Tiefenbezwinger" errungen!', 5);
        onChange?.();
      }
    }
  }

  function applySavedState() {
    for (const l of levers) { l.lit = false; l.armPivot.rotation.z = 0; l.glow.material.opacity = 0; l.light.intensity = 0; }
    if (schwarzwasser.puzzleSolved) {
      for (const l of levers) { l.lit = true; l.armPivot.rotation.z = -0.9; l.glow.material.opacity = 0.9; l.light.intensity = 5; }
      chest.group.visible = true;
    } else {
      chest.group.visible = false;
    }
    chest.opened = schwarzwasser.chestCollected === 1;
    chest.collected = schwarzwasser.chestCollected === 1;
    chest.openT = -1;
    chest.lidPivot.rotation.x = schwarzwasser.chestCollected ? -1.9 : 0;
    chest.glow.material.opacity = 0;
    if (schwarzwasser.chestCollected) chest.group.visible = false;
    if (schwarzwasser.keeperQuestDone) {
      lighthouse.beaconLight.intensity = 14;
      lighthouse.beacon.material.opacity = 0.85;
    } else {
      lighthouse.beaconLight.intensity = 0;
      lighthouse.beacon.material.opacity = 0;
    }
    for (const g of grindylows) { g.alive = true; g.hp = GRINDYLOW_TUNING.hp; g.group.visible = true; g.state = 'wander'; }
  }
  applySavedState();

  return {
    grindylows,
    get peaceful() { return system.peaceful; },
    set peaceful(v) { system.peaceful = v; },
    set grindylowImmune(v) { system.grindylowImmune = v; },
    get waterUniforms() { return water.uniforms; },

    update(dt, player) {
      system.time += dt;
      updateChest(dt, player);
      schlund.update(dt, player);
      for (const g of grindylows) g.update(dt, player);
      animateFigure(keeper, dt, false);
      if (lighthouse.beaconLight.intensity > 0) {
        lighthouse.beaconLight.intensity = 12 + Math.sin(system.time * 1.4) * 2;
        lighthouse.beacon.material.opacity = 0.7 + Math.sin(system.time * 1.4) * 0.15;
      }
    },

    restore() { applySavedState(); },
  };
}
