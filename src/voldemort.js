// Der Dunkle Lord (PLAN-DER-DUNKLE-LORD.md, Meilenstein V3): letzter Endboss
// in der Schattenfeste. FSM nach dem PaleKing-Muster (hallows.js) — sealed→
// rising→(Phasen)→gone, applyHit(), Arena-Leine, kein neues Kernsystem.
//
// V3 liefert Phase 1 ("Der Schild aus schwarzem Feuer" — nur Eisblitz
// durchdringt ihn, 3 Treffer zersplittern den Schild) und Phase 2 ("Die
// Woge" — 5 arena-gebundene Dementoren, nur Expecto Patronum vertreibt sie).
// Phasen 3-5 (Umhang/Blickrichtung, Avada/Stein, Elderstab-Duell) folgen in
// V4 — bis dahin idlet der Lord nach Phase 2 unverwundbar im Zustand
// 'p3_locked' (kein Softlock: der Rückzugs-Reset unten bleibt aktiv).
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { buildFigure } from './npc.js';
import { buildDementorParts } from './dementor.js';

const RISE_DUR = 2.0;
const PHASE1_HITS_NEEDED = 3;
const PHASE1_STALL_TOAST_AFTER = 45;
const PHASE2_COUNT = 5;
const DEMENTOR_AURA_R = 6;
const DEMENTOR_TOUCH_R = 1.2;
const DEMENTOR_DMG = 0.5;
const DEMENTOR_SPEED = 3.4;
const DEMENTOR_KNOCKBACK = 5;
const FROST_BUILD_DUR = 4;
const FROST_DECAY = 0.5;
const DRAIN_AMOUNT = 0.5;
const DRAIN_INTERVAL = 2;
const RETREAT_LEASH_EXTRA = 25; // Sicherheitsnetz: so weit über ARENA_R hinaus bricht der Versuch sauber ab

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// ---------- Phase 2: eigenständige, arena-gebundene Beschwörung ----------
// Bewusst KEINE Instanz der echten Dementor-Klasse (dementor.js) — deren
// Leine ist hart an MOOR.x/z gebunden (dementor.js update(), harter Clamp
// gegen die MOOR-Konstante), für die Schattenfeste bräuchte es einen
// parametrisierten Leash-Mittelpunkt im Kern-System (Leitplanke 1: kein
// neues Kernsystem — aber auch keine Änderung an einem bestehenden, gut
// getesteten System nur für diesen einen Sonderfall). Stattdessen: geteilte
// Geometrie (buildDementorParts, jetzt exportiert), eigenständige, bewusst
// simplere Verhaltenslogik, arena-lokale Leine.
//
// Nebeneffekt, der genau die Plan-Vorgabe erfüllt: diese Klasse prüft
// niemals `system.masterOfDeath` (anders als die echte Dementor-Klasse) —
// beschworene Dementoren verbeugen sich also NIE, selbst wenn der Spieler
// Meister des Todes ist. Sonst würde der eigene Buff genau diese Phase
// entwerten.
class SummonedDementor {
  constructor(system, parts, arenaCenter, arenaR, angle) {
    this.system = system;
    this.species = 'dementor'; // spells.js' Patronum-Vertreiben filtert exakt darauf
    this.alive = true;
    this.radius = 0.7;
    this.hitY = 1.3;
    this.state = 'active'; // active | gone
    this.arenaCenter = arenaCenter;
    this.arenaR = arenaR;
    this.hoverPhase = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();
    this.pos = this.group.position;
    const r = arenaR * (0.5 + Math.random() * 0.3);
    this.pos.set(
      arenaCenter.x + Math.cos(angle) * r,
      terrainHeight(arenaCenter.x, arenaCenter.z) + 1.5,
      arenaCenter.z + Math.sin(angle) * r,
    );

    this.cloakMat = parts.cloakMatTemplate.clone();
    this.cloak = new THREE.Mesh(parts.cloakGeo, this.cloakMat);
    this.group.add(this.cloak);
    this.group.add(new THREE.Mesh(parts.hoodGeo, this.cloakMat));
    const voidMesh = new THREE.Mesh(parts.voidGeo, parts.voidMatTemplate);
    voidMesh.position.set(0, 2.3, 0.22);
    this.group.add(voidMesh);
    this.glowMat = parts.glowMatTemplate.clone();
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(3.2);
    glow.position.y = -1.4;
    this.group.add(glow);

    system.scene.add(this.group);
  }

