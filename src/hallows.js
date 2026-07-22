// Die Heiligtümer des Todes (S10, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt
// 5.10). Freigeschaltet nach Hauspokal UND Seelenlaterne. Drei Endgame-Quests:
// Elderstab (Duell gegen den Bleichen König am Hügelgrab, Mitternacht), Stein
// der Wiederkehr (Tauchen zum Seegrund, K7/K11-Wiederbelebung) — der Umhang
// (Wilderer-Anführer-Diebesquest) lebt dagegen in wilderer.js, weil er
// strukturell "der 4. Wilderer" ist (Muster: companion.js nutzt npc.js'
// Katzen-FSM, statt es zu duplizieren). 3 Podeste in der Kate (home.js-Export)
// schalten die Effekte einzeln an/ab (Selbst-Balancing), Meister des Todes
// (alle 3 besessen+ausgerüstet) bündelt Bonus-Effekte in mount.js/dementor.js.

import * as THREE from 'three';
import { terrainHeight, LAKE, HUEGELGRAB } from './terrain.js';
import { buildGhostParts, Ghost } from './creatures.js';

const KING_ARENA_R = 14;
const KING_HITS_TO_WIN = 10;
const KING_TELEPORT_EVERY = 3;
const KING_CAST_RANGE = 15;
const KING_TELEGRAPH_DUR = 1.1;
const KING_BOLT_SPEED = 7;
const KING_BOLT_DMG = 0.5;
const KING_COOLDOWN_MIN = 1.3, KING_COOLDOWN_MAX = 2.0;
const KING_INVULN_AFTER_TELEPORT = 1.0;
const KING_RISE_DUR = 1.6;
const KING_BOW_DUR = 2.4;
const MIDNIGHT_WINDOW = 0.012; // ±~17min Realzeit um 0/1 (300s-Tageszyklus)

