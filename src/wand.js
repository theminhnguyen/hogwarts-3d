// Zauberstab in Ego-Perspektive: prozedurales Modell als Kind der Kamera,
// Animations-Zustandsmaschine (Idle/Gehen/Sprint/Cast/Spruchwechsel),
// Spitzen-Glow & -Licht, Spruchwahl. Alle Offsets sind additiv auf die
// Grundpose — nie die Basis überschreiben, immer Basis + Offset rechnen.

import * as THREE from 'three';
import { GeoBatch } from './geo.js';

export const SPELLS = {
  stupor:   { name: 'Stupor',   emoji: '⚡', color: 0xff4a4a, cooldown: 0.45 },
  incendio: { name: 'Incendio', emoji: '🔥', color: 0xff9a2e, cooldown: 0.9 },
  leviosa:  { name: 'Leviosa',  emoji: '🪄', color: 0xb08cff, cooldown: 0.2 },
  lumos:    { name: 'Lumos',    emoji: '💡', color: 0x9fc4ff, cooldown: 0.3 },
};
export const SPELL_ORDER = ['stupor', 'incendio', 'leviosa', 'lumos'];

const BASE_POS = new THREE.Vector3(0.28, -0.24, -0.45);
const BASE_ROT = new THREE.Euler(-0.1, 0.15, 0.05);

const CAST_OUT = 0.18;   // Flick nach vorn
const CAST_BACK = 0.22;  // zurück in Ruhepose
const SWITCH_DUR = 0.15;

function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t) { return t * t * t; }

export class WandSystem {
  constructor(camera, glowTex) {
    this.camera = camera;
    this.activeSpell = 'stupor';
    this.t = 0;
    this.castT = -1;     // -1 = keine Cast-Animation aktiv
    this.switchT = -1;   // -1 = kein Spruchwechsel-Dreher aktiv
    this.sprintBlend = 0;
    this.holdBlend = 0;

    this.root = new THREE.Group();
    this.root.position.copy(BASE_POS);
    this.root.rotation.copy(BASE_ROT);
    camera.add(this.root);

    // ---------- Modell (~200 Dreiecke) ----------
    const batch = new GeoBatch();
    // Griff + Zierringe
    batch.add(new THREE.CylinderGeometry(0.019, 0.021, 0.12, 7), 0x2e1d12, 0, -0.19, 0);
    const ring1 = new THREE.TorusGeometry(0.0205, 0.004, 5, 8);
    ring1.rotateX(Math.PI / 2); ring1.translate(0, -0.145, 0);
    batch.addRaw(ring1, 0x2e1d12);
    const ring2 = new THREE.TorusGeometry(0.0205, 0.004, 5, 8);
    ring2.rotateX(Math.PI / 2); ring2.translate(0, -0.235, 0);
    batch.addRaw(ring2, 0x2e1d12);
    // Schaft: zwei leicht versetzte Segmente = wirkt gebogen
    const shaftA = new THREE.CylinderGeometry(0.013, 0.016, 0.22, 7);
    shaftA.translate(0, -0.02, 0);
    batch.addRaw(shaftA, 0x4a3020);
    const shaftB = new THREE.CylinderGeometry(0.007, 0.013, 0.22, 7);
    shaftB.rotateZ(0.05);
    shaftB.translate(0.006, 0.19, 0);
    batch.addRaw(shaftB, 0x4a3020);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = batch.build(mat, { castShadow: false, receiveShadow: false });
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);

