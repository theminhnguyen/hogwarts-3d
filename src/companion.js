// Begleiter (S9, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt 9): Musch (Katze,
// npc.js-Follow-FSM WIEDERVERWENDET — nicht dupliziert), Piniva (Eule,
// Eulerei), Grabbel (Niffler, Silberauen). Genau EIN aktiver Begleiter,
// Taste G ruft/schickt weg (döst in der Kate falls gekauft, sonst am
// eigenen Heimatort). Begleiter sind UNVERWUNDBAR und NIE Spruchziel
// (K10) — sie stehen in keiner Liste, die spells.js/creatures.js/
// wilderer.js für Kollision oder Cone-Scans abfragt.

import * as THREE from 'three';
import { terrainHeight, SILBERAUEN } from './terrain.js';
import { buildNifflerModel } from './fauna.js';
import { LENA_POS } from './npc.js';

const FOLLOW_STOP = 1.6;
const FOLLOW_TELEPORT = 25;
const FOLLOW_SPEED = { musch: 3.4, piniva: 6, grabbel: 3.8 };
const PROTECT_RANGE = 12;
const PROTECT_COOLDOWN = 2.5;
const DISARM_DUR = 3;

// Eulerei (structures.js EULEREI {x:95,z:-25,r:3}) — Piniva sitzt knapp
// außerhalb des Turms, wie die owlPerches-Konsolen aus W4.
const PINIVA_POS = { x: 95 + 3.6, z: -25 };
const PINIVA_FLY_HEIGHT = 2.2;
// Silberauen-Rand (300,60,r40) — Grabbels Loch, fernab von Fuchs-Revier
// (Mittelpunkt Silberauen/Hain) und Hippogreif-Ringspots.
const GRABBEL_POS = { x: SILBERAUEN.x - 18, z: SILBERAUEN.z + 14 };

function angleLerp(from, to, t) {
  let diff = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff * t;
}

// Kleines Eulen-Modell (eigenständig, nicht aus der props.js-LifeSystem-
// Ambiente-Population — Piniva ist eine benannte Figur mit Identität).
function buildPinivaModel() {
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x6a5438, flatShading: true, side: THREE.DoubleSide });
  const headMat = new THREE.MeshLambertMaterial({ color: 0x7a6248, flatShading: true });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcf6b });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), headMat);
  body.scale.set(0.9, 1.1, 1.3);
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 5), headMat);
  head.position.set(0, 0.16, 0.08);
  group.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), eyeMat);
    eye.position.set(s * 0.06, 0.18, 0.17);
    group.add(eye);
  }
  const wingGeo = new THREE.PlaneGeometry(0.4, 0.22);
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.position.set(s * 0.18, 0.02, 0);
    wing.rotation.y = s * 0.3;
    group.add(wing);
    wings.push(wing);
  }
  return { group, wings, body };
}

