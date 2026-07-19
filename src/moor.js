// Nebelmoor: totes Land nordöstlich des Steinkreises — kahle Bäume, Gräber,
// driftender Bodennebel, eine Krypta mit 5 Seelenlichtern und der Silbernen
// Seelenlaterne. Phase N1 baute die Zone + verschlossene Krypta, N4 (dieser
// Ausbau) ergänzt Seelenlichter, Tor-Öffnung, Truhe und Laterne-Effekte.

import * as THREE from 'three';
import { GeoBatch, addCircleBlocker, addBoxBlocker, tint } from './geo.js';
import { terrainHeight, MOOR } from './terrain.js';
import { smoothstep, mulberry32, lerp } from './noise.js';
import { getMaterials } from './materials.js';
import { makeCloudTexture } from './textures.js';

const SIGN_POS = { x: 195, z: -143 }; // am Wegknick, knapp am Moor-Kernrand
const CRYPT = { x: MOOR.x, z: MOOR.z };
const TREE_COUNT = 40;
const GRAVE_COUNT = 14;
const FOG_COUNT = 12;

// Seelenlichter (Plan-Koordinaten, bereits gegen das tatsächliche MOOR-
// Zentrum (240,-175) umgerechnet — siehe Korrektur-Hinweis in PLAN-NEBELMOOR.md)
const SOULLIGHT_SPOTS = [
  { id: 'l1', x: 210, z: -150 },
  { id: 'l2', x: 275, z: -165 },
  { id: 'l3', x: 263, z: -210 },
  { id: 'l4', x: 215, z: -205 },
  { id: 'l5', x: 247, z: -143 },
];
const PICKUP_R = 2;
const DELIVER_R = 3;
const ORBIT_R = 1.2;
const ORBIT_Y = 1.8;

function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

