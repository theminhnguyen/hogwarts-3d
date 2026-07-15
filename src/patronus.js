// Patronus-Hirsch-Modell: geteilter Helfer für den Ambient-Patronus im
// Hauspokal-Finale (puzzles.js) und den Expecto-Patronum-Charge (spells.js).
// Jeder Aufruf baut eine eigenständige Instanz mit eigenen Materialien —
// es gibt nie mehr als zwei gleichzeitig (Ambient + max. 1 Charge), Teilen
// lohnt sich hier nicht.

import * as THREE from 'three';

export function buildPatronusModel(glowTex) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xbcd4ff, transparent: true, opacity: 0.55,
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
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xbcd4ff, transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(6, 6, 1);
  glow.position.set(0, 1.6, 0);
  group.add(glow);
  group.visible = false;

  return { group, legs, mat, glowMat };
}
