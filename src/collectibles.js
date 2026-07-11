// Sammelobjekte: 12 goldene Schnätze, verteilt über die Sehenswürdigkeiten.
// Fortschritt wird in localStorage gespeichert.

import * as THREE from 'three';
import { terrainHeight, PLATEAU } from './terrain.js';
import { platformGround } from './geo.js';

const GY = PLATEAU.h;

// y: null → Geländehöhe + 1.5; 'platform' → höchste Plattform + 1.5
const SPOTS = [
  { id: 'hof', name: 'Am Brunnen im Innenhof', x: 4.5, z: 16, y: GY + 1.5 },
  { id: 'saal', name: 'Im Großen Saal', x: -31.5, z: 20, y: GY + 1.8 },
  { id: 'astro', name: 'Am Astronomieturm', x: 0, z: -80, y: null },
  { id: 'viadukt', name: 'Auf dem Viadukt', x: 0, z: 94, y: 'platform' },
  { id: 'schlucht', name: 'Unten in der Schlucht', x: -24, z: 94, y: null },
  { id: 'steg', name: 'Am Bootssteg', x: -112, z: 158, y: 'platform' },
  { id: 'see', name: 'Am Seeufer', x: -134, z: 186, y: null },
  { id: 'huette', name: 'Bei Hagrids Kürbissen', x: 134, z: 208, y: null },
  { id: 'quidditch', name: 'Im Quidditch-Mittelkreis', x: -195, z: 10, y: null },
  { id: 'steine', name: 'Im Steinkreis', x: 150, z: -95, y: null },
  { id: 'wald', name: 'Auf der Waldlichtung', x: 95, z: 105, y: null },
  { id: 'garten', name: 'Im Nordgarten', x: 0, z: -62, y: GY + 1.5 },
];

export class Collectibles {
  constructor(scene, glowTex, collectedIds = []) {
    this.items = [];
    this.count = 0;
    this.total = SPOTS.length;
    this.onCollect = null;

    const coreGeo = new THREE.SphereGeometry(0.24, 12, 10);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd24a });
    const wingGeo = new THREE.PlaneGeometry(0.55, 0.2);
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xf3f6ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9,
    });
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, color: 0xffcf5a, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });

    for (const spot of SPOTS) {
      let y = spot.y;
      if (y === null) y = terrainHeight(spot.x, spot.z) + 1.5;
      else if (y === 'platform') {
        const p = platformGround(spot.x, spot.z, 10000);
        y = (p === -Infinity ? terrainHeight(spot.x, spot.z) : p) + 1.5;
      }

      const group = new THREE.Group();
      group.position.set(spot.x, y, spot.z);
      const core = new THREE.Mesh(coreGeo, coreMat);
      group.add(core);
      const wingL = new THREE.Mesh(wingGeo, wingMat);
      wingL.position.x = -0.45;
      group.add(wingL);
      const wingR = new THREE.Mesh(wingGeo, wingMat);
      wingR.position.x = 0.45;
      group.add(wingR);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(2.0, 2.0, 1);
      group.add(glow);

      const item = {
        id: spot.id, name: spot.name, group, wingL, wingR,
        baseY: y, phase: Math.random() * Math.PI * 2,
        collected: collectedIds.includes(spot.id),
        carriedBy: null, // von einem Wichtel geklaut? (siehe creatures.js)
      };
      if (item.collected) {
        group.visible = false;
        this.count++;
      }
      scene.add(group);
      this.items.push(item);
    }
  }

  get collectedIds() {
    return this.items.filter(i => i.collected).map(i => i.id);
  }

  // Nächster nicht eingesammelter Schnatz (für den HUD-Kompass)
  nearest(playerPos) {
    let best = null, bestD2 = Infinity;
    for (const item of this.items) {
      if (item.collected) continue;
      const dx = item.group.position.x - playerPos.x;
      const dz = item.group.position.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { bestD2 = d2; best = item; }
    }
    if (!best) return null;
    return {
      dist: Math.sqrt(bestD2),
      // Weltwinkel Richtung Ziel (0 = Norden/-z, im Uhrzeigersinn)
      angle: Math.atan2(
        best.group.position.x - playerPos.x,
        -(best.group.position.z - playerPos.z)
      ),
    };
  }

  update(dt, time, playerPos) {
    for (const item of this.items) {
      // Geklaute Schnätze werden von creatures.js positioniert (hängen unterm
      // Wichtel) — Bobbing/Pickup-Check pausiert, bis der Wichtel ihn fallenlässt.
      if (item.collected || item.carriedBy) continue;
      const g = item.group;
      g.position.y = item.baseY + Math.sin(time * 1.4 + item.phase) * 0.22;
      g.rotation.y = time * 1.8 + item.phase;
      const flap = Math.sin(time * 16 + item.phase) * 0.7;
      item.wingL.rotation.y = flap;
      item.wingR.rotation.y = -flap;

      const dx = g.position.x - playerPos.x;
      const dy = g.position.y - (playerPos.y + 1.2);
      const dz = g.position.z - playerPos.z;
      if (dx * dx + dy * dy + dz * dz < 2.6 * 2.6) {
        item.collected = true;
        g.visible = false;
        this.count++;
        if (this.onCollect) this.onCollect(item, this.count, this.total);
      }
    }
  }
}