  // Immun gegen jeden Spruch außer Expecto Patronum (das ruft repel() direkt
  // auf, kein Bolzen-Treffer nötig) — Muster: Dementor.applyHit().
  applyHit(_spellId) {
    if (this.state !== 'active') return true;
    this.system.fx.burst(
      { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
      0x555b66, 6, 1.5, { gravity: -2, life: 0.5 },
    );
    this.system.audio?.spellFizzle?.();
    return true; // unterdrückt den normalen Bolzen-Einschlag
  }

  repel() {
    if (this.state !== 'active') return;
    this.state = 'gone';
    this.alive = false;
    this.system.audio?.dementorRepel?.();
    this.system.fx.burst(
      { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
      0xcfe8ff, 14, 4, { gravity: -1, life: 0.6 },
    );
    this.group.visible = false;
  }

  update(dt, player) {
    if (this.state !== 'active') return;
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / d) * DEMENTOR_SPEED * dt;
    this.pos.z += (dz / d) * DEMENTOR_SPEED * dt;
    this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, 3 * dt));

    if (d < DEMENTOR_TOUCH_R) {
      // Richtung + Rückteleport-Muster exakt wie Dementor.js/Ghost (dort
      // ausführlich als "vom Spieler weg" kommentiert) — hier unverändert
      // übernommen für gleiches Spielgefühl.
      const dirX = (this.pos.x - player.pos.x) / d, dirZ = (this.pos.z - player.pos.z) / d;
      if (!this.system.peaceful) {
        this.system.health.damage(DEMENTOR_DMG, { x: dirX, y: 0, z: dirZ });
        this.system.fx.shake(0.3);
      }
      this.pos.x = player.pos.x + dirX * DEMENTOR_KNOCKBACK;
      this.pos.z = player.pos.z + dirZ * DEMENTOR_KNOCKBACK;
    }

    // Arena-Leine (Muster: buildArenaRing/schattenfeste.js) — nie weiter als
    // arenaR vom Zentrum weg.
    const ldx = this.pos.x - this.arenaCenter.x, ldz = this.pos.z - this.arenaCenter.z;
    const ld = Math.hypot(ldx, ldz);
    if (ld > this.arenaR) {
      this.pos.x = this.arenaCenter.x + (ldx / ld) * this.arenaR;
      this.pos.z = this.arenaCenter.z + (ldz / ld) * this.arenaR;
    }
    const groundY = terrainHeight(this.pos.x, this.pos.z);
    this.pos.y = groundY + 1.5 + Math.sin(this.system.time * 0.6 + this.hoverPhase) * 0.3;
  }
}

export class DunklerLord {
  constructor(system, glowTex, arenaCenter, arenaR) {
    this.system = system;
    this.species = 'dunklerlord';
    this.alive = false; // erst in Phase 1 ('p1') ein gültiges Spruchziel (Muster: PaleKing)
    this.radius = 0.6;
    this.hitY = 1.6; // buildFigure()-Kopf bei lokal y=1.28, ×1.25 Skalierung ≈ 1.6
    this.state = 'sealed'; // sealed|rising|p1|p1_break|p2_summon|p2_wait|p3_locked|gone
    this.stateT = 0;
    this.arenaCenter = arenaCenter;
    this.arenaR = arenaR;
    this.phase = 0;
    this.phase1Hits = 0;
    this.phase1StallT = 0;
    this.phase1ToastShown = false;
    this.dementors = [];
    this.dementorParts = buildDementorParts(glowTex);
    this.frostFactor = 0;
    this._drainTimer = 0;
    this.onPhaseReached = null; // schattenfeste.js hängt hier lord.phaseMax-Persistenz ein

    const fig = buildFigure(0x120a18, 0x000000, 0x0d0810, null, true, 0);
    for (const m of fig.mats) m.opacity = 1;
    this.fig = fig;
    this.group = fig.group;
    this.group.scale.setScalar(1.25);
    this.pos = this.group.position;
    this.baseY = terrainHeight(arenaCenter.x, arenaCenter.z);
    this.pos.set(arenaCenter.x, this.baseY, arenaCenter.z);
    this.group.visible = false;

    const eyeMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x9a1030, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const s of [-1, 1]) {
      const eye = new THREE.Sprite(eyeMat);
      eye.scale.setScalar(0.1);
      eye.position.set(s * 0.07, 0.03, 0.2);
      fig.head.add(eye);
    }
    this.shieldMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x180022, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.shield = new THREE.Sprite(this.shieldMat);
    this.shield.scale.setScalar(3.2);
    this.shield.position.y = 1.0;
    this.group.add(this.shield);

