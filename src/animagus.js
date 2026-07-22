// S11 Animagus (PLAN-SCHATTEN-UND-SCHWINGEN.md): Ritual am Steinkreis
// (Trank "der zweiten Gestalt" aus home.js, nur im Sturm gültig) schaltet
// 3 Tierformen frei (Rabe/Katze/Wolf), Taste V wechselt Mensch/Tier.
// Bewegung/Kamera laufen komplett über player.js-Felder (flying+
// flightTuning für den Raben, animagusSpeed+eyeHeight für Katze/Wolf) —
// dieses Modul setzt nur diese Felder, keine eigene Bewegungslogik.

import * as THREE from 'three';
import { terrainHeight, STONES } from './terrain.js';
import { RAVEN_FLIGHT } from './flight.js';
import { EYE } from './player.js';

export const FORM_ORDER = ['rabe', 'katze', 'wolf'];
export const FORM_LABEL = { rabe: 'Rabe', katze: 'Katze', wolf: 'Wolf' };
const FORM_EMOJI = { rabe: '🐦‍⬛', katze: '🐈', wolf: '🐺' };

const CAT_SPEED = 9;
const WOLF_SPEED = 13;
const CAT_EYE = 0.5;
const WOLF_EYE = 1.15;

const V_TAP_WINDOW = 0.4; // s — Muster mount.js TAKEOFF_TAP_WINDOW
const BITE_RANGE = 2.0;
const BITE_HALF_ANGLE = 0.8; // ~46° Kegel, Muster mount.js Kampf-Tritt
const BITE_COOLDOWN = 1.2;
const FLAP_INTERVAL = 0.5; // s zwischen Flügelschlag-Sounds im Flug (Rabe)

