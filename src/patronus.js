// Patronus-Hirsch-Modell: geteilter Helfer für den Ambient-Patronus im
// Hauspokal-Finale (puzzles.js) und den Expecto-Patronum-Charge (spells.js).
// Jeder Aufruf baut eine eigenständige Instanz mit eigenen Materialien —
// es gibt nie mehr als zwei gleichzeitig (Ambient + max. 1 Charge), Teilen
// lohnt sich hier nicht.
//
// S2 (fauna.js) nutzt dieselbe Geometrie für die Wild-Rehe der Silberauen —
// `opts.solid=true` liefert dieselbe Form mit einem normalen, blickdichten
// Fell-Material statt des geisterhaften Glow-Looks (kein Sprite, kein
// Additive-Blending). Ohne `opts` bleibt das Verhalten für die bestehenden
// beiden Aufrufer exakt wie zuvor.

import * as THREE from 'three';

export function buildPatronusModel(glowTex, opts = {}) {
  const { solid = false, color = 0xbcd4ff } = opts;
  const mat = solid
    ? new THREE.MeshLambertMaterial({ color, flatShading: true })
    : new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat);
  body.scale.set(1.1, 0.9, 2.2);
  body.position.set(0, 1.6, 0);
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat);
  head.scale.set(0.9, 0.9, 1.3);
  head.position.set(0, 2.3, 1.9);
  group.add(head);
  for (const s of [-1, 1]) {
    const antler = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.3, 5), mat);
    antler.position.set(s * 0.25, 3.1, 2.1);
    antler.rotation.z = s * 0.3;
    antler.rotation.x = -0.3;
    group.add(antler);
  }
  const legs = [];
  for (const [lx, lz] of [[-0.5, 0.9], [0.5, 0.9], [-0.5, -0.9], [0.5, -0.9]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 1.6, 6), mat);
    leg.position.set(lx, 0.8, lz);
    group.add(leg);
    legs.push(leg);
  }
  let glowMat = null;
  if (!solid) {
    glowMat = new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(6, 6, 1);
    glow.position.set(0, 1.6, 0);
    group.add(glow);
  }
  group.visible = false;

  return { group, legs, mat, glowMat };
}
