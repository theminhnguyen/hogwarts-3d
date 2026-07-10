// Gemeinsame Materialien mit Welt-Koordinaten-Mapping:
// Texturen werden über die Weltposition projiziert (triplanar bzw. von oben),
// dadurch sitzt das Mauerwerk auf jeder Form gleichmäßig — ganz ohne UV-Arbeit.

import * as THREE from 'three';
import {
  makeStoneTexture, makeRoofTexture, makeWoodTexture, makeGroundTexture,
} from './textures.js';

const VARYINGS = `
varying vec3 vWP;
varying vec3 vWN;
`;

const TRIPLANAR = `
#ifdef USE_MAP
  vec3 tpN = abs(normalize(vWN));
  tpN = pow(tpN, vec3(4.0));
  tpN /= (tpN.x + tpN.y + tpN.z);
  vec4 tpX = texture2D(map, vWP.zy * uTexScale);
  vec4 tpY = texture2D(map, vWP.xz * uTexScale);
  vec4 tpZ = texture2D(map, vWP.xy * uTexScale);
  diffuseColor *= (tpX * tpN.x + tpY * tpN.y + tpZ * tpN.z);
#endif
`;

const TOPDOWN = `
#ifdef USE_MAP
  diffuseColor *= texture2D(map, vWP.xz * uTexScale);
#endif
`;

// Ersetzt das normale UV-Mapping des Materials durch Welt-Projektion
function worldMapped(mat, scale, mode = 'triplanar') {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTexScale = { value: scale };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VARYINGS)
      .replace('#include <uv_vertex>',
        '#include <uv_vertex>\n' +
        'vWP = (modelMatrix * vec4(position, 1.0)).xyz;\n' +
        'vWN = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + VARYINGS + '\nuniform float uTexScale;')
      .replace('#include <map_fragment>', mode === 'triplanar' ? TRIPLANAR : TOPDOWN);
  };
  // eigener Cache-Key, sonst teilt three den Shader mit ungepatchten Materialien
  mat.customProgramCacheKey = () => `worldmap-${mode}-${scale}`;
  return mat;
}

let cache = null;

export function getMaterials() {
  if (cache) return cache;
  const stoneTex = makeStoneTexture();
  const roofTex = makeRoofTexture();
  const woodTex = makeWoodTexture();
  const groundTex = makeGroundTexture();

  cache = {
    // Mauerwerk: Blöcke ~1.2 m breit
    stone: worldMapped(new THREE.MeshStandardMaterial({
      vertexColors: true, map: stoneTex, roughness: 0.96, metalness: 0.0,
    }), 1 / 6),
    // Dächer: Schindelreihen ~0.35 m
    roof: worldMapped(new THREE.MeshLambertMaterial({
      vertexColors: true, map: roofTex,
    }), 1 / 4),
    // Holz
    wood: worldMapped(new THREE.MeshLambertMaterial({
      vertexColors: true, map: woodTex,
    }), 1 / 3),
    // Deko ohne Textur (Gold, Fahnen, Hecken, Kürbisse …)
    deco: new THREE.MeshLambertMaterial({ vertexColors: true }),
    // Fenster (unbeleuchtet, glüht nachts über color-Multiplikator)
    window: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // Gelände: Detail von oben projiziert, Kachel ~7 m
    terrain: worldMapped(new THREE.MeshLambertMaterial({
      vertexColors: true, map: groundTex,
    }), 1 / 7, 'topdown'),
  };
  return cache;
}
