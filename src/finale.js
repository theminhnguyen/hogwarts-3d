// "Die vier Siegel" — verbindender Meta-Strang (E10, PLAN-EPISCHE-WELT.md
// Abschnitt 6.7): sobald alle 4 Siegel der neuen Regionen (drache/frost/
// hain/tiefe, aus E4-E7) errungen sind, erwacht ein Sternentor beim Schloss.
// Hineingehen gibt eine große Abschluss-Belohnung (Gold/Ruf-Sprung + Titel
// "Hüter der vier Reiche") und schließt den Strang ab (finaleWon).
//
// Bewusst KEIN eigenes Kampf-/Rätsel-System — die eigentliche Arbeit (die 4
// Siegel selbst) ist über die 4 Regionen längst verteilt, hier wird nur
// ihre Vollständigkeit gefeiert. Reine Deko+Interakt-Datei, kein
// RegionManager nötig (immer nah am Schloss, also ohnehin "immer wach" im
// Kernradius, exakt wie Willow/Wilderer/Hallows aus früheren Meilensteinen).
import * as THREE from 'three';
import { terrainHeight } from './terrain.js';
import { GeoBatch } from './geo.js';
import { getMaterials } from './materials.js';
import { addCircleBlocker } from './geo.js';

// (40,-60): offene Wiese knapp außerhalb des dichten Innenhofs (dessen
// Mauern/Türme laut castle.js grob x∈[-40,40], z∈[-55,46] belegen) — beim
// Browser-Test bestätigt (siehe E10-Commit), keine Kollision mit Schloss-
// oder Viadukt-Geometrie.
const GATE_POS = { x: 40, z: -60 };
const GATE_R = 3.4;

export function buildFinale(scene, glowTex, hud, audio, fx, economy, interact, deps) {
  const { siegel, onChange } = deps;
  const y = terrainHeight(GATE_POS.x, GATE_POS.z);
  const group = new THREE.Group();
  group.position.set(GATE_POS.x, y, GATE_POS.z);
  scene.add(group);

  // Ring aus 8 verwitterten Standsteinen.
  const batch = new GeoBatch();
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = GATE_R * 0.78;
    const h = 1.9 + (i % 3) * 0.25;
    batch.add(new THREE.CylinderGeometry(0.22, 0.3, h, 6), 0x5a5a62, Math.cos(a) * r, h / 2, Math.sin(a) * r);
    addCircleBlocker(GATE_POS.x + Math.cos(a) * r, GATE_POS.z + Math.sin(a) * r, 0.32, y - 1, y + h);
  }
  const mesh = batch.build(getMaterials().deco, { castShadow: true, receiveShadow: true });
  if (mesh) group.add(mesh);

  // Portal-Scheibe: dormant (unsichtbar) -> aktiv (pulsierend) -> geöffnet
  // (voll hell, dauerhaft) nach dem Betreten.
  const portalMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x9a6bff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const portal = new THREE.Sprite(portalMat);
  portal.scale.set(4.2, 4.2, 1);
  portal.position.y = 1.4;
  group.add(portal);
  const portalLight = new THREE.PointLight(0x9a6bff, 0, 11, 2);
  portalLight.position.y = 1.4;
  group.add(portalLight);

  let claimed = !!siegel.finaleWon;
  let time = 0;

  function litCount() {
    return [siegel.drache, siegel.frost, siegel.hain, siegel.tiefe].filter((v) => v === 1).length;
  }

  const entry = interact.register({
    x: GATE_POS.x, z: GATE_POS.z, r: GATE_R,
    get enabled() { return !claimed && litCount() === 4; },
    prompt: 'E — Das Sternentor betreten',
    onInteract: () => {
      if (claimed || litCount() !== 4) return;
      claimed = true;
      siegel.finaleWon = 1;
      economy.addGold(100);
      economy.addRuf(25);
      // 4 Feuerwerke in den Farben der 4 Regionen (Muster: puzzles.js-
      // Hauspokal-Finale, hier bewusst kompakter — nur EIN Höhepunkt statt
      // 40s Dauerfeuerwerk, das Hauspokal-Finale bleibt der größere Moment).
      // fx.firework()/burst() erwarten ein THREE.Vector3 (rufen intern
      // pos.clone() auf) — ein reines {x,y,z}-Objekt würde dort werfen.
      const colors = [0xff5a20, 0x9adfff, 0xd8b8ff, 0x2ecfa0];
      for (let i = 0; i < colors.length; i++) {
        const fwPos = new THREE.Vector3(GATE_POS.x + (i - 1.5) * 2, y, GATE_POS.z);
        setTimeout(() => fx.firework?.(fwPos, colors[i]), i * 350);
      }
      fx.burst(new THREE.Vector3(GATE_POS.x, y + 1.4, GATE_POS.z), 0x9a6bff, 60, 8, { gravity: -2, life: 1.2, size: 0.4 });
      audio.chime?.('fanfare');
      hud.showToast('🌟 Das Sternentor öffnet sich! +100 Gold · +25 Ruf · Titel „Hüter der vier Reiche" errungen!', 5.5);
      onChange?.();
    },
  });

  return {
    get finaleWon() { return claimed; },
    update(dt) {
      time += dt;
      const active = litCount() === 4;
      if (claimed) {
        portalMat.opacity = 0.85 + Math.sin(time * 1.5) * 0.1;
        portalLight.intensity = 7;
      } else if (active) {
        portalMat.opacity = 0.5 + Math.sin(time * 2) * 0.2;
        portalLight.intensity = 4 + Math.sin(time * 2) * 2;
      } else {
        portalMat.opacity = 0;
        portalLight.intensity = 0;
      }
    },
    restore() {
      claimed = !!siegel.finaleWon;
    },
  };
}
