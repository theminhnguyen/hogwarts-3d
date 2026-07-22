// Dementoren: blinde, unheimliche Wächter des Nebelmoors. Immun gegen Stupor/
// Incendio (nur Expecto Patronum vertreibt sie, kommt in Phase N3), harte
// Leine ans Moor, Frost-Aura mit Herz-Drain + Verlangsamung. Eigene Datei,
// weil creatures.js mit ~950 Zeilen schon voll ist.

import * as THREE from 'three';
import { terrainHeight, MOOR } from './terrain.js';
import { mulberry32 } from './noise.js';

const TUNING = {
  driftSpeed: 1.0, chaseSpeed: 5.0,
  aggroRange: 22, leaveAggroRange: 30,
  touchRange: 1.3, dmg: 1, knockback: 6,
  auraRange: 10, frostBuildDur: 4, frostDecay: 0.5,
  slowThreshold: 0.5, slowFactor: 0.75,
  drainAmount: 0.5, drainInterval: 2,
  repelSpeed: 9, repelDur: 30,
  leash: MOOR.r + 8,
};

const SPAWNS = [
  { x: 215, z: -155 }, { x: 265, z: -160 }, { x: 270, z: -200 },
  { x: 230, z: -210 }, { x: 205, z: -187 },
];

// Eigenständige Kopie der Jitter-Hilfsfunktion (dort nicht exportiert).
function jitter(geo, amount, seed) {
  const rng = mulberry32(seed);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) + (rng() - 0.5) * amount,
      pos.getY(i) + (rng() - 0.5) * amount * 0.6,
      pos.getZ(i) + (rng() - 0.5) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

// Kürzester Winkel-Diff für sanftes Eindrehen (Blickrichtung folgt der Bewegung)
function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Gemeinsame Dementor-Geometrie (einmal gebaut, von allen geteilt) ----------
function buildDementorParts(glowTex) {
  const cloakGeo = jitter(new THREE.ConeGeometry(0.65, 2.6, 9, 4, true), 0.2, 4200);
  cloakGeo.translate(0, 1.3, 0); // Saum bei y=0, Spitze bei y=2.6
  const hoodGeo = new THREE.SphereGeometry(0.3, 8, 6);
  hoodGeo.translate(0, 2.3, 0.04);
  const voidGeo = new THREE.SphereGeometry(0.17, 7, 5); // schwarzes "Nichts" unter der Kapuze
  const stripGeo = new THREE.PlaneGeometry(0.16, 0.85);
  stripGeo.translate(0, -0.425, 0); // Pivot am oberen Rand, Streifen hängt nach unten

  // Handglied: schmale Box, Pivot am unteren Ende (für die Ketten-Anordnung)
  const handSegGeo = new THREE.BoxGeometry(0.05, 0.16, 0.05);
  handSegGeo.translate(0, 0.08, 0);

  const cloakMatTemplate = new THREE.MeshLambertMaterial({
    color: 0x0d0f16, transparent: true, opacity: 0.92, flatShading: true, side: THREE.DoubleSide,
  });
  const voidMatTemplate = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const handMatTemplate = new THREE.MeshLambertMaterial({ color: 0x8a8578, flatShading: true });
  const glowMatTemplate = new THREE.SpriteMaterial({
    map: glowTex, color: 0x3a4a6a, transparent: true, opacity: 0.2,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });

  return {
    cloakGeo, hoodGeo, voidGeo, stripGeo, handSegGeo,
    cloakMatTemplate, voidMatTemplate, handMatTemplate, glowMatTemplate,
  };
}

