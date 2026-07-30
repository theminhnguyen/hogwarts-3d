// Der Dunkle Lord (PLAN-DER-DUNKLE-LORD.md): letzter Endboss in der
// Schattenfeste. FSM nach dem PaleKing-Muster (hallows.js) — sealed→rising→
// (Phasen 1-5)→gone, applyHit(), Arena-Leine, kein neues Kernsystem.
//
// V3 lieferte Phase 1 ("Der Schild aus schwarzem Feuer" — nur Eisblitz
// durchdringt ihn) und Phase 2 ("Die Woge" — 5 arena-gebundene Dementoren,
// nur Expecto Patronum vertreibt sie).
// V4 (dieser Stand) ergänzt:
//  - Phase 3 "Der Blick, dem nichts entgeht" (Umhang der Unsichtbarkeit):
//    der Lord verfolgt den Spieler mit dem Blick und reflektiert jeden
//    Treffer von vorn (halber Schaden auf den Spieler zurück) — nur
//    unsichtbar (player.invisible) verliert er die Spur, dann zählt ein
//    Treffer von hinten (>100° zur Blickrichtung) echt.
//  - Phase 4 "Avada Kedavra" (Stein der Wiederkehr): langer Telegraph (2.5s),
//    dann ein unausweichlicher health.damage() auf 0 — health.onLethalHit
//    ist bereits der bestehende Haken, an dem hallows.js die Wiederbelebung
//    hängt (kein neuer Code für die Rettung nötig). Warnt vorher, falls der
//    Stein heute schon verbraucht ist.
//  - Phase 5 "Das Duell der Stäbe" (Elderstab): letzte HP-Leiste mit
//    Regeneration — ohne Elderstab reicht der DPS rechnerisch nicht (siehe
//    Plan Abschnitt 8), mit Elderstab schon. Kein neuer Angriff des Lords
//    hier, die Leiste selbst ist die Rückmeldung.
//  - Verbannungs-Sicherheitsnetz: 90s ohne Fortschritt in Phase 1/2/3
//    (den Phasen, in denen ganz ohne den richtigen Buff nichts passiert)
//    verbannt den Spieler statt ihn ewig festzuhalten — Weißblende, Teleport
//    zum Schloss, Dialog mit dem fehlenden Buff. Phase 4 ist zeitlich
//    begrenzt (immer auflösend), Phase 5 hat mit der kriechenden Leiste
//    bereits ihre eigene Rückmeldung (siehe Plan) — beide brauchen die
//    Verbannung nicht.
// Belohnung (Gold/Ruf), Titel und Atmosphäre-Feuerwerk nach dem Sieg folgen
// bewusst erst in V5/V6 (eigene Meilensteine im Plan) — V4 setzt nur
// `lord.besiegt`, damit der Sieg überhaupt feststellbar/testbar ist.
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
const PHASE3_HITS_NEEDED = 3;
const REFLECT_DAMAGE_FRAC = 0.5; // "halber Schaden auf den Spieler" (Plan Abschnitt 4, Phase 3)
const BEHIND_ANGLE_DEG = 100; // Plan: "Winkel > 100° zur Blickrichtung"
const PHASE4_TELEGRAPH_DUR = 2.5;
const PHASE5_HP = 60;
// "Kernwert" laut Plan Abschnitt 8 (dort mit der vollen DPS-Rechnung belegt:
// ohne Elderstab ≈1.55 DPS -> Netto ≈+0.05, mit Elderstab ≈5.19 DPS -> Netto
// ≈3.69). Der Fließtext in Abschnitt 4 nennt abweichend 0.9 — das ist ein
// Plan-interner Widerspruch, hier bewusst der Wert aus der belegten
// Rechnung übernommen. V8 verifiziert das empirisch am echten Spielverhalten.
const PHASE5_REGEN = 1.5;
const STALL_BANISH_AFTER = 90; // Plan: "Wenn Buffs fehlen: die Verbannung"
const BANISH_TELEPORT = { x: 0, z: 30, yaw: Math.PI }; // Muster: health.js TUNING.respawnPos (Schlosshof)
const BANISH_FADE_DUR = 1.0;

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// Gemeinsame Schadenstabelle für Phase 3 (Reflexion) und Phase 5 (Duell) —
// Muster: Ghost/Troll/fauna.js/npc.js. avada ist bewusst KEIN Instakill
// (Boss-Ausnahme wie beim Troll) — sonst würde ein einziger verbotener
// Fluch die ganze Phase trivialisieren (und thematisch: Voldemort überlebt
// Avada Kedavra ohnehin, das ist buchstäblich seine Vorgeschichte).
function lordDamage(spellId) {
  return spellId === 'avada' ? 4
    : spellId === 'incendio' ? 2
    : spellId === 'crucio' ? 0.25
    : (spellId === 'stupor' || spellId === 'kick' || spellId === 'claw') ? 1 : 0;
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
    this.alive = false; // erst ab Phase 1 ein gültiges Spruchziel (Muster: PaleKing)
    this.radius = 0.6;
    this.hitY = 1.6; // buildFigure()-Kopf bei lokal y=1.28, ×1.25 Skalierung ≈ 1.6
    // sealed|rising|p1|p1_break|p2_summon|p2_wait|p3|p4_telegraph|p4_resolve|p5|banished|gone
    this.state = 'sealed';
    this.stateT = 0;
    this.arenaCenter = arenaCenter;
    this.arenaR = arenaR;
    this.phase = 0;
    this.phase1Hits = 0;
    this.phase1StallT = 0;
    this.phase1ToastShown = false;
    this.phase2StallT = 0;
    this._p2LastRemaining = PHASE2_COUNT;
    this.phase3Hits = 0;
    this.phase3StallT = 0;
    this.hp = PHASE5_HP;
    this.maxHp = PHASE5_HP;
    this.banishFadeT = 0;
    this.lastPlayer = null; // für applyHit() außerhalb von update() (Phase 3 Winkel-Check)
    this.dementors = [];
    this.dementorParts = buildDementorParts(glowTex);
    this.frostFactor = 0;
    this._drainTimer = 0;
    this.onPhaseReached = null; // schattenfeste.js hängt hier lord.phaseMax-Persistenz ein
    this.onDefeated = null; // schattenfeste.js hängt hier lord.besiegt-Persistenz ein

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

    // Phase 4: grüner Lichtkegel-Telegraph vor dem unausweichlichen Fluch.
    this.telegraphMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x2ecc40, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.telegraph = new THREE.Sprite(this.telegraphMat);
    this.telegraph.scale.setScalar(1);
    this.telegraph.position.y = 1.3;
    this.group.add(this.telegraph);

    system.scene.add(this.group);
  }

  // hud.setBoss() erwartet 0..1 (oder null für "keine Bossbar"). Phase 1
  // zählt Schild-Treffer, Phase 2 verbliebene Dementoren, Phase 3 Treffer
  // von hinten, Phase 5 echtes hp/maxHp (die einzige Phase mit kontinuier-
  // licher HP-Leiste, siehe Plan-Design "die Leiste ist die Rückmeldung").
  get bossFrac() {
    if (this.state === 'p1') return Math.max(0, 1 - this.phase1Hits / PHASE1_HITS_NEEDED);
    if (this.state === 'p2_summon' || this.state === 'p2_wait') {
      const remaining = this.dementors.filter(d => d.state === 'active').length;
      return Math.max(0, remaining / PHASE2_COUNT);
    }
    if (this.state === 'p3') return Math.max(0, 1 - this.phase3Hits / PHASE3_HITS_NEEDED);
    if (this.state === 'p5') return Math.max(0, this.hp / this.maxHp);
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

  applyHit(spellId, _boltVel, dmgMul = 1) {
    // ---------- Phase 1: nur Eisblitz durchdringt den Schild ----------
    if (this.state === 'p1') {
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

    // ---------- Phase 3: Reflexion von vorn, echter Treffer von hinten ----------
    if (this.state === 'p3') {
      const dmg = lordDamage(spellId);
      if (dmg <= 0) return true;
      const player = this.lastPlayer;
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const angleToPlayer = Math.atan2(dx, dz);
      const diffDeg = Math.abs(((angleToPlayer - this.group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI) * 180 / Math.PI;
      if (diffDeg > BEHIND_ANGLE_DEG) {
        this.phase3Hits++;
        this.phase3StallT = 0;
        this.system.fx.burst(
          { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
          0x9fe0ff, 16, 3, { gravity: -2, life: 0.5 },
        );
        this.system.audio?.lordShieldCrack?.();
        if (this.phase3Hits >= PHASE3_HITS_NEEDED) this._startPhase4();
        return false;
      }
      // Von vorn getroffen: der Fluch wird reflektiert, halber Schaden trifft
      // den Spieler statt den Lord (Plan Abschnitt 4, Phase 3).
      if (!this.system.peaceful) {
        const dirX = dx / d, dirZ = dz / d;
        this.system.health.damage(dmg * dmgMul * REFLECT_DAMAGE_FRAC, { x: dirX, y: 0, z: dirZ });
      }
      this.system.fx.burst({ x: player.pos.x, y: player.pos.y + 1, z: player.pos.z }, 0x9a1030, 10, 2.5, { gravity: -1, life: 0.4 });
      this.system.audio?.spellFizzle?.();
      return true; // unterdrückt den (falschen) Einschlag-Effekt am Lord selbst
    }

    // ---------- Phase 5: reguläres Duell (HP + Regeneration) ----------
    if (this.state === 'p5') {
      const dmg = lordDamage(spellId);
      if (dmg <= 0) return false;
      this.hp -= dmg * dmgMul;
      this.system.fx.burst(
        { x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z },
        0x9fe0ff, 14, 3, { gravity: -2, life: 0.5 },
      );
      this.system.audio?.lordShieldCrack?.();
      if (this.hp <= 0) this._defeat();
      return false;
    }

    return true; // alle anderen Zustände: alive=false, spells.js ruft dies ohnehin nie auf
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
    this.phase2StallT = 0;
    this._p2LastRemaining = PHASE2_COUNT;
    this.system.audio?.lordSummon?.();
    this.system.hud?.showToast('👻 Der Dunkle Lord beschwört eine Woge aus Dementoren!', 3.5);
    this.onPhaseReached?.(2);
  }

  _startPhase3() {
    this.phase = 3;
    this.state = 'p3';
    this.stateT = 0;
    this.alive = true; // wieder ein gültiges Spruchziel (Reflexion/Treffer von hinten)
    this.phase3Hits = 0;
    this.phase3StallT = 0;
    this.frostFactor = 0;
    this.system.hud?.showToast('🖤 „Beeindruckend … aber das war erst der Anfang." Der Dunkle Lord lässt kurz von dir ab.', 4);
    this.onPhaseReached?.(3);
  }

  _startPhase4() {
    this.phase = 4;
    this.state = 'p4_telegraph';
    this.stateT = 0;
    this.alive = false; // während des Telegraphs/Fluchs unverwundbar
    this._p4Judged = false; // s. p4_resolve: verhindert Mehrfachauswertung von health.dead
    const steinOnCooldown = this.system.hallowsSys?.steinActive && (this.system.hallowsSave?.steinCd || 0) > 0;
    if (steinOnCooldown) {
      this.system.hud?.showToast('💎 Der Stein ist heute schon verbraucht — kein Netz diesmal.', 4.5);
    }
    this.system.audio?.lordAvadaCharge?.();
    this.onPhaseReached?.(4);
  }

  _castAvada(player) {
    this.system.fx.burst({ x: player.pos.x, y: player.pos.y + 1, z: player.pos.z }, 0x2ecc40, 30, 3, { gravity: -1, life: 0.8 });
    if (!this.system.peaceful) {
      // Genug Schaden, um IMMER auf 0 zu gehen (health.js klemmt hearts nie
      // über effectiveMaxHearts) — health.onLethalHit ist bereits der Haken,
      // an dem hallows.js den Stein der Wiederkehr einhängt (kein neuer Code
      // für die Rettung nötig, siehe Plan).
      this.system.health.damage(this.system.health.effectiveMaxHearts, null);
    }
  }

  _startPhase5() {
    this.phase = 5;
    this.state = 'p5';
    this.stateT = 0;
    this.alive = true;
    this.hp = PHASE5_HP;
    this.maxHp = PHASE5_HP;
    this.system.hud?.showToast('😨 „Das … das hätte nicht geschehen dürfen." Der Dunkle Lord ist einen Moment fassungslos.', 4.5);
    this.system.audio?.lordShieldBreak?.();
    this.onPhaseReached?.(5);
  }

  _defeat() {
    this.state = 'gone';
    this.alive = false;
    this.hp = 0;
    this.group.visible = false;
    this.system.audio?.lordDefeat?.();
    this.system.fx.burst({ x: this.pos.x, y: this.pos.y + this.hitY, z: this.pos.z }, 0x2a0030, 50, 6, { gravity: -1, life: 1.4 });
    this.onDefeated?.();
  }

  // Verbannung (Plan: "Wenn Buffs fehlen"): setzt den Versuch zurück wie
  // reset(), aber mit Weißblende + Teleport + erklärendem Dialog statt
  // stillem Abbruch — nur für Phase 1-3 relevant (siehe Datei-Kopfkommentar).
  _banish(player, msg) {
    this.reset();
    this.system.hud?.setWhiteout(1);
    player.teleport(BANISH_TELEPORT.x, BANISH_TELEPORT.z, BANISH_TELEPORT.yaw);
    this.system.audio?.lordBanish?.();
    this.system.hud?.showDialog('Der Dunkle Lord', [
      'Er lässt dich mit einer Handbewegung verschwinden — noch bist du ihm nicht gewachsen.',
      msg,
    ]);
    this.state = 'banished';
    this.banishFadeT = BANISH_FADE_DUR;
  }

  update(dt, player) {
    this.system.time += dt;
    this.lastPlayer = player;
    switch (this.state) {
      case 'sealed': case 'gone': return;
      case 'banished': {
        this.banishFadeT -= dt;
        this.system.hud?.setWhiteout(Math.max(0, this.banishFadeT) / BANISH_FADE_DUR);
        if (this.banishFadeT <= 0) {
          this.system.hud?.setWhiteout(0);
          this.state = 'sealed';
        }
        return;
      }
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
        if (this.phase1StallT >= STALL_BANISH_AFTER) {
          this._banish(player, 'Ohne Eisblitz durchdringt kein Zauber diesen Schild — lerne ihn am Eisaltar der Frostzinnen.');
          return;
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
        let remaining = 0;
        for (const d of this.dementors) {
          d.update(dt, player);
          if (d.state === 'active') {
            remaining++;
            const dist = Math.hypot(d.pos.x - player.pos.x, d.pos.z - player.pos.z);
            if (dist < nearestDist) nearestDist = dist;
          }
        }
        if (remaining < this._p2LastRemaining) this.phase2StallT = 0;
        this._p2LastRemaining = remaining;
        this.phase2StallT += dt;
        if (this.phase2StallT >= STALL_BANISH_AFTER) {
          this._banish(player, 'Ohne Expecto Patronum vertreibst du diese Dementoren nie — gewinne zuerst den Hauspokal.');
          return;
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
        if (remaining === 0) this._startPhase3();
        break;
      }
      case 'p3': {
        this.phase3StallT += dt;
        if (this.phase3StallT >= STALL_BANISH_AFTER) {
          this._banish(player, 'Sein Blick durchbohrt dich, solange er dich sieht — nur der Umhang der Unsichtbarkeit lässt dich unbemerkt hinter ihn treten.');
          return;
        }
        if (!player.invisible) {
          const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
          this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3));
        }
        break;
      }
      case 'p4_telegraph': {
        this.stateT += dt;
        const f = Math.min(1, this.stateT / PHASE4_TELEGRAPH_DUR);
        this.telegraphMat.opacity = f * 0.85;
        this.telegraph.scale.setScalar(1 + f * 2);
        const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
        this.group.rotation.y = angleLerp(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 4));
        if (this.stateT >= PHASE4_TELEGRAPH_DUR) {
          this.telegraphMat.opacity = 0;
          this._castAvada(player);
          this.state = 'p4_resolve';
          this.stateT = 0;
        }
        return;
      }
      case 'p4_resolve': {
        this.stateT += dt;
        // `_p4Judged` fängt den EINEN Moment ein, in dem health.dead die
        // richtige Antwort gibt — sonst würde derselbe Check hier auch noch
        // Sekunden später erneut auswerten, sobald health.js nach dem
        // "echten Tod" (kein Stein) den Spieler respawnt und dead wieder
        // auf false setzt, und fälschlich doch noch Phase 5 starten.
        if (this.stateT >= 0.15 && !this._p4Judged) {
          this._p4Judged = true;
          if (!this.system.health.dead) {
            this._startPhase5();
          }
          // Echter Tod (kein Stein aktiv/verfügbar): bewusst KEIN sofortiges
          // reset() hier — health.js braucht bis zu 1s (Weißblende), bevor
          // der Spieler tatsächlich zum Schloss teleportiert wird. Ein
          // sofortiger reset() würde den Lord auf 'sealed' setzen, während
          // der Spieler noch physisch in der Arena steht — die Ward-Prüfung
          // oben triggert ihn dann augenblicklich neu, bevor der Tod
          // überhaupt sichtbar wurde (im Browser gefunden: Zustand sprang
          // direkt zurück auf 'rising'). Stattdessen fällt dieser Zweig
          // einfach durch zum generischen Rückzugs-Reset unten, der erst
          // greift, sobald die Distanz nach dem echten Teleport stimmt.
        }
        break;
      }
      case 'p5': {
        this.hp = Math.min(this.maxHp, this.hp + PHASE5_REGEN * dt);
        this.group.rotation.y += 0.08 * dt;
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
    this.phase3Hits = 0;
    this.phase3StallT = 0;
    this.telegraphMat.opacity = 0;
    this.hp = PHASE5_HP;
    this.maxHp = PHASE5_HP;
  }
}