    system.scene.add(this.group);
  }

  // hud.setBoss() erwartet 0..1 (oder null für "keine Bossbar") — anders als
  // Troll/Drache/Frostriese hat der Lord in V3 kein kontinuierliches hp/maxHp,
  // sondern zählt Schild-Treffer (Phase 1) bzw. verbliebene Dementoren
  // (Phase 2). Phase 5 (V4) bekommt echtes hp/maxHp für die DPS-Rechnung aus
  // dem Plan — dann wird dieser Getter entsprechend erweitert.
  get bossFrac() {
    if (this.state === 'p1') return Math.max(0, 1 - this.phase1Hits / PHASE1_HITS_NEEDED);
    if (this.state === 'p2_summon' || this.state === 'p2_wait') {
      const remaining = this.dementors.filter(d => d.state === 'active').length;
      return Math.max(0, remaining / PHASE2_COUNT);
    }
    return null;
  }

  rise() {
    this.state = 'rising';
    this.stateT = 0;
    this.phase = 1;
    this.phase1Hits = 0;
    this.phase1StallT = 0;
    this.phase1ToastShown = false;
    this.pos.set(this.arenaCenter.x, this.baseY, this.arenaCenter.z);
    this.group.visible = true;
    this.group.scale.setScalar(0.2);
    this.group.rotation.y = 0;
    this.system.audio?.lordRise?.();
    this.onPhaseReached?.(1);
  }

  // Nur Eisblitz durchdringt den Schild — alles andere verpufft sichtbar
  // (Muster: Dementor.applyHit()). spells.js ruft dies nur auf, solange
  // this.alive === true (State 'p1'), sonst filtert bereits der Bolzen-
  // Kollisions-Check in spells.js jeden Treffer heraus.
  applyHit(spellId) {
    if (this.state !== 'p1') return true;
    if (spellId !== 'eisblitz') {
      this.system.fx.burst(
        { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
        0x2a1030, 8, 2, { gravity: -2, life: 0.4 },
      );
      this.system.audio?.spellFizzle?.();
      return true;
    }
    this.phase1Hits++;
    this.phase1StallT = 0;
    this.system.fx.burst(
      { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
      0x9fe0ff, 16, 3, { gravity: -2, life: 0.5 },
    );
    this.system.audio?.lordShieldCrack?.();
    if (this.phase1Hits >= PHASE1_HITS_NEEDED) {
      this.state = 'p1_break';
      this.stateT = 0;
      this.system.audio?.lordShieldBreak?.();
      this.system.fx.burst(
        { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
        0xcfe8ff, 40, 5, { gravity: -1, life: 1.0 },
      );
    }
    return false; // normaler Bolzen-Einschlag bleibt zusätzlich sichtbar
  }

  _startPhase2() {
    this.phase = 2;
    this.state = 'p2_summon';
    this.stateT = 0;
    this.dementors = [];
    for (let i = 0; i < PHASE2_COUNT; i++) {
      const a = (i / PHASE2_COUNT) * Math.PI * 2;
      this.dementors.push(new SummonedDementor(this.system, this.dementorParts, this.arenaCenter, this.arenaR, a));
    }
    this.frostFactor = 0;
    this._drainTimer = 0;
    this.system.audio?.lordSummon?.();
    this.system.hud?.showToast('👻 Der Dunkle Lord beschwört eine Woge aus Dementoren!', 3.5);
    this.onPhaseReached?.(2);
  }

  update(dt, player) {
    this.system.time += dt;
    switch (this.state) {
      case 'sealed': case 'gone': return;
      case 'rising': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / RISE_DUR);
        this.group.scale.setScalar(0.2 + 1.05 * f);
        this.pos.y = this.baseY - 1 + f;
        if (this.stateT >= RISE_DUR) {
          this.alive = true;
          this.state = 'p1';
          this.stateT = 0;
          this.group.scale.setScalar(1.25);
          this.pos.y = this.baseY;
        }
        return;
      }
      case 'p1': {
        this.stateT += dt;
        this.phase1StallT += dt;
        this.shieldMat.opacity = 0.35 + Math.sin(this.system.time * 3) * 0.1;
        this.group.rotation.y += 0.15 * dt;
        if (!this.phase1ToastShown && this.phase1StallT >= PHASE1_STALL_TOAST_AFTER) {
          this.phase1ToastShown = true;
          this.system.hud?.showToast('❄️ Eis frisst dieses Feuer — anderswo hast du das gelernt, oder eben nicht.', 4.5);
        }
        break;
      }
      case 'p1_break': {
        this.stateT += dt;
        this.shieldMat.opacity = Math.max(0, 0.45 - this.stateT * 0.5);
        this.pos.y = this.baseY + Math.sin(this.stateT * 20) * 0.08;
        if (this.stateT >= 1.2) {
          this.pos.y = this.baseY;
          this._startPhase2();
        }
        return;
      }
      case 'p2_summon': {
        this.stateT += dt;
        this.alive = false; // unverwundbar während der Beschwörung
        if (this.stateT >= 1.0) { this.state = 'p2_wait'; this.stateT = 0; }
        break;
      }
      case 'p2_wait': {
        this.alive = false;
        let nearestDist = Infinity;
        let anyAlive = false;
        for (const d of this.dementors) {
          d.update(dt, player);
          if (d.state === 'active') {
            anyAlive = true;
            const dist = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z);
            if (dist < nearestDist) nearestDist = dist;
          }
        }
        const inAura = nearestDist < DEMENTOR_AURA_R;
        this.frostFactor = inAura
          ? Math.min(1, this.frostFactor + (dt / FROST_BUILD_DUR))
          : Math.max(0, this.frostFactor - dt * FROST_DECAY);
        if (inAura && !this.system.peaceful) {
          this._drainTimer += dt;
          if (this._drainTimer >= DRAIN_INTERVAL) {
            this._drainTimer = 0;
            this.system.health.damage(DRAIN_AMOUNT, null);
          }
        } else {
          this._drainTimer = 0;
        }
        if (!anyAlive) {
          this.state = 'p3_locked';
          this.stateT = 0;
          this.frostFactor = 0;
          this.system.hud?.showToast('🖤 „Beeindruckend … aber das war erst der Anfang." Der Dunkle Lord lässt kurz von dir ab.', 4);
          this.onPhaseReached?.(3);
        }
        break;
      }
      case 'p3_locked': {
        // V4 baut ab hier Phase 3 (Blickrichtung/Umhang) weiter — bis dahin
        // idlet der Lord unverwundbar. Kein Softlock: der Rückzugs-Reset
        // unten bleibt aktiv, ein Verlassen der Arena bricht sauber ab.
        this.alive = false;
        this.group.rotation.y += 0.1 * dt;
        break;
      }
    }

    // Rückzugs-Sicherheitsnetz (Leitplanke 3, kein Sackgassen-Zustand): weit
    // genug weg vom Kampf, und der Versuch setzt sich sauber zurück — kein
    // Item-/Fortschrittsverlust, nur Zeit (Leitplanke 2). Erwischt auch den
    // Fall "Spieler stirbt an Frost-Drain, respawnt am Schloss".
    const distNow = Math.hypot(player.pos.x - this.arenaCenter.x, player.pos.z - this.arenaCenter.z);
    if (distNow > this.arenaR + RETREAT_LEASH_EXTRA) this.reset();
  }

  reset() {
    for (const d of this.dementors) d.repel();
    this.dementors = [];
    this.state = 'sealed';
    this.stateT = 0;
    this.alive = false;
    this.group.visible = false;
    this.frostFactor = 0;
    this._drainTimer = 0;
  }
}
