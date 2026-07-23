// Geteilte Bau-Helfer für den Grafik-Overhaul (PLAN-EPISCHE-WELT.md,
// Meilenstein E1+): Gliedmaßen-Ketten mit Pivot-Gelenken (verallgemeinert aus
// dem Astketten-Muster in willow.js / dem Spinnenbein-Muster in creatures.js)
// + ein wiederverwendbarer Rim-Light-Shader für bessere Silhouetten. Baut
// NICHTS selbst in die Szene ein — reine Helfer für build*Parts()-Funktionen.
import * as THREE from 'three';

// Gliedmaßen-Kette aus N Segmenten, jedes mit eigenem Pivot-Gelenk (wie die
// Ast-Ketten in willow.js bzw. die Spinnenbeine in creatures.js) — hier
// einmal allgemein, damit neue Kreaturen sie wiederverwenden können, statt
// den Aufbau jedes Mal von Hand zu wiederholen. `down=true` lässt die Kette
// nach -Y wachsen (Beine), `down=false` nach +Y (Äste/Flügel). Gibt
// { root, joints, tip } zurück — `joints[i].rotation.x` treibt die Gelenk-
// Animation (Gang-Zyklus etc.); `root` hängt bereits im übergebenen
// `parentGroup`.
export function buildLimbChain(parentGroup, { pos, rotY = 0, rotZ = 0, down = true, segments }) {
  const sign = down ? -1 : 1;
  const root = new THREE.Group();
  root.position.set(pos.x, pos.y, pos.z);
  root.rotation.y = rotY;
  if (rotZ) root.rotation.z = rotZ;
  parentGroup.add(root);

  const joints = [];
  let parent = root;
  for (const s of segments) {
    const joint = new THREE.Group();
    joint.rotation.x = s.restRotX || 0;
    parent.add(joint);
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(s.radiusTop, s.radiusBot, s.length, s.radialSegs || 6),
      s.material
    );
    mesh.position.y = sign * s.length / 2;
    mesh.castShadow = s.castShadow !== false;
    joint.add(mesh);
    const next = new THREE.Group();
    next.position.y = sign * s.length;
    joint.add(next);
    joints.push(joint);
    parent = next;
  }
  return { root, joints, tip: parent };
}

// Rim-Light: additiver Fresnel-Randglanz, der Silhouetten auch im Gegenlicht/
// nachts besser lesbar macht. NUR für MeshLambertMaterial mit flatShading:
// true geeignet — die Injektion braucht `normal` (aus `normal_fragment_begin`)
// und die Varying `vViewPosition` (aus `lights_lambert_pars_fragment`), beide
// im vendored lib/three.module.js verifiziert vorhanden und vor
// `dithering_fragment` im Scope. MeshBasicMaterial hat diese Chunks NICHT —
// dort nicht verwenden. Muss NACH jedem `.clone()` erneut aufgerufen werden:
// Three.js' Material.copy() übernimmt `onBeforeCompile` nicht (im Quelltext
// geprüft — clone() fällt sonst still auf den Kein-Effekt-Default zurück).
export function attachRimLight(material, { color = 0xffffff, power = 2.4, intensity = 0.55 } = {}) {
  const c = new THREE.Color(color);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: c };
    shader.uniforms.uRimPower = { value: power };
    shader.uniforms.uRimIntensity = { value: intensity };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uRimColor;
uniform float uRimPower;
uniform float uRimIntensity;`)
      .replace('#include <dithering_fragment>', `
  float rimFres = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  gl_FragColor.rgb += uRimColor * pow(rimFres, uRimPower) * uRimIntensity;
  #include <dithering_fragment>`);
    material.userData.rimShader = shader;
  };
  material.needsUpdate = true;
}