    // ---------- Spitze ----------
    this.tip = new THREE.Object3D();
    this.tip.position.set(0.007, 0.31, 0);
    this.root.add(this.tip);
    const tipBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 6, 5),
      new THREE.MeshBasicMaterial({ color: 0xe8dfc8 })
    );
    this.tip.add(tipBall);

    // Spitzen-Glow (Farbe des aktiven Zaubers, pulsiert, ×2.2 beim Cast)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: SPELLS.stupor.color, transparent: true,
      opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.glow.scale.setScalar(0.06);
    this.tip.add(this.glow);

    // Spitzen-Licht: 0 im Idle, blitzt beim Cast auf, klingt in 0.25s ab.
    // Lumos-Dauerglühen wird in Phase 4 hier angeschlossen (Migration).
    this.tipLight = new THREE.PointLight(SPELLS.stupor.color, 0, 6, 2.0);
    this.tip.add(this.tipLight);
  }

  // Weltposition der Stabspitze (für Bolzen-Abschuss)
  get tipWorldPos() {
    const v = new THREE.Vector3();
    this.tip.getWorldPosition(v);
    return v;
  }

  selectSpell(id) {
    if (id === this.activeSpell || !SPELLS[id]) return;
    this.activeSpell = id;
    this.switchT = 0;
  }

  cycleSpell(dir) {
    const i = SPELL_ORDER.indexOf(this.activeSpell);
    const next = SPELL_ORDER[(i + dir + SPELL_ORDER.length) % SPELL_ORDER.length];
    this.selectSpell(next);
  }

  playCast() {
    this.castT = 0;
  }

  // player: liefert bobPhase/grounded; move: { hSpeed, sprinting } von player.update()
  update(dt, player, move, lumosOn = false, holding = false) {
    this.t += dt;
    const hSpeed = move ? move.hSpeed : 0;
    const sprinting = move ? move.sprinting : false;
    const grounded = player ? player.grounded : true;
    const bobPhase = player ? player.bobPhase : 0;

    // Idle-Atmen (immer aktiv) + Gehen (additiv, nutzt player.bobPhase)
    let offX = 0;
    let offY = Math.sin(this.t * 1.6) * 0.004;
    let offRotZ = Math.sin(this.t * 1.1) * 0.01;
    let offRotX = 0;
    if (grounded && hSpeed > 0.5) {
      offY += Math.sin(bobPhase * 2) * 0.012;
      offX += Math.cos(bobPhase) * 0.008;
    }

    // Sprint: Stab neigt sich nach vorn-unten (sanft eingeblendet)
    const sprintTarget = sprinting && hSpeed > 7 ? 1 : 0;
    this.sprintBlend += (sprintTarget - this.sprintBlend) * Math.min(1, dt * 4);
    offRotX += -0.35 * this.sprintBlend;
    offY += -0.05 * this.sprintBlend;

    // Leviosa-Halten: Stab zeigt leicht nach oben, Spitze kreist minimal
    this.holdBlend += ((holding ? 1 : 0) - this.holdBlend) * Math.min(1, dt * 5);
    offRotX += 0.2 * this.holdBlend;
    if (this.holdBlend > 0.01) {
      const cr = 0.005 * this.holdBlend;
      this.glow.position.x = Math.cos(this.t * 2) * cr;
      this.glow.position.z = Math.sin(this.t * 2) * cr;
    } else {
      this.glow.position.x = 0;
      this.glow.position.z = 0;
    }

    // Cast-Flick: 180ms hin (easeOut), 220ms zurück (easeIn)
    let castFlash = 0;
    let castScale = 1;
    if (this.castT >= 0) {
      this.castT += dt;
      const elapsed = this.castT; // vor einem möglichen Reset auf -1 sichern
      if (elapsed < CAST_OUT) {
        offRotX += lerp(-0.5, 0.15, easeOutCubic(elapsed / CAST_OUT));
        castScale = lerp(1, 2.2, easeOutCubic(elapsed / CAST_OUT));
      } else if (elapsed < CAST_OUT + CAST_BACK) {
        offRotX += lerp(0.15, 0, easeInCubic((elapsed - CAST_OUT) / CAST_BACK));
      } else {
        this.castT = -1;
      }
      castFlash = Math.max(0, 1 - elapsed / 0.4);
    }

    // Spruchwechsel: kleiner Dreher um Z
    if (this.switchT >= 0) {
      this.switchT += dt;
      if (this.switchT < SWITCH_DUR) {
        offRotZ += Math.sin((this.switchT / SWITCH_DUR) * Math.PI) * 0.4;
      } else {
        this.switchT = -1;
      }
    }

    this.root.position.set(BASE_POS.x + offX, BASE_POS.y + offY, BASE_POS.z);
    this.root.rotation.set(BASE_ROT.x + offRotX, BASE_ROT.y, BASE_ROT.z + offRotZ);

    // Glow: Grundfarbe des aktiven Spruchs, leichtes Pulsieren, Cast-Aufblitzen
    const spell = SPELLS[this.activeSpell];
    const pulse = 0.9 + Math.sin(this.t * 3) * 0.1;
    this.glow.scale.setScalar(0.06 * pulse * castScale);
    this.glow.material.color.setHex(spell.color);
    this.glow.material.opacity = 0.55 + castFlash * 0.4;

    // Spitzen-Licht: Cast-Blitz klingt in 0.25s ab; Lumos leuchtet währenddessen
    // dauerhaft (ersetzt das alte separate Lumos-Licht am Spieler aus Phase 1-3).
    // Ein frischer Cast-Blitz ist kurz heller als das Lumos-Grundglühen und
    // überstrahlt dessen Farbe für seine Dauer.
    const castLi = this.castT >= 0 ? 8 * Math.max(0, 1 - this.castT / 0.25) : 0;
    const lumosLi = lumosOn ? 14 : 0;
    this.tipLight.intensity = Math.max(castLi, lumosLi);
    this.tipLight.color.setHex(castLi >= lumosLi ? spell.color : SPELLS.lumos.color);
    this.tipLight.distance = lumosOn ? 20 : 6;
  }
}
