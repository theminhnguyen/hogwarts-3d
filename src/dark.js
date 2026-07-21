// Der dunkle Pfad (S8, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt 8). Aschenes
// Grimoire in einem neuen Alkoven jenseits des Spinnenhain-Baumrings (W6,
// grove.js — dort bewusst NICHT verändert, eigener Bereich referenziert nur
// GROVE als Zentrum). Dunkler Altar (Ritual hell→dunkel), Innenhof-Brunnen-
// Läuterung (dunkel→hell, nur Morgengrauen + volle Herzen), Dunkles Mal
// (Taste 9, main.js ruft summonMal() auf), Schatten-Trail beim Sprinten.

import * as THREE from 'three';
import { terrainHeight, GROVE } from './terrain.js';
import { addCircleBlocker } from './geo.js';

// Alkoven jenseits des Baumrings (Radius 11-15, siehe grove.js) UND jenseits
// der beiden zentrumsnahen Netze (Radius ~9) — Winkel 2.5rad frei von beidem
// (gegen die reale grove.js-Geometrie verifiziert, Lehre 3).
const GRIMOIRE_ANGLE = 2.5;
const GRIMOIRE_DIST = 18;
const GRIMOIRE_POS = {
  x: GROVE.x + Math.cos(GRIMOIRE_ANGLE) * GRIMOIRE_DIST,
  z: GROVE.z + Math.sin(GRIMOIRE_ANGLE) * GRIMOIRE_DIST,
};

// Innenhof-Brunnen (castle.js, health.js TUNING.fountainPos) — dieselbe
// Stelle wie die Herz-Heilung, Läuterung ist ein zusätzlicher, aktiver
// E-Interakt an derselben Position.
const FOUNTAIN_POS = { x: 0, z: 12 };
const DAWN_MIN = 0.05, DAWN_MAX = 0.45; // "Morgengrauen"-Fenster (nightGlow)

const MAL_CD = 60;
const TRAIL_COLOR = 0x2a1030;

