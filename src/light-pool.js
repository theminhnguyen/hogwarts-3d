// Licht-Pool (Perf-Runde 2026-10-09) — three.js-Seite. Die Auswahl-Logik
// selbst (welches Licht bekommt einen Platz) steht testbar in
// light-pool-logic.js, dort auch die Begründung mit Messwerten.
//
// Benutzung: statt `new THREE.PointLight(color, intensity, distance, decay)`
// überall `new PoolPointLight(...)`. Das ist KEIN echtes three.js-Licht
// (isLight fehlt, der Renderer ignoriert es), sondern ein Stellvertreter mit
// denselben Feldern (color/intensity/distance/decay/position/visible). Er
// hängt ganz normal im Szenegraph, erbt also Eltern-Transform und
// Sichtbarkeit (z. B. schlafende Region → unsichtbar). Der Pool kopiert jedes
// Bild die wichtigsten Stellvertreter in eine FESTE Zahl echter PointLights —
// die Lichteranzahl im Shader ändert sich dadurch nie mehr.
import * as THREE from 'three';
import { assignSlots, lightScore } from './light-pool-logic.js';

export const LIGHT_POOL_SIZE = 8;

const registry = new Set();

export class PoolPointLight extends THREE.Object3D {
  constructor(color = 0xffffff, intensity = 1, distance = 0, decay = 2) {
    super();
    this.type = 'PoolPointLight';
    this.isPoolPointLight = true;
    this.color = new THREE.Color(color);
    this.intensity = intensity;
    this.distance = distance;
    this.decay = decay;
    this._worldPos = new THREE.Vector3();
    registry.add(this);
  }

  // Nur nötig, wenn ein Licht dauerhaft verworfen wird (sonst bleibt es im
  // Register). Aktuell erzeugt kein Modul zur Laufzeit neue Lichter.
  dispose() { registry.delete(this); }
}

// Hängt das Objekt an der Szene und ist es samt aller Eltern sichtbar?
// (Nur ein bloßes `visible` reicht nicht: entfernte oder in schlafenden
// Regionen liegende Lichter müssen ebenfalls herausfallen.)
function isShown(o) {
  while (o) {
    if (!o.visible) return false;
    if (o.isScene) return true;
    o = o.parent;
  }
  return false;
}

export function createLightPool(scene, size = LIGHT_POOL_SIZE) {
  const real = [];
  const slots = [];
  for (let i = 0; i < size; i++) {
    // intensity 0, aber IMMER sichtbar — genau das hält die Anzahl konstant.
    const l = new THREE.PointLight(0xffffff, 0, 1, 2);
    l.name = `licht-pool-${i}`;
    scene.add(l);
    real.push(l);
    slots.push({ src: null, weight: 0 });
  }

  const candidates = [];
  const candidatePool = []; // wiederverwendete Kandidaten-Objekte (kein GC pro Bild)
  const cam = new THREE.Vector3();

  return {
    size,
    lights: real,
    slots,
    get registered() { return registry.size; },

    update(camera, dt) {
      camera.getWorldPosition(cam);
      candidates.length = 0;
      let k = 0;
      for (const l of registry) {
        if (!(l.intensity > 0) || !isShown(l)) continue;
        l.updateWorldMatrix(true, false);
        l._worldPos.setFromMatrixPosition(l.matrixWorld);
        const c = candidatePool[k] || (candidatePool[k] = { src: null, score: 0 });
        k++;
        c.src = l;
        c.score = lightScore(cam.x, cam.y, cam.z, l._worldPos.x, l._worldPos.y, l._worldPos.z, l.distance);
        candidates.push(c);
      }

      assignSlots(slots, candidates, dt);

      for (let i = 0; i < size; i++) {
        const s = slots[i];
        const l = real[i];
        if (!s.src) { l.intensity = 0; continue; }
        const src = s.src;
        l.position.copy(src._worldPos);
        l.color.copy(src.color);
        l.distance = src.distance;
        l.decay = src.decay;
        l.intensity = src.intensity * s.weight;
      }
      // Nicht mehr gebrauchte Kandidaten-Referenzen lösen (sonst hielte der
      // Pool ein entferntes Licht unnötig im Speicher fest).
      for (let i = k; i < candidatePool.length; i++) candidatePool[i].src = null;
    },
  };
}