const STONE_POS = { x: LAKE.x, z: LAKE.z }; // tiefster Punkt (dl<r*0.5 → fest -5.5, terrain.js)
const STONE_PICKUP_R = 2;

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Bleicher König: Wilderer-KI-Basis (Telegraph→Bolzen→Cooldown),
// aber Geist-Material fahl-golden + hitCount-Sieg statt hp-Wert (Plan: "10
// Treffer" ist wörtlich eine ZÄHLUNG, nicht ein Schadenswert — sonst würde
// Avada Kedavra den "würdigen Gegner" mit einem Schuss trivialisieren). ----------
class PaleKing {
  constructor(system, ghostParts) {
    this.system = system;
    this.species = 'bleicherkoenig';
    this.alive = false; // erst ab 'aggro' gültiges Spruchziel (siehe applyHit)
    this.radius = 0.7;
    this.hitY = 1.0;
    this.state = 'sealed'; // sealed|rising|aggro|telegraph|cooldown|bowing|gone
    this.stateT = 0;
    this.hitsTaken = 0;
    this.summonedGhosts = false;
    this.invulnT = 0;
    this.attackCd = 0;
    this.vel = new THREE.Vector3();
    this.onDefeated = null;

    const cloakMat = new THREE.MeshLambertMaterial({
      color: 0xcbb26a, transparent: true, opacity: 0.92, flatShading: true, side: THREE.DoubleSide,
    });
    const eyeMat = new THREE.SpriteMaterial({
      map: system.glowTex, color: 0xfff2c0, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glowMat = new THREE.SpriteMaterial({
      map: system.glowTex, color: 0xd4b050, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.cloak = new THREE.Mesh(ghostParts.cloakGeo, cloakMat);
    this.group.add(this.cloak);
    this.group.add(new THREE.Mesh(ghostParts.hoodGeo, cloakMat));
    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(eyeMat);
      eye.scale.setScalar(0.16);
      eye.position.set(s * 0.08, 1.5, 0.32);
      this.group.add(eye);
    }
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(3.2);
    glow.position.y = 0.6;
    this.group.add(glow);
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.035, 6, 10),
      new THREE.MeshLambertMaterial({ color: 0xffe27a, flatShading: true }),
    );
    crown.rotation.x = Math.PI / 2;
    crown.position.set(0, 1.78, 0.02);
    this.group.add(crown);
    this.group.scale.setScalar(1.7);
    this.hoverY = 1.4;
    this.baseY = terrainHeight(HUEGELGRAB.x, HUEGELGRAB.z);
    this.pos.set(HUEGELGRAB.x, this.baseY, HUEGELGRAB.z);
    this.group.visible = false;
    system.scene.add(this.group);

    this.sparkMat = new THREE.SpriteMaterial({
      map: system.glowTex, color: 0xff3030, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.spark = new THREE.Sprite(this.sparkMat);
    this.spark.scale.setScalar(0.01);
    this.spark.position.set(0.2, 0.9, 0.2);
    this.group.add(this.spark);
  }

  rise() {
    this.state = 'rising';
    this.stateT = 0;
    this.hitsTaken = 0;
    this.summonedGhosts = false;
    this.invulnT = 0;
    this.attackCd = 1.2;
    this.pos.set(HUEGELGRAB.x, this.baseY, HUEGELGRAB.z);
    this.group.visible = true;
    this.group.rotation.x = 0;
    this.group.scale.setScalar(1.7);
  }

  _steerXZ(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.vel.x = (dx / d) * speed;
    this.vel.z = (dz / d) * speed;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  applyHit(spellId) {
    if (this.state !== 'aggro' && this.state !== 'telegraph' && this.state !== 'cooldown') return;
    if (this.invulnT > 0) return;
    const validHit = spellId === 'stupor' || spellId === 'incendio' || spellId === 'avada'
      || spellId === 'crucio' || spellId === 'claw' || spellId === 'kick';
    if (!validHit) return;
    this.hitsTaken++;
    this.system.fx.burst(this.pos, 0xe8d8a0, 12, 3, { gravity: -2, life: 0.4 });
    this.system.audio.kingHit?.();
    if (this.hitsTaken >= KING_HITS_TO_WIN) {
      this.state = 'bowing';
      this.stateT = 0;
      this.vel.set(0, 0, 0);
      this.system.audio.kingBow?.();
      return;
    }
    if (this.hitsTaken % KING_TELEPORT_EVERY === 0) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * (KING_ARENA_R - 6);
      this.pos.x = HUEGELGRAB.x + Math.sin(a) * r;
      this.pos.z = HUEGELGRAB.z + Math.cos(a) * r;
      this.invulnT = KING_INVULN_AFTER_TELEPORT;
      this.state = 'aggro';
      this.stateT = 0;
      this.sparkMat.opacity = 0;
      this.system.fx.burst(this.pos, 0xd4c060, 26, 4, { gravity: -1, life: 0.7 });
      this.system.audio.kingTeleport?.();
      if (this.hitsTaken === KING_TELEPORT_EVERY && !this.summonedGhosts) {
        this.summonedGhosts = true;
        this.system.onSummonGhosts?.(this.pos);
      }
      return;
    }
    if (this.state === 'telegraph') {
      this.sparkMat.opacity = 0;
      this.state = 'aggro';
      this.stateT = 0;
    }
  }

  update(dt, player) {
    if (this.invulnT > 0) this.invulnT -= dt;
    switch (this.state) {
      case 'sealed': case 'gone': return;
      case 'rising': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / KING_RISE_DUR);
        this.pos.y = this.baseY - 1.6 + f * (this.hoverY + 1.6);
        this.group.scale.setScalar(1.7 * f);
        if (this.stateT >= KING_RISE_DUR) {
          this.alive = true;
          this.state = 'aggro';
          this.stateT = 0;
        }
        return;
      }
      case 'bowing': {
        this.stateT += dt;
        this.group.rotation.x = Math.min(0.6, this.stateT * 0.6);
        if (this.stateT >= KING_BOW_DUR) {
          this.state = 'gone';
          this.alive = false;
          this.group.visible = false;
          this.onDefeated?.();
        }
        return;
      }
    }

    const dx0 = player.pos.x - this.pos.x, dz0 = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx0, dz0);
    switch (this.state) {
      case 'aggro': {
        this.stateT += dt;
        this.attackCd -= dt;
        if (dist > KING_CAST_RANGE) {
          this._steerXZ(player.pos.x, player.pos.z, 3.6, dt);
        } else {
          this.vel.set(0, 0, 0);
          this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx0, dz0), Math.min(1, dt * 5));
        }
        if (this.attackCd <= 0 && dist <= KING_CAST_RANGE) { this.state = 'telegraph'; this.stateT = 0; }
        break;
      }
      case 'telegraph': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / KING_TELEGRAPH_DUR);
        this.sparkMat.opacity = f * 0.9;
        this.spark.scale.setScalar(0.05 + f * 0.5);
        this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx0, dz0), Math.min(1, dt * 8));
        if (this.stateT >= KING_TELEGRAPH_DUR) {
          this._fireBolt(player);
          this.sparkMat.opacity = 0;
          this.state = 'cooldown';
          this.stateT = 0;
          this.attackCd = KING_COOLDOWN_MIN + Math.random() * (KING_COOLDOWN_MAX - KING_COOLDOWN_MIN);
        }
        break;
      }
      case 'cooldown': {
        this.stateT += dt;
        if (this.stateT >= 0.3) { this.state = 'aggro'; this.stateT = 0; }
        break;
      }
    }

    const ldx = this.pos.x - HUEGELGRAB.x, ldz = this.pos.z - HUEGELGRAB.z;
    const ld = Math.hypot(ldx, ldz);
    if (ld > KING_ARENA_R) {
      this.pos.x = HUEGELGRAB.x + (ldx / ld) * KING_ARENA_R;
      this.pos.z = HUEGELGRAB.z + (ldz / ld) * KING_ARENA_R;
    }
    this.pos.y = terrainHeight(this.pos.x, this.pos.z) + this.hoverY + Math.sin(this.system.time * 0.7) * 0.2;
    this.cloak.rotation.y += 0.25 * dt;
  }

  _fireBolt(player) {
    const castX = this.pos.x, castY = this.pos.y, castZ = this.pos.z;
    const tx = player.pos.x, ty = player.pos.y + 1.0, tz = player.pos.z;
    const dx = tx - castX, dy = ty - castY, dz = tz - castZ;
    const d = Math.hypot(dx, dy, dz) || 1;
    this.system.spawnBolt(castX, castY, castZ, (dx / d) * KING_BOLT_SPEED, (dy / d) * KING_BOLT_SPEED, (dz / d) * KING_BOLT_SPEED);
    this.system.audio.wildererBolt?.();
  }
}