class Dementor {
  constructor(system, parts, homePos, seed) {
    this.system = system;
    this.species = 'dementor';
    this.hp = Infinity;
    this.alive = true; // Dementoren sterben nie, sie werden höchstens 'repelled'
    // pos ist der Bodenpunkt unter dem schwebenden Umhang (Fußpunkt-Konvention
    // wie bei Ghost/Troll) — hitY hebt den Treffer-Anker auf Torso/Hände, wo
    // ein Spieler natürlich hinzielen würde.
    this.radius = 0.7;
    this.hitY = 1.3;
    this.state = 'drift'; // 'drift' | 'aggro' | 'repelled'
    this.stateT = 0;
    this.homePos = homePos;

    const rng = mulberry32(seed * 991 + 3);
    this.phaseA = rng() * Math.PI * 2;
    this.phaseB = rng() * Math.PI * 2;
    this.hoverPhase = rng() * Math.PI * 2;

    this.group = new THREE.Group();
    this.pos = this.group.position;
    this.pos.set(homePos.x, terrainHeight(homePos.x, homePos.z) + 1.5, homePos.z);

    this.cloakMat = parts.cloakMatTemplate.clone();
    this.cloak = new THREE.Mesh(parts.cloakGeo, this.cloakMat);
    this.cloak.castShadow = true;
    this.group.add(this.cloak);

    const hood = new THREE.Mesh(parts.hoodGeo, this.cloakMat);
    this.group.add(hood);
    const voidMesh = new THREE.Mesh(parts.voidGeo, parts.voidMatTemplate);
    voidMesh.position.set(0, 2.3, 0.22);
    this.group.add(voidMesh);

    // Zerfetzte Saum-Streifen, leicht pendelnd
    this.strips = [];
    const stripN = 5 + Math.floor(rng() * 2);
    for (let i = 0; i < stripN; i++) {
      const a = (i / stripN) * Math.PI * 2 + rng() * 0.3;
      const strip = new THREE.Mesh(parts.stripGeo, this.cloakMat);
      strip.position.set(Math.cos(a) * 0.55, 0.02, Math.sin(a) * 0.55);
      strip.rotation.y = -a;
      this.group.add(strip);
      this.strips.push({ mesh: strip, phase: rng() * Math.PI * 2 });
    }

    // Zwei Skeletthände (je 3 Glieder), vor dem Körper schwebend
    for (const s of [-1, 1]) {
      const handGroup = new THREE.Group();
      handGroup.position.set(s * 0.3, 1.6, 0.4);
      handGroup.rotation.z = s * 0.3;
      let y = 0;
      for (let seg = 0; seg < 3; seg++) {
        const m = new THREE.Mesh(parts.handSegGeo, parts.handMatTemplate);
        m.position.y = y;
        m.rotation.x = 0.15 * seg;
        handGroup.add(m);
        y += 0.15;
      }
      this.group.add(handGroup);
    }

    this.glowMat = parts.glowMatTemplate.clone();
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(3.5);
    glow.position.y = -1.4; // knapp über dem tatsächlichen Boden (Anker ist 1.5m höher)
    this.group.add(glow);

    system.scene.add(this.group);
  }