export function buildDark(scene, glowTex, hud, audio, fx, interact, economy, deps) {
  // deps = { dunkel, spells, dementors, health, sky } — direkte Save-
  // Referenz (dunkel), Systeme, die S8 orchestriert (Muster S3-S7).
  const { dunkel, spells, dementors, health, sky } = deps;

  // ---------- Aschenes Grimoire: kleiner Steinalkoven + glühendes Buch ----------
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x2a2822, flatShading: true });
  const alkoven = new THREE.Group();
  const ay = terrainHeight(GRIMOIRE_POS.x, GRIMOIRE_POS.z);
  alkoven.position.set(GRIMOIRE_POS.x, ay, GRIMOIRE_POS.z);
  alkoven.rotation.y = -GRIMOIRE_ANGLE + Math.PI; // Öffnung zeigt zum Hain-Zentrum
  scene.add(alkoven);
  // 3 grob verzerrte Felsblöcke bilden eine kleine Nische (halboffen zum Hain hin)
  for (const [rx, rz, ry, s] of [[-1.1, -0.9, 0.4, 1.3], [1.2, -0.7, -0.5, 1.1], [0.1, -1.7, 0.1, 1.4]]) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), rockMat);
    rock.position.set(rx, 0.5 * s, rz);
    rock.rotation.set(Math.random(), ry, Math.random() * 0.4);
    rock.scale.setScalar(s);
    rock.castShadow = true;
    alkoven.add(rock);
  }
  addCircleBlocker(GRIMOIRE_POS.x, GRIMOIRE_POS.z, 2.2, ay - 0.5, ay + 2.5);

  // Buch auf kleinem Steinsockel — zwei leicht aufgeklappte Boxen = Seiten
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.6, 8), rockMat);
  pedestal.position.set(0, 0.3, -0.5);
  alkoven.add(pedestal);
  const bookGroup = new THREE.Group();
  bookGroup.position.set(0, 0.62, -0.5);
  const pageMat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a, flatShading: true, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.42), pageMat);
    page.rotation.x = -Math.PI / 2;
    page.rotation.z = s * 0.35;
    page.position.x = s * 0.02;
    bookGroup.add(page);
  }
  alkoven.add(bookGroup);
  const bookGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x5aff8a, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const bookGlow = new THREE.Sprite(bookGlowMat);
  bookGlow.scale.setScalar(0.55);
  bookGlow.position.set(0, 0.68, -0.5);
  alkoven.add(bookGlow);

  // ---------- Dunkler Altar: erscheint an derselben Stelle, sobald das Buch aufgehoben wurde ----------
  const altarGroup = new THREE.Group();
  altarGroup.visible = false;
  const altarMat = new THREE.MeshLambertMaterial({ color: 0x14101a, flatShading: true });
  altarGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.15, 8), altarMat).translateY(0.075));
  const altarSlab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.5), altarMat);
  altarSlab.position.y = 0.21;
  altarGroup.add(altarSlab);
  const altarGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x7a2fd1, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const altarGlow = new THREE.Sprite(altarGlowMat);
  altarGlow.scale.setScalar(1.6);
  altarGlow.position.set(0, 0.5, -0.5);
  alkoven.add(altarGlow);
  altarGroup.position.set(0, 0, -0.5);
  alkoven.add(altarGroup);

  function updateAltarGlow() {
    altarGlowMat.opacity = dunkel.pfad === 'dunkel' ? 0.55 : 0.15;
  }

  // ---------- Interakt: Grimoire aufheben ----------
  const bookEntry = interact.register({
    x: GRIMOIRE_POS.x, z: GRIMOIRE_POS.z, r: 2.2,
    get enabled() { return !dunkel.buch; },
    prompt: 'E — Das Aschene Grimoire aufheben',
    onInteract: () => {
      dunkel.buch = 1;
      bookGlow.visible = false;
      bookGroup.visible = false;
      altarGroup.visible = true;
      updateAltarGlow();
      spells.unlockDarkSpells();
      hud.showDialog('Aschenes Grimoire', [
        'Die Seiten sind mit Asche geschwärzt — Morvane der Fahle hat hier einst gelesen.',
        'Ein dunkler Altar erhebt sich aus dem Boden, sobald du das Buch schließt.',
        'Das Wissen bleibt dir — ob du ihm folgst, entscheidest du am Altar.',
      ]);
      audio.ritualChant?.();
      fx.burst({ x: alkoven.position.x, y: alkoven.position.y + 0.7, z: alkoven.position.z }, 0x5aff8a, 22, 3, { gravity: -1, life: 0.9 });
      onChange?.();
    },
  });

  // ---------- Interakt: Ritual sprechen (hell → dunkel) ----------
  interact.register({
    x: GRIMOIRE_POS.x, z: GRIMOIRE_POS.z, r: 2.2,
    get enabled() { return dunkel.buch === 1 && dunkel.pfad === 'hell'; },
    prompt: 'E — Das Ritual sprechen',
    onInteract: () => {
      dunkel.pfad = 'dunkel';
      updateAltarGlow();
      hud.showToast('🖤 Du sprichst das Ritual — der dunkle Pfad hat dich angenommen.', 4.5);
      audio.ritualChant?.();
      fx.burst({ x: alkoven.position.x, y: alkoven.position.y + 0.7, z: alkoven.position.z }, 0x7a2fd1, 26, 3.5, { gravity: -1, life: 1.0 });
      onChange?.();
    },
  });

  // ---------- Innenhof-Brunnen: Läuterung (dunkel → hell) ----------
  // enabled prüft nur Pfad+Tageszeit (breite Schranke) — die Herzen-Prüfung
  // läuft in onInteract mit eigenem Toast (Muster Kate-Kauf/Fero-Preis),
  // sonst bekäme der Spieler bei fehlenden Herzen gar keinen Prompt zu sehen.
  interact.register({
    x: FOUNTAIN_POS.x, z: FOUNTAIN_POS.z, r: 3.2,
    get enabled() {
      return dunkel.pfad === 'dunkel' && sky.state.nightGlow > DAWN_MIN && sky.state.nightGlow < DAWN_MAX;
    },
    prompt: 'E — ins Licht zurückkehren',
    onInteract: () => {
      if (health.hearts < health.effectiveMaxHearts) {
        hud.showToast('Die Läuterung verlangt volle Herzen.', 2.5);
        return;
      }
      dunkel.pfad = 'hell';
      updateAltarGlow();
      hud.showToast('✨ Das Morgenlicht wäscht den Schatten von dir ab. Willkommen zurück.', 4.5);
      audio.purifyChime?.();
      fx.burst({ x: FOUNTAIN_POS.x, y: terrainHeight(FOUNTAIN_POS.x, FOUNTAIN_POS.z) + 1.5, z: FOUNTAIN_POS.z }, 0xfff3c0, 26, 3.5, { gravity: -1.5, life: 1.0 });
      onChange?.();
    },
  });

  let onChange = null;
  let malCdT = 0;

  return {
    set onChange(fn) { onChange = fn; },
    GRIMOIRE_POS,

    // S8 Dunkles Mal (Taste 9, main.js gated auf dunkel.pfad==='dunkel').
    // Grüne Partikel-Schlange + Glutwolke, Ruf −3, Dementoren driften 30s
    // zum Mal, Schüler fliehen ohnehin schon (npc.js isDark-Flee).
    summonMal(player) {
      if (dunkel.pfad !== 'dunkel' || malCdT > 0) return false;
      malCdT = MAL_CD;
      dunkel.male = (dunkel.male || 0) + 1;
      economy.addRuf(-3);
      const px = player.pos.x, pz = player.pos.z;
      // Partikel-Schlange: ein Strang aus Trail-Punkten, der sich vom Boden
      // hochschlängelt (Sinus-Auslenkung, damit es wie eine Schlange wirkt).
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        const y = terrainHeight(px, pz) + t * 6;
        const wob = Math.sin(t * Math.PI * 3) * 0.8;
        fx.trail({ x: px + wob, y, z: pz }, 0x2ecc55);
      }
      // Glutwolke: rasch aufsteigender Burst hoch über dem Spieler.
      fx.burst({ x: px, y: terrainHeight(px, pz) + 6, z: pz }, 0x1a5a2a, 30, 5, { gravity: -0.5, life: 1.6 });
      audio.malSummon?.();
      dementors.summonToMal({ x: px, z: pz });
      hud.showToast('☠️ Das Dunkle Mal steigt in den Himmel … Dementoren driften herbei. (−3 Ruf, 30s)', 4);
      return true;
    },
    get malCooldown() { return malCdT; },

    update(dt, player, sprinting) {
      if (malCdT > 0) malCdT = Math.max(0, malCdT - dt);
      // Schatten-Trail beim Sprinten im dunklen Pfad (fx.trail, schwarz-violett).
      if (dunkel.pfad === 'dunkel' && sprinting && Math.random() < 0.55) {
        fx.trail({ x: player.pos.x, y: player.pos.y + 0.25, z: player.pos.z }, TRAIL_COLOR);
      }
    },

    // Reset-Button + initialer Load: kompletter visueller Sync aus dunkel.*
    // (Lehre 15 — restore() setzt IMMER den kompletten Weltzustand synchron).
    restore() {
      bookGlow.visible = !dunkel.buch;
      bookGroup.visible = !dunkel.buch;
      altarGroup.visible = !!dunkel.buch;
      updateAltarGlow();
      malCdT = 0;
      if (dunkel.buch) spells.unlockDarkSpells(false);
    },
  };
}