export function buildAnimagus(scene, glowTex, hud, audio, fx, interact, player, deps) {
  const { animagus, heim, weather } = deps;
  let onChange = null;
  let combatTargets = [];
  let pendingToggle = false;
  let pendingToggleT = 0;
  let biteCd = 0;
  let flapT = 0;

  // Ritual-Marker am Steinkreis-Zentrum — pulsiert nur, solange der Trank
  // aktiv UND das Ritual noch nicht vollzogen ist (Einladung statt Zwang,
  // Muster home.js-Sternsplitter-Glow).
  const markerY = terrainHeight(STONES.x, STONES.z) + 1.7;
  const markerMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9a6fe0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const marker = new THREE.Sprite(markerMat);
  marker.position.set(STONES.x, markerY, STONES.z);
  marker.scale.setScalar(1.3);
  scene.add(marker);

  interact.register({
    x: STONES.x, z: STONES.z, r: 4,
    get enabled() { return !animagus.gelernt && heim.trank.id === 'animagus' && heim.trank.restT > 0; },
    prompt: 'E — Ritual der zweiten Gestalt beginnen',
    onInteract: () => {
      if (weather.state !== 'sturm') {
        hud.showToast('⛈️ Nur im tosenden Sturm entfaltet der Trank seine Kraft …', 3);
        return;
      }
      heim.trank.id = '';
      heim.trank.restT = 0;
      animagus.gelernt = 1;
      hud.showToast(`⚡ Verwandelt! Du bist jetzt Animagus — Gestalt: ${FORM_LABEL[animagus.form]} (Taste V, im Menü wählbar).`, 5);
      audio.ritualChant?.();
      fx.burst({ x: STONES.x, y: markerY, z: STONES.z }, 0x9a6fe0, 34, 4.5, { gravity: -1.5, life: 1.2 });
      fx.shake?.(0.15);
      onChange?.();
    },
  });

  function applyForm(form) {
    player.animalForm = form;
    if (form === 'rabe') {
      player.flying = true;
      player.flightTuning = RAVEN_FLIGHT;
      player.eyeHeight = 1.0;
    } else if (form === 'katze') {
      player.animagusSpeed = CAT_SPEED;
      player.eyeHeight = CAT_EYE;
    } else if (form === 'wolf') {
      player.animagusSpeed = WOLF_SPEED;
      player.eyeHeight = WOLF_EYE;
    }
  }

  function clearForm() {
    player.animalForm = null;
    player.animagusSpeed = 0;
    player.eyeHeight = EYE;
    if (player.flying) { player.flying = false; player.flightTuning = null; }
  }

  function toggleForm() {
    if (!animagus.gelernt) {
      hud.showToast('Du hast das Ritual der zweiten Gestalt noch nicht vollzogen.', 2.5);
      return;
    }
    if (player.animalForm) {
      clearForm();
      hud.showToast('✨ Zurückverwandelt.', 1.6);
      audio.chime?.();
    } else {
      if (player.swimming) { hud.showToast('Nicht im Wasser — erst an Land verwandeln.', 2); return; }
      if (player.flying || player.riding) { hud.showToast('Erst landen/absteigen.', 2); return; }
      applyForm(animagus.form);
      hud.showToast(`${FORM_EMOJI[animagus.form]} ${FORM_LABEL[animagus.form]}-Gestalt!`, 1.8);
      audio.chime?.();
    }
  }

  // Wolf-Biss (V-Doppeldruck) — Kegel-Nahkampf, exakt das Muster von
  // mount.js' Kampf-Tritt (tryKick), nur mit anderen Werten/Ziel-Id.
  function bite() {
    if (player.animalForm !== 'wolf' || biteCd > 0) return;
    const cosY = Math.cos(player.yaw), sinY = Math.sin(player.yaw);
    const fwdX = -sinY, fwdZ = -cosY;
    let best = null, bestD = BITE_RANGE;
    for (const c of combatTargets) {
      if (!c.alive) continue;
      const dx = c.pos.x - player.pos.x, dz = c.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > BITE_RANGE || d < 0.05) continue;
      const dot = (dx / d) * fwdX + (dz / d) * fwdZ;
      if (dot < Math.cos(BITE_HALF_ANGLE)) continue;
      if (d < bestD) { best = c; bestD = d; }
    }
    biteCd = BITE_COOLDOWN;
    if (!best) return;
    best.applyHit('bite', new THREE.Vector3(0, 0, 0));
    fx.burst({ x: best.pos.x, y: best.pos.y + 0.5, z: best.pos.z }, 0xe8e0d0, 8, 2.5, { gravity: -2, life: 0.3 });
    audio.mountKick?.();
  }

  // Taste V: einfacher Druck wechselt sofort Mensch<->Tier — AUSSER der
  // Spieler ist bereits Wolf, dann wird kurz auf einen zweiten Druck
  // gewartet (V_TAP_WINDOW, in update() abgezählt): kommt er, beißt der
  // Wolf statt sich zurückzuverwandeln; kommt keiner, wird ganz normal
  // (nur mit der kurzen, kaum spürbaren Verzögerung) zurückgewechselt.
  // Kein setTimeout — läuft über denselben dt-Takt wie alles andere.
  function handleVKey() {
    if (pendingToggle && player.animalForm === 'wolf') {
      pendingToggle = false;
      bite();
      return;
    }
    if (player.animalForm === 'wolf' && animagus.gelernt) {
      pendingToggle = true;
      pendingToggleT = V_TAP_WINDOW;
      return;
    }
    toggleForm();
  }

  return {
    set onChange(fn) { onChange = fn; },
    handleVKey,
    bite,

    update(dt, combatTargets_, nightGlow) {
      combatTargets = combatTargets_;
      if (biteCd > 0) biteCd -= dt;
      if (pendingToggle) {
        pendingToggleT -= dt;
        if (pendingToggleT <= 0) { pendingToggle = false; toggleForm(); }
      }
      // Rabe: Flügelschlag-Sound+Staubspur im Flug (Muster mount.js
      // updateFlapSound — kein sichtbares Flügel-Mesh im Ego-Blick nötig).
      if (player.animalForm === 'rabe' && player.flying) {
        flapT += dt;
        if (flapT >= FLAP_INTERVAL) {
          flapT = 0;
          audio.mountFlap?.();
          fx.trail?.({ x: player.pos.x, y: player.pos.y - 0.2, z: player.pos.z }, 0x2a2a30);
        }
      } else {
        flapT = 0;
      }
      // Wolf: Nachtsicht hellt die Nacht-Vignette auf.
      hud.setNightVision?.(player.animalForm === 'wolf' ? nightGlow : 0);
      // Ritual-Marker-Puls.
      const ready = !animagus.gelernt && heim.trank.id === 'animagus' && heim.trank.restT > 0;
      markerMat.opacity = ready ? 0.55 + Math.sin(performance.now() * 0.004) * 0.25 : 0;
    },

    restore() {
      clearForm();
      pendingToggle = false;
      biteCd = 0;
    },
  };
}