// Eigenständige Kopie der kleinen Jitter-Hilfsfunktion aus props.js (dort
// nicht exportiert) — verzerrt Vertices zufällig für organische Formen.
function jitter(geo, amount, seed) {
  const rng = mulberry32(seed);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i,
      pos.getX(i) + (rng() - 0.5) * amount,
      pos.getY(i) + (rng() - 0.5) * amount * 0.6,
      pos.getZ(i) + (rng() - 0.5) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

// Kleine freie Hilfsfunktion (Kopie von puzzles.js' sprite_pos, dort nicht
// exportiert): setzt sprite.position entlang einer Bogenkurve von `from` zu `to`.
function arcPos(sprite, from, to, t, arc) {
  sprite.position.set(
    lerp(from.x, to.x, t),
    lerp(from.y, to.y, t) + Math.sin(t * Math.PI) * arc,
    lerp(from.z, to.z, t)
  );
}

export function buildMoor(scene, glowTex, hud, audio, fx) {
  const mats = getMaterials();
  const rng = mulberry32(9001);
  const stoneBatch = new GeoBatch();
  const treeBatch = new GeoBatch();

  // ---------- Kahle Bäume ----------
  let treeTries = 0, treeCount = 0;
  while (treeCount < TREE_COUNT && treeTries < 4000) {
    treeTries++;
    const a = rng() * Math.PI * 2;
    const r = 12 + rng() * (MOOR.r - 10);
    const x = MOOR.x + Math.cos(a) * r, z = MOOR.z + Math.sin(a) * r;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.z) < 10) continue; // Krypta-Vorplatz frei
    const y = terrainHeight(x, z);
    const seed = 2000 + treeCount * 7;
    const trunkH = 3.5 + mulberry32(seed)() * 2.2;
    const trunk = new THREE.CylinderGeometry(0.12, 0.3, trunkH, 6);
    trunk.translate(0, trunkH / 2, 0);
    jitter(trunk, 0.08, seed);
    trunk.translate(x, y, z);
    treeBatch.addRaw(trunk, 0x3a3630);
    const branchN = 3 + Math.floor(rng() * 2);
    for (let i = 0; i < branchN; i++) {
      const bh = 0.8 + rng() * 1.0;
      const branch = new THREE.CylinderGeometry(0.02, 0.06, bh, 4);
      branch.translate(0, bh / 2, 0);
      branch.rotateX(0.6 + rng() * 0.6);
      branch.rotateY(rng() * Math.PI * 2);
      branch.translate(0, trunkH * (0.45 + rng() * 0.35), 0);
      jitter(branch, 0.03, seed + i * 13 + 1);
      branch.translate(x, y, z);
      treeBatch.addRaw(branch, 0x312d28);
    }
    addCircleBlocker(x, z, 0.35, y - 1, y + 3);
    treeCount++;
  }

  // ---------- Gräber ----------
  let graveTries = 0, graveCount = 0;
  while (graveCount < GRAVE_COUNT && graveTries < 2000) {
    graveTries++;
    const a = rng() * Math.PI * 2;
    const r = 8 + rng() * (MOOR.r - 16);
    const x = MOOR.x + Math.cos(a) * r, z = MOOR.z + Math.sin(a) * r;
    if (Math.hypot(x - CRYPT.x, z - CRYPT.z) < 10) continue;
    const y = terrainHeight(x, z);
    const grave = new THREE.BoxGeometry(0.7, 1.1, 0.15);
    grave.rotateZ((rng() - 0.5) * 0.5);
    grave.rotateX(0.08 + rng() * 0.1); // leicht nach vorn gekippt
    grave.rotateY(rng() * Math.PI * 2);
    grave.translate(x, y + 0.35 - 0.2, z); // halb eingesunken
    stoneBatch.addRaw(grave, 0x6e6a60);
    addCircleBlocker(x, z, 0.4, y - 1, y + 1.2);
    graveCount++;
  }

  // ---------- Warnschild am Moor-Eingang ----------
  const signY = terrainHeight(SIGN_POS.x, SIGN_POS.z);
  stoneBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_POS.x - 0.4, signY + 0.8, SIGN_POS.z);
  stoneBatch.add(new THREE.CylinderGeometry(0.06, 0.08, 1.6, 6), 0x5c4530, SIGN_POS.x + 0.4, signY + 0.8, SIGN_POS.z);
  stoneBatch.add(new THREE.BoxGeometry(1.3, 0.6, 0.06), 0x6d5236, SIGN_POS.x, signY + 1.5, SIGN_POS.z);

  // ---------- Krypta: Nische (Rückwand + 2 Seiten), Eingang nach Westen ----------
  // Bewährtes Grotten-Muster aus puzzles.js (R1 Feuerprobe), nur größer.
  const cy = terrainHeight(CRYPT.x, CRYPT.z);
  const backX = CRYPT.x + 4.5;
  stoneBatch.add(new THREE.BoxGeometry(0.7, 3.4, 5.6), 0x5c574e, backX, cy + 1.7, CRYPT.z);
  stoneBatch.add(new THREE.BoxGeometry(4.5, 3.4, 0.7), 0x5c574e, CRYPT.x + 2.25, cy + 1.7, CRYPT.z - 2.6);
  stoneBatch.add(new THREE.BoxGeometry(4.5, 3.4, 0.7), 0x5c574e, CRYPT.x + 2.25, cy + 1.7, CRYPT.z + 2.6);
  for (const oz of [-2.0, 2.0]) {
    const col = new THREE.CylinderGeometry(0.3, 0.36, 3.0, 7);
    col.translate(0, 1.5, 0);
    jitter(col, 0.04, 4001 + oz * 3);
    col.translate(CRYPT.x - 1.6, cy, CRYPT.z + oz);
    stoneBatch.addRaw(col, 0x6e6a60);
  }
  addBoxBlocker(backX - 0.35, backX + 0.35, cy, cy + 3.4, CRYPT.z - 2.8, CRYPT.z + 2.8);
  addBoxBlocker(CRYPT.x - 0.5, CRYPT.x + 4.5 + 0.35, cy, cy + 3.4, CRYPT.z - 2.95, CRYPT.z - 2.25);
  addBoxBlocker(CRYPT.x - 0.5, CRYPT.x + 4.5 + 0.35, cy, cy + 3.4, CRYPT.z + 2.25, CRYPT.z + 2.95);

  // Torplatte — öffnet, sobald alle 5 Seelenlichter abgegeben sind.
  // tint() ist Pflicht: mats.stone hat vertexColors:true — eine Geometrie
  // ohne 'color'-Attribut rendert dann SCHWARZ statt neutral (WebGL liest
  // ein fehlendes generic-vertex-attribute als (0,0,0,0), das multipliziert
  // die Textur auf Null). Weiß = Textur unverändert durchscheinen lassen.
  // (S1-Fund in wildmark.js — identisches Muster, hier nachträglich behoben.)
  const slabGeo = tint(new THREE.BoxGeometry(0.6, 3.4, 5.6), 0xffffff);
  const doorMesh = new THREE.Mesh(slabGeo, mats.stone);
  doorMesh.castShadow = true; doorMesh.receiveShadow = true;
  const doorClosedX = CRYPT.x;
  const doorOpenX = CRYPT.x - 3.4;
  doorMesh.position.set(doorClosedX, cy + 1.7, CRYPT.z);
  scene.add(doorMesh);
  const doorBlocker = addBoxBlocker(
    doorClosedX - 0.35, doorClosedX + 0.35, cy, cy + 3.4, CRYPT.z - 2.8, CRYPT.z + 2.8
  );

  // Fackel im Inneren — bleibt aus, bis die Tür öffnet, dann sanftes Einfaden.
  const torchMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a3c, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const torch = new THREE.Sprite(torchMat);
  torch.position.set(backX - 0.6, cy + 2.3, CRYPT.z);
  torch.scale.set(1.1, 1.5, 1);
  torch.visible = false;
  scene.add(torch);
  const torchLight = new THREE.PointLight(0xff9a3c, 0, 9, 2);
  torchLight.position.copy(torch.position);
  scene.add(torchLight);

  // ---------- Nischen-Glows (5, je 1 pro Seelenlicht) an der Rückwand ----------
  const nicheGlows = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x9fd8ff, transparent: true, opacity: 0.15,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.35);
    s.position.set(backX - 0.5, cy + 1.6, CRYPT.z + (i - 2) * 0.8);
    scene.add(s);
    nicheGlows.push(s);
  }

  // ---------- Truhe im Inneren (Troll-Truhen-Muster, lokal) ----------
  const chestGroup = new THREE.Group();
  chestGroup.position.set(CRYPT.x + 2.2, cy, CRYPT.z);
  const chestBody = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.55), mats.wood);
  chestBody.position.y = 0.275;
  chestBody.castShadow = true;
  chestGroup.add(chestBody);
  const chestLidPivot = new THREE.Group();
  chestLidPivot.position.set(0, 0.55, -0.27);
  const chestLid = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.22, 0.58), mats.wood);
  chestLid.position.set(0, 0.11, 0.27);
  chestLidPivot.add(chestLid);
  chestGroup.add(chestLidPivot);
  const chestGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xcfe8ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const chestGlow = new THREE.Sprite(chestGlowMat);
  chestGlow.scale.setScalar(0.1);
  chestGlow.position.set(0, 0.65, 0);
  chestGroup.add(chestGlow);
  chestGroup.visible = false; // erst sichtbar, sobald die Tür offen ist
  scene.add(chestGroup);

  // ---------- Bodennebel (driftet langsam im Kreis ums Moor-Zentrum) ----------
  const fogTexes = [makeCloudTexture(21), makeCloudTexture(22), makeCloudTexture(23)];
  const fogSprites = [];
  for (let i = 0; i < FOG_COUNT; i++) {
    const mat = new THREE.SpriteMaterial({
      map: fogTexes[i % 3], color: 0x9aa4b0, transparent: true, opacity: 0.22,
      depthWrite: false, fog: false,
    });
    const s = new THREE.Sprite(mat);
    const scale = 40 + rng() * 30;
    s.scale.set(scale, 12, 1);
    const angle = rng() * Math.PI * 2;
    const radius = 15 + rng() * (MOOR.r - 15);
    const x = MOOR.x + Math.cos(angle) * radius, z = MOOR.z + Math.sin(angle) * radius;
    s.position.set(x, terrainHeight(x, z) + 2, z);
    s.userData = { angle, radius, speed: (rng() < 0.5 ? -1 : 1) * (0.02 + rng() * 0.03), baseOpacity: 0.22 };
    scene.add(s);
    fogSprites.push(s);
  }

  // ---------- Seelenlichter: Irrlicht-Sprite + 3 Mini-Motten ----------
  const moteMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xd8ecff, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const soulLights = SOULLIGHT_SPOTS.map((spot) => {
    const homeY = terrainHeight(spot.x, spot.z);
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: 0x9fd8ff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.9);
    sprite.position.set(spot.x, homeY + 1.2, spot.z);
    scene.add(sprite);
    const motes = [];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Sprite(moteMat.clone());
      m.scale.setScalar(0.15);
      m.userData = { phase: rng() * Math.PI * 2, r: 0.35 + rng() * 0.25 };
      scene.add(m);
      motes.push(m);
    }
    return {
      id: spot.id, homeX: spot.x, homeY, homeZ: spot.z,
      sprite, motes, phase: rng() * Math.PI * 2,
      state: 'atSpot', // 'atSpot' | 'carried' | 'flying' | 'delivered'
      flyT: 0, flyFrom: new THREE.Vector3(),
    };
  });

  const DELIVER_POS = { x: doorClosedX - 3, z: CRYPT.z };

  const meshes = [stoneBatch.build(mats.stone), treeBatch.build(mats.deco)];
  for (const m of meshes) if (m) scene.add(m);

  // WICHTIG: kein `{...state, methoden}`-Spread hier — das würde Primitiven
  // (signSeen, fogOpacityMul, laterneCollected …) beim Rückgabe-Zeitpunkt
  // einfrieren, und spätere externe Zugriffe (main.js, Tests) würden ins
  // Leere laufen, weil update() dann eine ANDERE Kopie mutiert als die
  // extern sichtbare. Stattdessen: EIN Objekt, das seine eigenen Felder
  // über `this` liest/schreibt.
  const moor = {
    signSeen: false,
    fogOpacityMul: 1, // wird auf 0.6 gesetzt, sobald die Laterne geborgen ist
    door: { mesh: doorMesh, blocker: doorBlocker, closedX: doorClosedX, openX: doorOpenX },
    torch, torchLight,
    doorAnimT: -1,
    torchFadeT: -1,
    chestOpened: false,
    chestOpenT: -1,
    laterneCollected: false,
    carriedList: [], // Referenzen auf soulLights-Objekte, in Aufnahme-Reihenfolge

    get carriedCount() { return this.carriedList.length; },
    get deliveredCount() { return soulLights.filter((l) => l.state === 'delivered').length; },

    // 0 außerhalb, 1 tief im Kern — main.js blendet damit die --moor-Vignette
    insideFactor(pos) {
      const d = Math.hypot(pos.x - MOOR.x, pos.z - MOOR.z);
      return clamp01(1 - smoothstep(MOOR.r * 0.5, MOOR.r + MOOR.blend, d));
    },

    // Getragene Lichter fallen bei Tod/Respawn an ihre Ursprungs-Spots zurück
    // (nicht verloren, aber der Weg war umsonst).
    dropCarriedLights() {
      for (const l of this.carriedList) {
        l.state = 'atSpot';
        l.sprite.visible = true;
        for (const m of l.motes) m.visible = true;
      }
      this.carriedList.length = 0;
    },

    _tryPickup(player) {
      for (const l of soulLights) {
        if (l.state !== 'atSpot') continue;
        const dx = player.pos.x - l.homeX, dz = player.pos.z - l.homeZ;
        if (dx * dx + dz * dz < PICKUP_R * PICKUP_R) {
          l.state = 'carried';
          this.carriedList.push(l);
          audio?.soulLightPickup?.();
        }
      }
    },

    _tryDeliver(player) {
      if (this.carriedList.length === 0) return;
      const dx = player.pos.x - DELIVER_POS.x, dz = player.pos.z - DELIVER_POS.z;
      if (dx * dx + dz * dz > DELIVER_R * DELIVER_R) return;
      this.carriedList.forEach((l, i) => {
        l.state = 'flying';
        l.flyT = -i * 0.15; // gestaffelter Start
        l.flyFrom.copy(l.sprite.position);
        for (const m of l.motes) m.visible = false;
      });
      this.carriedList.length = 0;
    },

    _updateSoulLights(dt, player) {
      this._tryPickup(player);
      this._tryDeliver(player);

      const n = this.carriedList.length;
      this.carriedList.forEach((l, i) => {
        const angle = (i / n) * Math.PI * 2 + this._time * 0.6;
        const cx = player.pos.x + Math.cos(angle) * ORBIT_R;
        const cy2 = player.pos.y + ORBIT_Y;
        const cz = player.pos.z + Math.sin(angle) * ORBIT_R;
        l.sprite.position.set(cx, cy2, cz);
        for (const m of l.motes) {
          const u = m.userData;
          m.position.set(
            cx + Math.cos(this._time * 1.3 + u.phase) * u.r,
            cy2 + Math.sin(this._time * 1.7 + u.phase * 1.4) * 0.2,
            cz + Math.sin(this._time * 1.3 + u.phase) * u.r
          );
        }
      });

      for (const l of soulLights) {
        if (l.state === 'atSpot') {
          const bob = Math.sin(this._time * 1.4 + l.phase) * 0.18;
          const cx = l.homeX, cy2 = l.homeY + 1.2 + bob, cz = l.homeZ;
          l.sprite.position.set(cx, cy2, cz);
          for (const m of l.motes) {
            const u = m.userData;
            m.position.set(
              cx + Math.cos(this._time * 1.3 + u.phase) * u.r,
              cy2 + Math.sin(this._time * 1.7 + u.phase * 1.4) * 0.2,
              cz + Math.sin(this._time * 1.3 + u.phase) * u.r
            );
          }
        } else if (l.state === 'flying') {
          l.flyT += dt / 0.8;
          if (l.flyT < 0) continue; // noch in der gestaffelten Wartezeit
          const idx = soulLights.indexOf(l);
          const target = nicheGlows[idx].position;
          arcPos(l.sprite, l.flyFrom, target, clamp01(l.flyT), 1.5);
          if (l.flyT >= 1) this._finishDelivery(l, idx);
        }
      }
    },

    _finishDelivery(light, idx) {
      light.state = 'delivered';
      light.sprite.visible = false;
      nicheGlows[idx].material.opacity = 0.9;
      audio?.soulLightDeliver?.();
      if (this.deliveredCount === 5 && this.doorAnimT < 0 && !this.door.blocker.disabled) {
        this.doorAnimT = 0;
        audio?.puzzleRumble?.(2.5);
      }
    },

    _updateDoor(dt) {
      if (this.doorAnimT >= 0) {
        this.doorAnimT += dt / 2.5;
        const f = clamp01(this.doorAnimT);
        doorMesh.position.x = lerp(doorClosedX, doorOpenX, f);
        if (this.doorAnimT >= 1) {
          this.doorAnimT = -1;
          doorBlocker.disabled = true;
          torch.visible = true;
          this.torchFadeT = 0;
          chestGroup.visible = true;
        }
      }
      if (this.torchFadeT >= 0) {
        this.torchFadeT += dt / 1.5;
        const f = clamp01(this.torchFadeT);
        torch.material.opacity = f * 0.85;
        torchLight.intensity = f * 6;
        if (this.torchFadeT >= 1) this.torchFadeT = -1;
      }
    },

    _updateChest(dt, player) {
      if (!chestGroup.visible || this.laterneCollected) return;
      if (!this.chestOpened) {
        const dx = player.pos.x - chestGroup.position.x, dz = player.pos.z - chestGroup.position.z;
        if (dx * dx + dz * dz < 1.4 * 1.4) {
          this.chestOpened = true;
          this.chestOpenT = 0;
          audio?.chime?.('fanfare');
          const wp = new THREE.Vector3();
          chestGroup.getWorldPosition(wp);
          wp.y += 0.55;
          fx?.burst(wp, 0xcfe8ff, 26, 4, { gravity: -1, life: 1.0 });
          this._spawnLantern(wp);
        }
      }
      if (this.chestOpenT >= 0) {
        this.chestOpenT += dt / 1.0;
        const f = clamp01(this.chestOpenT);
        chestLidPivot.rotation.x = -1.9 * f;
        chestGlow.scale.setScalar(0.1 + f * 1.1);
        chestGlowMat.opacity = f < 0.5 ? f * 1.6 : (1 - f) * 1.6;
        if (this.chestOpenT >= 1) this.chestOpenT = -1;
      }
    },

    _spawnLantern(fromPos) {
      const mat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xcfe8ff, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.6);
      sprite.position.copy(fromPos);
      scene.add(sprite);
      this._lantern = { sprite, from: fromPos.clone(), t: 0 };
    },

    _updateLantern(dt, player) {
      const l = this._lantern;
      if (!l) return;
      l.t += dt / 0.8;
      if (l.t >= 1) {
        scene.remove(l.sprite);
        this._lantern = null;
        this.laterneCollected = true;
        this.fogOpacityMul = 0.6;
        hud?.showToast('🏮 Die Silberne Seelenlaterne ist dein! Das Moor wird heller.', 4.5);
        return;
      }
      const target = { x: player.pos.x, y: player.pos.y + 1.5, z: player.pos.z };
      arcPos(l.sprite, l.from, target, clamp01(l.t), 1.8);
    },

    update(dt, player) {
      this._time = (this._time || 0) + dt;
      for (const s of fogSprites) {
        const u = s.userData;
        u.angle += u.speed * dt;
        s.position.x = MOOR.x + Math.cos(u.angle) * u.radius;
        s.position.z = MOOR.z + Math.sin(u.angle) * u.radius;
        s.material.opacity = u.baseOpacity * this.fogOpacityMul;
      }
      if (!this.signSeen && player) {
        const dx = player.pos.x - SIGN_POS.x, dz = player.pos.z - SIGN_POS.z;
        if (dx * dx + dz * dz < 25) {
          this.signSeen = true;
          hud?.showToast('„Hier endet der Schutz des Schlosses. Was hier friert, friert von innen.“', 4.5);
        }
      }
      if (player) {
        this._updateSoulLights(dt, player);
        this._updateChest(dt, player);
        this._updateLantern(dt, player);
      }
      this._updateDoor(dt);
    },

    // Setzt den kompletten Seelenlichter/Krypta-Zustand SOFORT (ohne
    // Animation/Sound) — für Save-Reload und den Reset-Button.
    restore(state = {}) {
      const delivered = new Set(state.lichter || []);
      this.carriedList.length = 0;
      for (const l of soulLights) {
        const idx = soulLights.indexOf(l);
        if (delivered.has(l.id)) {
          l.state = 'delivered';
          l.sprite.visible = false;
          for (const m of l.motes) m.visible = false;
          nicheGlows[idx].material.opacity = 0.9;
        } else {
          l.state = 'atSpot';
          l.sprite.visible = true;
          for (const m of l.motes) m.visible = true;
          nicheGlows[idx].material.opacity = 0.15;
        }
      }
      const doorOpen = this.deliveredCount === 5;
      this.doorAnimT = -1;
      this.torchFadeT = -1;
      doorMesh.position.x = doorOpen ? doorOpenX : doorClosedX;
      doorBlocker.disabled = doorOpen;
      torch.visible = doorOpen;
      torch.material.opacity = doorOpen ? 0.85 : 0;
      torchLight.intensity = doorOpen ? 6 : 0;
      chestGroup.visible = doorOpen;

      this.laterneCollected = !!state.laterne;
      this.fogOpacityMul = this.laterneCollected ? 0.6 : 1;
      this.chestOpened = this.laterneCollected;
      this.chestOpenT = -1;
      chestLidPivot.rotation.x = this.laterneCollected ? -1.9 : 0;
      chestGlowMat.opacity = 0;
      if (this._lantern) { scene.remove(this._lantern.sprite); this._lantern = null; }
    },

    save() {
      return {
        lichter: soulLights.filter((l) => l.state === 'delivered').map((l) => l.id),
        laterne: this.laterneCollected ? 1 : 0,
      };
    },
  };
  return moor;
}