  _steerXZ(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / d) * speed * dt;
    this.pos.z += (dz / d) * speed * dt;
    this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, 3 * dt));
  }

  // Stupor/Incendio verpuffen wirkungslos — grauer, kraftloser Puff statt des
  // normalen Einschlags. Rückgabewert true weist spells.js an, den Standard-
  // Einschlagseffekt (farbiger Funkenregen + satter Ton) zu unterdrücken.
  applyHit(_spellId, _boltVel) {
    this.system.fx.burst(
      { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
      0x555b66, 6, 1.5, { gravity: -2, life: 0.5 },
    );
    this.system.audio?.spellFizzle?.();
    if (!this.system._immuneToastShown) {
      this.system._immuneToastShown = true;
      this.system.hud?.showToast(
        'Deine Zauber verpuffen an der Kälte … es braucht etwas Helleres.', 4,
      );
    }
    return true;
  }

  // Von Expecto Patronum vertrieben (Phase N3 ruft dies auf einen Dementor
  // im Wirkradius des Hirschen auf).
  repel() {
    this.state = 'repelled';
    this.stateT = 0;
    this.system.audio?.dementorRepel?.();
    this.system.fx.burst({ x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z }, 0xcfe8ff, 14, 4, { gravity: -1, life: 0.6 });
  }

  update(dt, player) {
    if (this.state === 'repelled') {
      this.stateT += dt;
      this._steerXZ(this.homePos.x, this.homePos.z, TUNING.repelSpeed, dt);
      this.cloak.scale.y = 0.8; // duckt sich auf der Flucht
      if (this.stateT >= TUNING.repelDur) {
        this.state = 'drift';
        this.stateT = 0;
        this.cloak.scale.y = 1;
      }
    } else {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const distSq = dx * dx + dz * dz;
      switch (this.state) {
        case 'drift': {
          // S8 Dunkles Mal: solange aktiv, driften Dementoren zum Mal statt
          // zufällig ums eigene Zuhause — "taktisches Weglocken vom Moor-
          // Pfad" (Plan). Kein harter Leash-Bruch: die MOOR-Leine unten
          // klemmt trotzdem, das Mal muss also in Leash-Reichweite liegen.
          if (this.system.malLureT > 0 && this.system.malLurePos) {
            this._steerXZ(this.system.malLurePos.x, this.system.malLurePos.z, TUNING.driftSpeed * 1.6, dt);
          } else {
            const t = this.system.time;
            const lx = this.homePos.x + Math.sin(t * 0.12 + this.phaseA) * 12;
            const lz = this.homePos.z + Math.cos(t * 0.1 + this.phaseB) * 12;
            this._steerXZ(lx, lz, TUNING.driftSpeed, dt);
          }
          // Risiko-Spirale (N4): aggroRange wächst mit jedem getragenen
          // Seelenlicht, die Laterne halbiert sie wieder — main.js speist
          // beide Werte aus moor.js. K4 (S8): im dunklen Pfad neutral, kein
          // Aggro-Übergang — Dementoren gehören zu den Schatten wie der Spieler.
          // S10: Meister des Todes ebenso neutral ("verneigen sich im
          // Vorbeigehen" impliziert Respekt, nicht Angriff — sonst würde ein
          // Dementor gleichzeitig angreifen UND sich verbeugen, unlogisch).
          // S11: Katzen-Schleichen verkleinert nur die ERKENNUNGS-Reichweite
          // (dieser aggroR) — leaveR (unten) bleibt unskaliert, ein einmal
          // alarmierter Dementor lässt sich nicht durch Schleichen abschütteln.
          const aggroR = (TUNING.aggroRange + this.system.aggroRangeExtra) * this.system.aggroRangeMul * this.system.catStealthMul;
          if (!this.system.playerIsDark && !this.system.masterOfDeath && !player.invisible && distSq < aggroR * aggroR) {
            this.state = 'aggro';
            this.stateT = 0;
          }
          // Statt zu ignorieren wie im dunklen Pfad, verneigt sich der
          // Dementor beim Vorbeigehen (Umhang-Dip) — er erkennt den Träger
          // aller drei Heiligtümer als "einen der Ihren" an.
          if (this.system.masterOfDeath) {
            const dNear = Math.sqrt(distSq);
            const dip = dNear < 12 ? (1 - dNear / 12) * 0.5 : 0;
            this.group.rotation.x += (dip - this.group.rotation.x) * Math.min(1, 3 * dt);
          } else if (this.group.rotation.x !== 0) {
            this.group.rotation.x += (0 - this.group.rotation.x) * Math.min(1, 3 * dt);
          }
          break;
        }
        case 'aggro': {
          this.stateT += dt;
          this._steerXZ(player.pos.x, player.pos.z, TUNING.chaseSpeed, dt);
          if (distSq < TUNING.touchRange * TUNING.touchRange) {
            // Richtung vom Spieler weg (Dementor minus Spieler) — Muster wie
            // beim Schattengeist-Kontakt: Spieler-Rückstoß UND Dementor-
            // Rückteleport nutzen dieselbe Richtung.
            const ddx = this.pos.x - player.pos.x, ddz = this.pos.z - player.pos.z;
            const d = Math.hypot(ddx, ddz) || 1;
            const dirX = ddx / d, dirZ = ddz / d;
            if (!this.system.peaceful) {
              this.system.health.damage(TUNING.dmg, { x: dirX, y: 0, z: dirZ });
              this.system.fx.shake(0.4);
            }
            this.pos.x = player.pos.x + dirX * TUNING.knockback;
            this.pos.z = player.pos.z + dirZ * TUNING.knockback;
          }
          const leaveR = (TUNING.leaveAggroRange + this.system.aggroRangeExtra) * this.system.aggroRangeMul;
          if (distSq > leaveR * leaveR) {
            this.state = 'drift';
            this.stateT = 0;
          }
          break;
        }
      }
    }

    // Harte Leine: NACH jeder Bewegung (egal welcher Zustand) radial auf den
    // Leine-Radius zurückklemmen (Muster wie WORLD_BOUND in player.js) —
    // "verlassen NIEMALS" ist eine Bewegungsgrenze, kein bloßes Zurücksteuern
    // über mehrere Sekunden (das wäre bei hoher Verfolgungsgeschwindigkeit zu
    // langsam und ließe kurzzeitige Überschreitungen zu).
    const distMoorAfter = Math.hypot(this.pos.x - MOOR.x, this.pos.z - MOOR.z);
    if (distMoorAfter > TUNING.leash) {
      if (this.state === 'aggro') { this.state = 'drift'; this.stateT = 0; }
      const f = TUNING.leash / distMoorAfter;
      this.pos.x = MOOR.x + (this.pos.x - MOOR.x) * f;
      this.pos.z = MOOR.z + (this.pos.z - MOOR.z) * f;
    }

    // Schweben 1.2–1.8m über Boden
    const groundY = terrainHeight(this.pos.x, this.pos.z);
    this.pos.y = groundY + 1.5 + Math.sin(this.system.time * 0.6 + this.hoverPhase) * 0.3;

    // Saum-Streifen pendeln
    for (const s of this.strips) {
      s.mesh.rotation.x = Math.sin(this.system.time * 1.6 + s.phase) * 0.18;
    }
  }
}