function makeBoltSprite(glowTex) {
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xe8d060, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(0.35);
  return s;
}

export function buildHallows(scene, glowTex, hud, audio, fx, health, interact, home, wildmarkHuegelgrab, deps) {
  // deps = { hallows, mount, dementors, puzzles, moor, spells }
  const { hallows, mount, dementors, puzzles, moor, spells } = deps;
  let currentPlayer = null;

  const system = {
    scene, glowTex, fx, audio, health,
    peaceful: false,
    time: 0,
    bolts: [],
    onSummonGhosts: null,
  };

  function hallowsUnlocked() { return !!puzzles?.finaleWon && !!moor?.laterneCollected; }

  // ---------- Elderstab: Bleicher König am Hügelgrab, Mitternacht ----------
  const ghostParts = buildGhostParts(glowTex);
  const king = new PaleKing(system, ghostParts);
  king.onDefeated = () => {
    hallows.stab = 1;
    active.stab = true;
    hud.showToast('🪄 Der Bleiche König verneigt sich — „Endlich einer, der würdig ist." Der Elderstab gehört dir!', 5);
    audio.chime?.('fanfare');
    fx.burst({ x: king.pos.x, y: king.pos.y + 1, z: king.pos.z }, 0xffe27a, 40, 5, { gravity: -2, life: 1.1 });
    spells?.unlockHallowsSpell('stab', false); // eigener Toast oben, kein zweiter nötig
    onChange?.();
  };
  system.onSummonGhosts = (pos) => {
    for (const g of phantomGhosts) {
      if (g.alive) continue;
      g.homePos.x = pos.x + (Math.random() - 0.5) * 4;
      g.homePos.z = pos.z + (Math.random() - 0.5) * 4;
      g._activate();
    }
    hud.showToast('👻 Der Bleiche König beschwört Schattengeister!', 2.5);
  };
  // 2 echte Ghost-Instanzen (creatures.js-Export) für Phase 2 — reines
  // system-Shim mit den Feldern, die Ghost.update()/applyHit() lesen.
  const ghostSystem = { scene, fx, audio, health, peaceful: false, time: 0, _nearestGhostDist: Infinity };
  const phantomGhosts = [
    new Ghost(ghostSystem, ghostParts, { x: HUEGELGRAB.x, z: HUEGELGRAB.z }, 41),
    new Ghost(ghostSystem, ghostParts, { x: HUEGELGRAB.x, z: HUEGELGRAB.z }, 42),
  ];

  // Slab-Öffnung (wildmark.js-Export: Mesh + Blocker-Referenz, S1 vorbereitet)
  const { slab, slabBlocker } = wildmarkHuegelgrab;
  const slabBaseY = slab.position.y;
  let slabOpenT = 0; // 0=zu, 1=offen
  let kingEverRoseToday = false;
  let prevNightGlow = 0.5;
  const DAWN_LOW = 0.35; // Muster wilderer.js/home.js: derselbe Morgengrauen-Schwellwert

  const boltMeshes = new Map();
  system.spawnBolt = (x, y, z, vx, vy, vz) => {
    const b = { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(vx, vy, vz), life: 4 };
    const mesh = makeBoltSprite(glowTex);
    mesh.position.copy(b.pos);
    scene.add(mesh);
    boltMeshes.set(b, mesh);
    system.bolts.push(b);
  };

  function updateKingBolts(dt, player) {
    for (let i = system.bolts.length - 1; i >= 0; i--) {
      const b = system.bolts[i];
      b.pos.addScaledVector(b.vel, dt);
      b.life -= dt;
      const mesh = boltMeshes.get(b);
      const dx = b.pos.x - player.pos.x, dy = b.pos.y - (player.pos.y + 1.0), dz = b.pos.z - player.pos.z;
      let hit = dx * dx + dy * dy + dz * dz < 0.5 * 0.5;
      if (hit) {
        if (!system.peaceful && !player.invisible) health.damage(KING_BOLT_DMG, { x: dx / (Math.hypot(dx, dz) || 1), y: 0.2, z: dz / (Math.hypot(dx, dz) || 1) });
        fx.burst(b.pos, 0xe8d060, 10, 2.5, { gravity: -2, life: 0.4 });
      }
      if (hit || b.life <= 0) {
        scene.remove(mesh);
        boltMeshes.delete(b);
        system.bolts.splice(i, 1);
      } else {
        mesh.position.copy(b.pos);
      }
    }
  }

  // ---------- Stein der Wiederkehr: Seegrund, Tauchen ----------
  const stoneY = terrainHeight(STONE_POS.x, STONE_POS.z) + 0.4;
  const stoneMat = new THREE.MeshBasicMaterial({ color: 0x9fc8ff, transparent: true, opacity: 0.9 });
  const stoneMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), stoneMat);
  stoneMesh.position.set(STONE_POS.x, stoneY, STONE_POS.z);
  scene.add(stoneMesh);
  const stoneGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9fc8ff, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const stoneGlow = new THREE.Sprite(stoneGlowMat);
  stoneGlow.scale.setScalar(1.6);
  stoneGlow.position.copy(stoneMesh.position);
  scene.add(stoneGlow);
  const stoneLight = new THREE.PointLight(0x9fc8ff, 4, 8, 2);
  stoneLight.position.copy(stoneMesh.position);
  scene.add(stoneLight);
  let stoneT = 0;

  interact.register({
    x: STONE_POS.x, z: STONE_POS.z, r: STONE_PICKUP_R,
    get enabled() { return hallowsUnlocked() && !hallows.stein && currentPlayer?.diving; },
    prompt: 'E — Den Stein der Wiederkehr bergen',
    onInteract: () => {
      hallows.stein = 1;
      active.stein = true;
      stoneMesh.visible = false;
      stoneGlow.visible = false;
      stoneLight.intensity = 0;
      hud.showToast('💎 Der Stein der Wiederkehr! Bei 0 Herzen holt er dich einmal pro Tag zurück.', 4.5);
      audio.chime?.('fanfare');
      fx.burst(stoneMesh.position, 0x9fc8ff, 24, 3, { gravity: -0.5, life: 1.0 });
      spells?.unlockHallowsSpell('stein', false); // eigener Toast oben, kein zweiter nötig
      onChange?.();
    },
  });

  // health.onLethalHit: true = übernommen (K7: seenDeath setzen, K11: KEIN
  // dropCarriedLights — main.js' onRespawn läuft dank return-true einfach nie).
  health.onLethalHit = () => {
    if (!hallows.stein || !active.stein || hallows.steinCd > 0) return false;
    hallows.steinCd = 1; // "1× pro Spieltag" — main.js zählt in echten Tagen runter
    health.hearts = health.effectiveMaxHearts;
    health.dead = false;
    health.iFrameT = 1.2;
    audio.chime?.('fanfare');
    fx.burst(currentPlayer.pos, 0x9fc8ff, 40, 4, { gravity: -1, life: 1.2 });
    hud.showToast('💎 Der Stein der Wiederkehr holt dich zurück — an Ort und Stelle, volle Herzen!', 4);
    onSeenDeath?.();
    return true;
  };
  let onSeenDeath = null;

  // ---------- Podeste: an/ablegen (Selbst-Balancing) ----------
  // Session-Zustand, IMMER "ausgerüstet" nach Laden/Reset (S9-Präzedenz für
  // following=false gilt hier NICHT — ein Effekt, der nach jedem Neuladen
  // erst manuell wieder angelegt werden müsste, wäre reine Frustration ohne
  // Spielwert; das Ablegen ist ein bewusster Einzelfall-Toggle, kein
  // Default-Zustand).
  const active = { stab: true, umhang: true, stein: true };
  const ICON_COLOR = { stab: 0xd4c060, umhang: 0x3a3226, stein: 0x9fc8ff };
  const NAMES = { stab: 'Elderstab', umhang: 'Umhang der Unsichtbarkeit', stein: 'Stein der Wiederkehr' };
  const podiumIcons = {};
  for (const p of home.podeste) {
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: ICON_COLOR[p.id], transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const icon = new THREE.Sprite(mat);
    icon.scale.setScalar(0.4);
    icon.position.set(0, 0.55, 0);
    p.mesh.add(icon);
    podiumIcons[p.id] = icon;
    interact.register({
      x: p.x, z: p.z, r: 1.2,
      get enabled() { return !!hallows[p.id]; },
      get prompt() {
        return active[p.id] ? `E — ${NAMES[p.id]} ablegen (Effekt aus)` : `E — ${NAMES[p.id]} aufnehmen (Effekt an)`;
      },
      onInteract: () => {
        active[p.id] = !active[p.id];
        hud.showToast(active[p.id] ? `${NAMES[p.id]} wieder angelegt.` : `${NAMES[p.id]} abgelegt — Effekt pausiert.`, 2.2);
        audio.chime?.();
      },
    });
  }

  let onChange = null;

  return {
    king, // main.js hängt king in die spells-Zielliste (Konkatenation wie creatures.list)
    get phantomGhosts() { return phantomGhosts; },
    // K3: peaceful-Modus deckt auch den Bleichen König ab — nichts schadet
    // dem Spieler, besiegen bleibt möglich (Muster wilderer.js/dementor.js).
    set peaceful(v) { system.peaceful = v; },
    get peaceful() { return system.peaceful; },
    set onChange(fn) { onChange = fn; },
    set onSeenDeath(fn) { onSeenDeath = fn; },
    get masterOfDeath() {
      return !!(hallows.stab && active.stab && hallows.umhang && active.umhang && hallows.stein && active.stein);
    },
    // main.js liest dies für spells.dmgMul/cooldownMul (Elderstab: Schaden ×2, CD ×0.6)
    get elderstabActive() { return !!(hallows.stab && active.stab); },

    toggleInvisibility(player) {
      if (!hallows.umhang || !active.umhang) {
        hud.showToast('Du besitzt den Umhang der Unsichtbarkeit noch nicht.', 2.2);
        return;
      }
      player.invisible = !player.invisible;
      hud.showToast(player.invisible ? '🧥 Unsichtbar.' : '🧥 Wieder sichtbar.', 1.8);
      audio.chime?.();
    },

    update(dt, player, sky) {
      currentPlayer = player;
      system.time += dt;
      ghostSystem.time = system.time;
      ghostSystem.peaceful = system.peaceful;

      // Stein: "1× pro Spieltag" — Cooldown räumt sich beim Morgengrauen ab.
      const night = sky.state.nightGlow;
      if (prevNightGlow >= DAWN_LOW && night < DAWN_LOW) hallows.steinCd = 0;
      prevNightGlow = night;

      // ---------- Bleicher König: Mitternachts-Trigger ----------
      const atMidnight = sky.timeOfDay < MIDNIGHT_WINDOW || sky.timeOfDay > 1 - MIDNIGHT_WINDOW;
      if (!atMidnight) kingEverRoseToday = false;
      if (hallowsUnlocked() && !hallows.stab && atMidnight && !kingEverRoseToday && king.state === 'sealed') {
        kingEverRoseToday = true;
        slabBlocker.disabled = true;
        hud.showToast('🪦 Um Mitternacht öffnet sich die Steinplatte am Hügelgrab …', 3.5);
        audio.chime?.();
        king.rise();
      }
      if (king.state !== 'sealed' && slabOpenT < 1) {
        slabOpenT = Math.min(1, slabOpenT + dt / 1.6);
        slab.position.y = slabBaseY - slabOpenT * 2.4;
      }
      if (king.state !== 'sealed' && king.state !== 'gone') {
        king.update(dt, player);
        updateKingBolts(dt, player);
      }
      for (const g of phantomGhosts) {
        if (g.alive) g.update(dt, player, sky.state, false); // Kampf-Kontext: keine Lumos-Flucht
      }

      // ---------- Stein: Glimmen + Wiederkehr-Cooldown-Tagesabbau ----------
      stoneT += dt;
      if (!hallows.stein) {
        stoneGlow.material.opacity = 0.55 + Math.sin(stoneT * 2) * 0.15;
        stoneLight.intensity = 3 + Math.sin(stoneT * 2) * 1;
        stoneMesh.rotation.y += dt * 0.6;
      }

      // ---------- Podest-Icons ----------
      for (const p of home.podeste) {
        podiumIcons[p.id].material.opacity = (hallows[p.id] && !active[p.id]) ? 0.9 : 0;
      }

      // ---------- Meister des Todes: globale Effekte weiterreichen ----------
      const mod = this.masterOfDeath;
      dementors.masterOfDeath = mod;
      mount.masterOfDeath = mod;
      if (mod && player.grounded) {
        const hSpeed = Math.hypot(player.vel.x, player.vel.z);
        if (hSpeed > 8 && Math.random() < 0.5) {
          fx.trail({ x: player.pos.x, y: player.pos.y + 0.2, z: player.pos.z }, 0xd8e8ff);
        }
      }
    },

    restore() {
      king.state = 'sealed';
      king.group.visible = false;
      kingEverRoseToday = false;
      prevNightGlow = 0.5;
      slabOpenT = 0;
      slab.position.y = slabBaseY;
      slabBlocker.disabled = false;
      for (const g of phantomGhosts) { g.alive = false; g.state = 'dead'; g.group.visible = false; }
      stoneMesh.visible = true;
      stoneGlow.visible = true;
      active.stab = true; active.umhang = true; active.stein = true;
      dementors.masterOfDeath = false;
      mount.masterOfDeath = false;
    },
  };
}
