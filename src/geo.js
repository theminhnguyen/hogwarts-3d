// Geometrie-Helfer: eingefärbte Grundformen in großen Meshes zusammenfassen
// (wenige Draw-Calls = gute Performance) + Kollisions-Registry für den Spieler.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _color = new THREE.Color();

// Färbt eine Geometrie komplett in einer Farbe (Vertex-Colors)
export function tint(geo, colorHex, variation = 0) {
  _color.set(colorHex);
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let r = _color.r, g = _color.g, b = _color.b;
    if (variation > 0) {
      const v = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * variation;
      r *= v; g *= v; b *= v;
    }
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Sammelbecken für Geometrien, die am Ende zu einem Mesh verschmolzen werden
export class GeoBatch {
  constructor() { this.list = []; }

  // geo wird konsumiert (transformiert + eingefärbt + gesammelt)
  add(geo, colorHex, x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1) {
    if (sx !== 1 || sy !== 1 || sz !== 1) geo.scale(sx, sy, sz);
    if (ry !== 0) geo.rotateY(ry);
    geo.translate(x, y, z);
    tint(geo, colorHex);
    this.list.push(geo);
    return geo;
  }

  // Vor-transformierte Geometrie direkt hinzufügen
  addRaw(geo, colorHex) {
    tint(geo, colorHex);
    this.list.push(geo);
    return geo;
  }

  build(material, { castShadow = true, receiveShadow = true } = {}) {
    if (this.list.length === 0) return null;
    const merged = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list.length = 0;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}

// ---------------- Kollisionen ----------------
// blockers: schieben den Spieler horizontal heraus (Wände, Türme, Bäume)
// platforms: begehbare Oberflächen über dem Gelände (Brücke, Steg, Böden)

export const colliders = {
  blockers: [],   // { kind:'box'|'circle', ... }
  platforms: [],  // { minX,maxX,minZ,maxZ, y0,y1, z0,z1 }  (y1/z0/z1 optional für Gefälle)
};

export function resetColliders() {
  colliders.blockers.length = 0;
  colliders.platforms.length = 0;
}

export function addBoxBlocker(minX, maxX, minY, maxY, minZ, maxZ) {
  colliders.blockers.push({ kind: 'box', minX, maxX, minY, maxY, minZ, maxZ });
}

export function addCircleBlocker(x, z, r, minY, maxY) {
  colliders.blockers.push({ kind: 'circle', x, z, r, minY, maxY });
}

// Ebene Plattform — oder mit Gefälle entlang z (y0 bei z0 → y1 bei z1)
export function addPlatform(minX, maxX, minZ, maxZ, y0, y1 = null, z0 = null, z1 = null) {
  colliders.platforms.push({ minX, maxX, minZ, maxZ, y0, y1, z0, z1 });
}

export function platformTopAt(p, z) {
  if (p.y1 === null || p.y1 === undefined) return p.y0;
  const t = Math.min(1, Math.max(0, (z - p.z0) / (p.z1 - p.z0)));
  return p.y0 + (p.y1 - p.y0) * t;
}

// Höchste begehbare Plattform unter/knapp über den Füßen (Step-Up bis 0.55m)
export function platformGround(x, z, feetY) {
  let best = -Infinity;
  for (const p of colliders.platforms) {
    if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
    const top = platformTopAt(p, z);
    if (top <= feetY + 0.55 && top > best) best = top;
  }
  return best;
}

// Schiebt einen Kreis (Spieler) aus allen Blockern heraus.
// bodyLow/bodyHigh: vertikaler Bereich des Körpers (Füße+Step … Kopf)
export function resolveBlockers(pos, radius, feetY) {
  const bodyLow = feetY + 0.55;   // bis hierhin darf "aufgestiegen" werden
  const bodyHigh = feetY + 1.75;
  for (const b of colliders.blockers) {
    if (b.maxY <= bodyLow || b.minY >= bodyHigh) continue;
    if (b.kind === 'circle') {
      const dx = pos.x - b.x, dz = pos.z - b.z;
      const rr = b.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    } else {
      // Box: nächster Punkt auf der Box → herausdrücken
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (radius - d) / d;
          pos.x += dx * push;
          pos.z += dz * push;
        } else {
          // Zentrum innerhalb der Box: über die nächste Kante herausschieben
          const left = pos.x - b.minX, right = b.maxX - pos.x;
          const near = pos.z - b.minZ, far = b.maxZ - pos.z;
          const m = Math.min(left, right, near, far);
          if (m === left) pos.x = b.minX - radius;
          else if (m === right) pos.x = b.maxX + radius;
          else if (m === near) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
    }
  }
}