export class DementorSystem {
  constructor(scene, fx, audio, health, hud, glowTex) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.health = health;
    this.hud = hud;
    this.peaceful = false;
    this.time = 0;
    this.frost = 0;
    this.frostFactor = 0;
    this._drainTimer = 0;
    this._immuneToastShown = false;
    // Risiko-Spirale + Laterne (N4, main.js speist beide aus moor.js):
    this.aggroRangeExtra = 0; // +4 pro getragenem Seelenlicht
    this.aggroRangeMul = 1;   // ×0.5 sobald die Laterne geborgen ist
    this.frostRateMul = 1;    // ×0.5 sobald die Laterne geborgen ist
    this.frostImmune = false; // S7 Frostbann-Trank — von main.js aus heim.trank gesetzt
    // S8: Dementoren sind neutral, solange der Spieler dem dunklen Pfad
    // folgt (K4 — "der dunkle Weg ist bequem", von main.js aus dunkel.pfad
    // gesetzt). malLurePos/malLureT (Dunkles Mal, Taste 9) lässt sie 30s
    // zum Mal driften statt zufällig wandern.
    this.playerIsDark = false;
    this.malLurePos = null;
    this.malLureT = 0;
    // S10 Meister des Todes (alle 3 Heiligtümer besessen+ausgerüstet) —
    // von main.js aus hallows.masterOfDeath gesetzt.
    this.masterOfDeath = false;
    // S11: Katzen-Schleichen — von main.js aus player.animalForm gesetzt.
    this.catStealthMul = 1;

    const parts = buildDementorParts(glowTex);
    this.list = SPAWNS.map((s, i) => new Dementor(this, parts, s, i + 1));
  }

  // S8 Dunkles Mal: 30s lang driften alle nicht-vertriebenen Dementoren zum
  // angegebenen Punkt statt zufällig zu wandern.
  summonToMal(pos) {
    this.malLurePos = { x: pos.x, z: pos.z };
    this.malLureT = TUNING.repelDur; // dieselbe 30s-Dauer wie repel()
  }

  update(dt, player) {
    this.time += dt;
    if (this.malLureT > 0) this.malLureT = Math.max(0, this.malLureT - dt);
    let nearestDist = Infinity;
    let inAura = false;
    for (const d of this.list) {
      d.update(dt, player);
      // 3D-Distanz ab S6 (K9): Überfliegen des Moors in Höhe ist sicher,
      // Tiefflug nicht — zu Fuß ist die y-Differenz ohnehin ~0 (Regression).
      const dist = Math.hypot(d.pos.x - player.pos.x, d.pos.y - player.pos.y, d.pos.z - player.pos.z);
      if (dist < nearestDist) nearestDist = dist;
      // K4 (S8): im dunklen Pfad auch keine Frost-Aura/Herz-Drain.
      // S10: Meister des Todes ebenso — volle Neutralität, nicht nur kein Aggro.
      if (!this.playerIsDark && !this.masterOfDeath && d.state !== 'repelled' && dist < TUNING.auraRange) inAura = true;
    }

    // Frost-Meter: baut sich über 4s auf, solange der Spieler in irgendeiner
    // Aura steht (die Laterne halbiert dieses Tempo via frostRateMul), baut
    // sonst mit 0.5/s ab. frostFactor wird von main.js für hud.setFrost()
    // und player.slowFactor gelesen. S7 Frostbann-Trank: keinerlei Aufbau,
    // bestehender Frost baut trotzdem normal ab (kein Instant-Cleanse nötig,
    // 4s Aufbauzeit ist ohnehin kurz).
    this.frost = (inAura && !this.frostImmune)
      ? Math.min(1, this.frost + (dt / TUNING.frostBuildDur) * this.frostRateMul)
      : Math.max(0, this.frost - dt * TUNING.frostDecay);
    this.frostFactor = this.frost;

    if (inAura) {
      this._drainTimer += dt;
      if (this._drainTimer >= TUNING.drainInterval) {
        this._drainTimer = 0;
        if (!this.peaceful) this.health.damage(TUNING.drainAmount, null);
      }
    } else {
      this._drainTimer = 0;
    }

    const breathFrac = nearestDist < TUNING.aggroRange
      ? Math.max(0, 1 - nearestDist / TUNING.aggroRange) : 0;
    this.audio?.setDementorBreath?.(breathFrac);
  }
}