export function buildCompanion(scene, glowTex, hud, audio, fx, interact, economy, player, npc, deps) {
  // deps = { begleiter, heim, home, feroState, creatures, wilderer, collectibles }
  const { begleiter, heim, home, feroState, creatures, wilderer, collectibles } = deps;
  let currentPlayer = player;
  let onChange = null;

  let sky_nightGlow = () => 1; // von main.js über setNightGlowGetter() gesetzt (vermeidet sky-Import nur fürs Nacht-Gate)

  // ---------- Piniva: Modell + Freischalt-Interakt (Eulerei, nachts, 1 Frischfisch) ----------
  const piniva = buildPinivaModel();
  piniva.group.position.set(PINIVA_POS.x, terrainHeight(PINIVA_POS.x, PINIVA_POS.z) + PINIVA_FLY_HEIGHT, PINIVA_POS.z);
  piniva.t = 0;
  scene.add(piniva.group);

  interact.register({
    x: PINIVA_POS.x, z: PINIVA_POS.z, r: 3,
    get enabled() { return !begleiter.frei.includes('piniva') && sky_nightGlow() > 0.5; },
    get prompt() {
      return (feroState?.frischfisch || 0) > 0
        ? 'E — Piniva mit Frischfisch locken'
        : 'Piniva braucht Frischfisch (bei Fero am Bahnhof kaufen)';
    },
    onInteract: () => {
      if (!(feroState?.frischfisch > 0)) { hud.showToast('Du hast keinen Frischfisch dabei.', 2.2); return; }
      feroState.frischfisch--;
      begleiter.frei.push('piniva');
      begleiter.aktiv = 'piniva';
      hud.showToast('🦉 Piniva schließt sich dir an! (Taste G ruft/schickt sie weg)', 4.5);
      audio.chime?.('fanfare');
      fx.burst({ x: piniva.group.position.x, y: piniva.group.position.y + 0.5, z: piniva.group.position.z }, 0xffcf6b, 20, 3, { gravity: -1, life: 0.8 });
      summon('piniva');
      onChange?.();
    },
  });

  // ---------- Grabbel: Modell + Loch + Freischalt-Interakt (5 Gold) ----------
  const grabbel = buildNifflerModel();
  const gY = terrainHeight(GRABBEL_POS.x, GRABBEL_POS.z);
  grabbel.group.position.set(GRABBEL_POS.x, gY, GRABBEL_POS.z);
  grabbel.t = 0;
  scene.add(grabbel.group);
  const holeMat = new THREE.MeshLambertMaterial({ color: 0x241c14, flatShading: true });
  const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.1, 10), holeMat);
  hole.position.set(GRABBEL_POS.x, gY + 0.02, GRABBEL_POS.z - 0.5);
  scene.add(hole);

  interact.register({
    x: GRABBEL_POS.x, z: GRABBEL_POS.z - 0.5, r: 2,
    get enabled() { return !begleiter.frei.includes('grabbel'); },
    prompt: 'E — 5 Gold in Grabbels Loch legen',
    onInteract: () => {
      if (!economy.spendGold(5)) { hud.showToast('Nicht genug Gold.', 2); return; }
      begleiter.frei.push('grabbel');
      begleiter.aktiv = 'grabbel';
      hud.showToast('💰 Grabbel schnüffelt an dir — er folgt dir jetzt! (Taste G)', 4.5);
      audio.chime?.('fanfare');
      fx.burst({ x: hole.position.x, y: hole.position.y + 0.3, z: hole.position.z }, 0xffd54a, 18, 2.5, { gravity: -1, life: 0.7 });
      summon('grabbel');
      onChange?.();
    },
  });

  // ---------- Rufen & Wegschicken ----------
  let following = false;

  function activeGroup(id) {
    if (id === 'musch') return npc.muschGroup;
    if (id === 'piniva') return piniva.group;
    if (id === 'grabbel') return grabbel.group;
    return null;
  }

  // "döst in der Kate, falls gekauft, sonst Heimatort" (Plan).
  function restPos(id) {
    if (heim.kate && home?.restSpot) return home.restSpot;
    if (id === 'musch') return { x: LENA_POS.x + 1.1, z: LENA_POS.z + 0.6 };
    if (id === 'piniva') return { x: PINIVA_POS.x, y: terrainHeight(PINIVA_POS.x, PINIVA_POS.z) + PINIVA_FLY_HEIGHT, z: PINIVA_POS.z };
    if (id === 'grabbel') return { x: GRABBEL_POS.x, z: GRABBEL_POS.z };
    return null;
  }

  function summon(id) {
    if (!id) return;
    begleiter.aktiv = id;
    following = true;
    if (id === 'musch') npc.setMuschFollowing(true);
    audio.chime?.();
    const NAMES = { musch: 'Musch', piniva: 'Piniva', grabbel: 'Grabbel' };
    hud.showToast(`${NAMES[id]} folgt dir jetzt.`, 1.8);
  }

  function dismiss() {
    if (!following) return;
    const id = begleiter.aktiv;
    following = false;
    if (id === 'musch') npc.setMuschFollowing(false);
    const g = activeGroup(id);
    const p = restPos(id);
    if (g && p) {
      const py = p.y ?? terrainHeight(p.x, p.z);
      g.position.set(p.x, py, p.z);
    }
    hud.showToast('Abgeschickt — döst jetzt.', 1.6);
  }

  function toggle() {
    if (following) { dismiss(); onChange?.(); return; }
    const id = begleiter.aktiv || begleiter.frei[0];
    if (!id) { hud.showToast('Noch keinen Begleiter gefunden.', 2); return; }
    summon(id);
    onChange?.();
  }

  // ---------- Follow-AI für Piniva/Grabbel (Musch: npc.js übernimmt) ----------
  // Piniva-Passivum: kreist über dem nächsten fehlenden Schnatz statt dem
  // Spieler zu folgen, sobald er < 60m entfernt ist (sanfte Suchhilfe,
  // Plan Abschnitt 9) — Zielpunkt aus collectibles.nearest()s {dist,angle}
  // zurückgerechnet (dieselbe Winkel-Konvention wie dessen HUD-Tracker).
  function pinivaSearchTarget() {
    const info = collectibles?.nearest?.(currentPlayer.pos);
    if (!info || info.dist >= 60) return null;
    return { x: currentPlayer.pos.x + Math.sin(info.angle) * info.dist, z: currentPlayer.pos.z - Math.cos(info.angle) * info.dist };
  }

  function updateFollow(dt) {
    if (!following || begleiter.aktiv === 'musch') return;
    const id = begleiter.aktiv;
    const g = activeGroup(id);
    if (!g) return;
    const flying = id === 'piniva';
    const searchSpot = flying ? pinivaSearchTarget() : null;
    const targetX = searchSpot ? searchSpot.x : currentPlayer.pos.x;
    const targetZ = searchSpot ? searchSpot.z : currentPlayer.pos.z;
    const dx = targetX - g.position.x, dz = targetZ - g.position.z;
    const d = Math.hypot(dx, dz);
    if (!searchSpot && d > FOLLOW_TELEPORT) {
      const bx = currentPlayer.pos.x + Math.sin(currentPlayer.yaw) * 2.4;
      const bz = currentPlayer.pos.z + Math.cos(currentPlayer.yaw) * 2.4;
      const by = flying ? terrainHeight(bx, bz) + PINIVA_FLY_HEIGHT : terrainHeight(bx, bz);
      g.position.set(bx, by, bz);
    } else if (d > (searchSpot ? 0.5 : FOLLOW_STOP)) {
      const speed = FOLLOW_SPEED[id] || 3.5;
      const nx = dx / d, nz = dz / d;
      g.position.x += nx * speed * dt;
      g.position.z += nz * speed * dt;
      g.position.y = flying ? terrainHeight(g.position.x, g.position.z) + PINIVA_FLY_HEIGHT : terrainHeight(g.position.x, g.position.z);
      g.rotation.y = angleLerp(g.rotation.y, Math.atan2(nx, nz), Math.min(1, dt * 4));
    } else if (searchSpot) {
      // Kreisen über der Fundstelle statt still zu stehen.
      g.rotation.y += dt * 1.2;
    }
  }

  // ---------- Schutz-Verhalten: Feind < 12m vom Spieler ----------
  let protectCd = 0;
  function nearestHostile() {
    let best = null, bestD2 = PROTECT_RANGE * PROTECT_RANGE;
    for (const c of creatures?.list || []) {
      if (!c.alive) continue;
      const dx = c.pos.x - currentPlayer.pos.x, dz = c.pos.z - currentPlayer.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = c; }
    }
    for (const w of wilderer?.list || []) {
      if (!w.alive) continue;
      const dx = w.pos.x - currentPlayer.pos.x, dz = w.pos.z - currentPlayer.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = w; }
    }
    return best;
  }

  function updateProtect(dt) {
    if (!following) { protectCd = 0; return; }
    protectCd -= dt;
    if (protectCd > 0) return;
    const target = nearestHostile();
    if (!target) return;
    const id = begleiter.aktiv;
    if (id === 'grabbel') {
      // Grabbel klaut nur Wilderern den Stab — gegen andere Kreaturen tut er
      // nichts (Plan). Bereits entwaffnete Ziele NICHT erneut treffen, sonst
      // hält der 2.5s-Schutz-Cooldown < 3s-Entwaffnen-Dauer den Wilderer bei
      // andauernder Nähe für immer fest, statt nur "für 3s" (Plan-Wortlaut).
      if (target.species !== 'wilderer' || !target.disarm || target.state === 'entwaffnet') return;
      protectCd = PROTECT_COOLDOWN;
      target.disarm(DISARM_DUR);
      audio.nifflerSteal?.();
      hud.showToast('💰 Grabbel klaut dem Wilderer den Stab! (3s wehrlos)', 2.5);
      fx.burst({ x: target.pos.x, y: target.pos.y + 1, z: target.pos.z }, 0xffd54a, 14, 2.5, { gravity: -1, life: 0.5 });
    } else {
      protectCd = PROTECT_COOLDOWN;
      const dx = target.pos.x - currentPlayer.pos.x, dz = target.pos.z - currentPlayer.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      target.applyHit('claw', new THREE.Vector3(dx / d, 0.3, dz / d));
      if (id === 'musch') audio.catHiss?.();
      else audio.owlDive?.();
      fx.burst({ x: target.pos.x, y: target.pos.y + 0.6, z: target.pos.z }, 0xffe0a0, 12, 2.5, { gravity: -1.5, life: 0.4 });
    }
  }

  // ---------- Passiva ----------
  let hissT = 1;
  function updatePassives(dt) {
    if (!following) return;
    const id = begleiter.aktiv;
    if (id === 'musch') {
      hissT -= dt;
      if (hissT <= 0) {
        hissT = 3;
        const nearGhost = (creatures?.list || []).some((c) => c.species === 'ghost' && c.alive
          && Math.hypot(c.pos.x - currentPlayer.pos.x, c.pos.z - currentPlayer.pos.z) < 15);
        if (nearGhost) audio.catHiss?.();
      }
    }
  }

  return {
    toggle,
    set onChange(fn) { onChange = fn; },
    // main.js speist den echten nightGlow-Wert (kein sky-Import nur für ein Gate).
    setNightGlowGetter(fn) { sky_nightGlow = fn; },
    get following() { return following; },

    update(dt, player_) {
      currentPlayer = player_;
      piniva.t += dt;
      const bob = following && begleiter.aktiv === 'piniva' ? Math.sin(piniva.t * 3) * 0.08 : Math.sin(piniva.t * 1.2) * 0.03;
      for (const w of piniva.wings) w.rotation.z = Math.sin(piniva.t * (following && begleiter.aktiv === 'piniva' ? 10 : 2)) * 0.3;
      piniva.body.position.y = bob;

      grabbel.t += dt;
      grabbel.body.position.y = 0.16 + Math.sin(grabbel.t * 1.6) * 0.03;

      updateFollow(dt);
      updateProtect(dt);
      updatePassives(dt);
    },

    // Reset-Button + initialer Load: kompletter visueller Sync (Lehre 15).
    restore() {
      following = false;
      npc.setMuschFollowing(false);
      piniva.group.position.set(PINIVA_POS.x, terrainHeight(PINIVA_POS.x, PINIVA_POS.z) + PINIVA_FLY_HEIGHT, PINIVA_POS.z);
      grabbel.group.position.set(GRABBEL_POS.x, terrainHeight(GRABBEL_POS.x, GRABBEL_POS.z), GRABBEL_POS.z);
    },
  };
}
