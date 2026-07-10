// Gelände: Höhenfunktion (auch für Kollision), Terrain-Mesh mit Vertex-Farben,
// See mit animiertem Wasser-Shader, Wege.

import * as THREE from 'three';
import { fbm, smoothstep, lerp, clamp } from './noise.js';
import { getMaterials } from './materials.js';

export const WORLD_SIZE = 960;        // Kantenlänge des Terrains
export const WORLD_BOUND = 430;       // weiter draußen: Berge (unpassierbar)
export const WATER_LEVEL = 0.4;

export const PLATEAU = { x: 0, z: -20, r: 85, blend: 45, h: 18 };
export const LAKE = { x: -170, z: 230, r: 125 };
export const QUIDDITCH = { x: -195, z: 10, r: 52, h: 4 };
export const HAGRID = { x: 122, z: 200, r: 16, h: 5 };
export const STONES = { x: 150, z: -95, r: 24, h: 14 };
export const BOATHOUSE = { x: -88, z: 158, r: 14, h: 1.3 };
export const RAVINE = { z: 94 };      // Schlucht, die das Viadukt überspannt

// Wege als Polylinien (für Färbung + Freihalten von Bäumen)
export const PATHS = [
  [[0, 46], [0, 168]],                       // Tor → Kreuzung (über Viadukt)
  [[0, 168], [-84, 162]],                    // Kreuzung → Bootshaus
  [[-88, 158], [-140, 190]],                 // Bootshaus → Seeufer
  [[0, 168], [60, 185], [118, 198]],         // Kreuzung → Hagrids Hütte
  [[0, 168], [-90, 100], [-165, 40]],        // Kreuzung → Quidditch-Feld
  [[-90, 100], [-40, -60], [80, -100], [140, -98]], // Rundweg → Steinkreis
];

export function distToPaths(x, z) {
  let best = Infinity;
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const abx = bx - ax, abz = bz - az;
      const t = clamp(((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz), 0, 1);
      const dx = x - (ax + abx * t), dz = z - (az + abz * t);
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < best) best = d;
    }
  }
  return best;
}

// ---------- Die zentrale Höhenfunktion ----------
export function terrainHeight(x, z) {
  // Sanfte Grundhügel
  let h = (fbm(x * 0.0052, z * 0.0052, 4) - 0.38) * 15;

  // Bergring am Weltrand (zerklüftete Grate statt glatter Wand)
  const d0 = Math.sqrt(x * x + z * z);
  if (d0 > 330) {
    const t = smoothstep(330, 470, d0);
    const ridge = Math.abs(fbm(x * 0.013, z * 0.013, 4) - 0.5) * 2; // Grat-Noise
    h += t * t * 46 + ridge * t * 52 + fbm(x * 0.05, z * 0.05, 2) * t * 10;
  }

  // Damm/Weg vom Tor nach Süden (Trasse für das Viadukt)
  if (z > 28 && z < 185) {
    const t = clamp((z - 40) / 140, 0, 1);
    const target = 18 - t * 12; // 18 → 6
    const m = (1 - smoothstep(9, 30, Math.abs(x))) * smoothstep(28, 42, z) * (1 - smoothstep(155, 185, z));
    h = lerp(h, target, m);
  }

  // Schloss-Plateau (flach → Schloss steht eben)
  {
    const dp = Math.sqrt((x - PLATEAU.x) ** 2 + (z - PLATEAU.z) ** 2);
    const m = 1 - smoothstep(PLATEAU.r, PLATEAU.r + PLATEAU.blend, dp);
    h = lerp(h, PLATEAU.h, m);
  }

  // Schlucht (quer zum Damm — das Viadukt überspannt sie)
  {
    const mz = 1 - smoothstep(12, 27, Math.abs(z - RAVINE.z));
    const mx = 1 - smoothstep(130, 190, Math.abs(x));
    const m = mz * mx;
    if (m > 0.001) {
      const bottom = 1.2 + Math.max(0, Math.abs(x) - 70) * 0.06;
      h = lerp(h, bottom, m);
    }
  }

  // See-Senke
  {
    const dl = Math.sqrt((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2);
    const m = 1 - smoothstep(LAKE.r * 0.5, LAKE.r, dl);
    h = lerp(h, -5.5, m);
  }

  // Ebene Spielflächen
  for (const spot of [QUIDDITCH, HAGRID, BOATHOUSE]) {
    const d = Math.sqrt((x - spot.x) ** 2 + (z - spot.z) ** 2);
    const m = 1 - smoothstep(spot.r, spot.r * 1.9, d);
    h = lerp(h, spot.h, m);
  }

  // Wege nicht unter Wasser: Senken entlang der Pfade leicht anheben
  {
    const pd = distToPaths(x, z);
    if (pd < 7 && h < 1.6) {
      const m = 1 - smoothstep(2.5, 7, pd);
      h = lerp(h, 1.6, m);
    }
  }

  // Hügel mit Steinkreis
  {
    const d = Math.sqrt((x - STONES.x) ** 2 + (z - STONES.z) ** 2);
    const m = 1 - smoothstep(STONES.r, STONES.r * 2.6, d);
    h = lerp(h, STONES.h + fbm(x * 0.05, z * 0.05, 2) * 1.5, m * 0.9);
  }

  return h;
}

// ---------- Terrain-Mesh ----------
// Texturen multiplizieren → Töne heller angelegt
const COL_GRASS_A = new THREE.Color(0x5c8a45);
const COL_GRASS_B = new THREE.Color(0x7da354);
const COL_DIRT = new THREE.Color(0x9c825e);
const COL_SAND = new THREE.Color(0xb0a077);
const COL_ROCK = new THREE.Color(0x8b8780);
const COL_SNOW = new THREE.Color(0xe8ecf2);

export function buildTerrain() {
  const segs = 220;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  // Färbung nach Höhe / Steigung / Wegen
  const normals = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ny = normals.getY(i);
    const n = fbm(x * 0.03, z * 0.03, 3);

    c.copy(COL_GRASS_A).lerp(COL_GRASS_B, n);
    // Ufer / Sand
    if (y < 1.4) c.lerp(COL_SAND, clamp((1.4 - y) / 1.6, 0, 1));
    // Fels an steilen Hängen und in der Höhe
    const steep = 1 - smoothstep(0.62, 0.85, ny);
    c.lerp(COL_ROCK, Math.max(steep, smoothstep(24, 40, y)));
    // Schnee bleibt nur auf flacheren Lagen liegen
    c.lerp(COL_SNOW, smoothstep(44, 62, y) * smoothstep(0.5, 0.78, ny));
    // Wege
    const pd = distToPaths(x, z);
    if (pd < 5.5) c.lerp(COL_DIRT, (1 - smoothstep(2.6, 5.5, pd)) * 0.85);
    // dezente Helligkeitsvariation
    const v = 0.92 + fbm(x * 0.11, z * 0.11, 2) * 0.16;
    colors[i * 3] = c.r * v;
    colors[i * 3 + 1] = c.g * v;
    colors[i * 3 + 2] = c.b * v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geo, getMaterials().terrain);
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---------- Wasser ----------
export function buildWater() {
  const geo = new THREE.CircleGeometry(LAKE.r + 55, 64);
  geo.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.2) },
    uSunColor: { value: new THREE.Color(0xfff2cf) },
    uSky: { value: new THREE.Color(0x87b8e8) },
    uDeep: { value: new THREE.Color(0x14384d) },
    uShallow: { value: new THREE.Color(0x2a6a7d) },
    uNight: { value: 0 },
    uCenter: { value: new THREE.Vector2(LAKE.x, LAKE.z) },
    uR: { value: LAKE.r },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSky;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uTime;
      uniform float uNight;
      uniform vec2 uCenter;
      uniform float uR;
      varying vec3 vWorld;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float shoreDist = length(vWorld.xz - uCenter);
        // Wellen-Normale pro Pixel (zwei überlagerte Frequenzen)
        float nx = -0.09 * cos(vWorld.x * 0.11 + vWorld.z * 0.05 + uTime * 1.1)
                   - 0.06 * cos(vWorld.x * 0.43 + vWorld.z * 0.31 + uTime * 1.9)
                   - 0.045 * cos(vWorld.x * 0.83 - vWorld.z * 0.61 + uTime * 2.4);
        float nz = -0.08 * cos(vWorld.z * 0.13 - vWorld.x * 0.06 + uTime * 0.8)
                   - 0.055 * cos(vWorld.z * 0.47 - vWorld.x * 0.27 + uTime * 1.6)
                   - 0.04 * cos(vWorld.z * 0.71 + vWorld.x * 0.53 + uTime * 2.1);
        vec3 n = normalize(vec3(nx, 1.0, nz));
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 2.0);
        // Tiefe: Mitte dunkel, Rand heller
        vec3 col = mix(uDeep, uShallow, smoothstep(uR * 0.45, uR * 0.95, shoreDist));
        col = mix(col, uSky, fres * 0.7);
        // Sonnen-/Mond-Glitzern
        vec3 refl = reflect(-uSunDir, n);
        float spec = pow(max(dot(refl, viewDir), 0.0), 90.0);
        float sparkle = 0.6 + 0.4 * sin(vWorld.x * 2.1 + vWorld.z * 1.7 + uTime * 2.4);
        col += uSunColor * spec * sparkle * (1.2 - uNight * 0.5);
        // Uferschaum: wandernde helle Säume nahe der Schilfkante
        float foamBand = smoothstep(uR * 0.86, uR * 0.99, shoreDist);
        float foamWave = 0.55 + 0.45 * sin(shoreDist * 2.6 - uTime * 1.3
                          + sin(vWorld.x * 0.35 + uTime * 0.6) * 1.2);
        col = mix(col, vec3(0.88, 0.92, 0.94), foamBand * foamWave * (0.55 - uNight * 0.3));
        col *= (1.0 - uNight * 0.72);
        gl_FragColor = vec4(col, 0.88);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, WATER_LEVEL, LAKE.z);
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
