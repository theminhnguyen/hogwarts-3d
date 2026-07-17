// NPCs & Quests: wandernde Schüler (reine Deko), Lena + Wirt Barnaby
// (Questgeber), Schlossgeist (dynamischer Hinweisgeber, liest den
// Spielstand), Katze Musch (Quest-Ziel Q1, Follow-FSM ohne Pathfinding).

import * as THREE from 'three';
import { terrainHeight, PATHS } from './terrain.js';
import { mulberry32 } from './noise.js';
import { GASTHAUS } from './village.js';
import { ARTIFACT_ORDER } from './puzzles.js';

const HOUSE_COLORS = [0xa62b2b, 0x2b6b35, 0x2b4b9b, 0xbfa32b];
const HAIR_COLORS = [0x2a1c10, 0x1a1a1a, 0x5a3c22, 0x8a7050];
const SKIN = 0xd9a878;
const ROBE_DARK = 0x272c3e;
const LENA_ROBE = 0x3a3350;
const BARNABY_ROBE = 0x4a3323;

const STUDENT_PATHS = [PATHS[0], PATHS[1], PATHS[3], PATHS[4]];
const LENA_POS = { x: 14, z: 20 };
const BARNABY_POS = { x: GASTHAUS.x, z: GASTHAUS.z + GASTHAUS.d / 2 - 1.7 };
const CAT_POS = { x: -95, z: 165 };
const GEIST_POS = { x: -32, z: 8 };

const PUZZLE_HINTS = {
  flamme: 'den drei Feuerschalen auf dem Viadukt',
  krone: 'den Druckplatten im Nordgarten',
  stein: 'dem Lied der Steine im Steinkreis',
  karte: 'dem Sternbild am Astronomieturm — nur nachts sichtbar',
};

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

// ---------- Figur: Robe (Kegel) + Kopf (Kugel) + Haar (Halbkugel) + Schal (Torus-Segment) ----------
function buildFigure(scarfColor, hairColor, robeColor = ROBE_DARK) {
  const group = new THREE.Group();

  const robeMat = new THREE.MeshLambertMaterial({ color: robeColor, flatShading: true, transparent: true });
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 8), robeMat);
  robe.position.y = 0.575;
  robe.castShadow = true;
  group.add(robe);

  const headMat = new THREE.MeshLambertMaterial({ color: SKIN, flatShading: true, transparent: true });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), headMat);
  head.position.y = 1.28;
  group.add(head);

  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor, flatShading: true, transparent: true });
  const hairGeo = new THREE.SphereGeometry(0.2, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.3;
  group.add(hair);

  const scarfMat = new THREE.MeshLambertMaterial({ color: scarfColor, flatShading: true, transparent: true });
  const scarfGeo = new THREE.TorusGeometry(0.16, 0.05, 5, 10, Math.PI * 1.5);
  scarfGeo.rotateX(Math.PI / 2);
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.position.y = 1.08;
  scarf.rotation.y = Math.random() * Math.PI * 2;
  group.add(scarf);

  return { group, robe, head, mats: [robeMat, headMat, hairMat, scarfMat], t: Math.random() * 10 };
}

function animateFigure(fig, dt, walking) {
  fig.t += dt;
  const freq = walking ? 6 : 1.4;
  const bobAmp = walking ? 0.035 : 0.015;
  fig.head.position.y = 1.28 + Math.sin(fig.t * freq) * bobAmp;
  fig.robe.rotation.z = Math.sin(fig.t * freq) * (walking ? 0.14 : 0.03);
}

function setFigureOpacity(fig, f) {
  for (const m of fig.mats) m.opacity = f;
  fig.group.visible = f > 0.01;
}

// ---------- Wandernde Schüler: reine Deko, kein Interakt ----------
class Student {
  constructor(scene, pathPts, idx) {
    const fig = buildFigure(HOUSE_COLORS[idx % 4], HAIR_COLORS[idx % 4]);
    for (const m of fig.mats) m.opacity = 1;
    this.fig = fig;
    this.group = fig.group;
    this.path = pathPts;
    this.idx = 1;
    this.dir = 1;
    this.speed = 1.2;
    this.state = 'walk';
    this.stateT = 0;
    this.pauseDur = 0;
    this.fade = 1;
    const [sx, sz] = pathPts[0];
    this.group.position.set(sx, terrainHeight(sx, sz), sz);
    scene.add(this.group);
  }

  update(dt, nightGlow) {
    if (nightGlow > 0.55) this.fade = Math.max(0, this.fade - dt / 2.5);
    else if (nightGlow < 0.35) this.fade = Math.min(1, this.fade + dt / 2.5);
    setFigureOpacity(this.fig, this.fade);
    if (this.fade <= 0.01) return;

    if (this.state === 'pause') {
      this.stateT += dt;
      animateFigure(this.fig, dt, false);
      if (this.stateT >= this.pauseDur) { this.state = 'walk'; this.stateT = 0; }
      return;
    }

    const [tx, tz] = this.path[this.idx];
    const dx = tx - this.group.position.x, dz = tz - this.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.4) {
      this.idx += this.dir;
      if (this.idx >= this.path.length) { this.idx = this.path.length - 2; this.dir = -1; }
      else if (this.idx < 0) { this.idx = 1; this.dir = 1; }
      if (Math.random() < 0.3) { this.state = 'pause'; this.stateT = 0; this.pauseDur = 7 + Math.random() * 5; }
    } else {
      const nx = dx / d, nz = dz / d;
      this.group.position.x += nx * this.speed * dt;
      this.group.position.z += nz * this.speed * dt;
      this.group.position.y = terrainHeight(this.group.position.x, this.group.position.z);
      this.group.rotation.y = Math.atan2(-nx, -nz);
      animateFigure(this.fig, dt, true);
    }
  }
}

// ---------- Katze Musch ----------
function buildCat(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x38363a, flatShading: true });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), mat);
  body.scale.set(1.3, 0.9, 1.7);
  body.position.y = 0.18;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 7, 5), mat);
  head.position.set(0, 0.27, 0.22);
  group.add(head);
  for (const s of [-1, 1]) {
    const earGeo = new THREE.ConeGeometry(0.04, 0.08, 4);
    earGeo.translate(s * 0.06, 0.34, 0.23);
    group.add(new THREE.Mesh(earGeo, mat));
  }
  const tailGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.4, 5);
  tailGeo.rotateX(-0.9);
  tailGeo.translate(0, 0.22, -0.26);
  const tail = new THREE.Mesh(tailGeo, mat);
  group.add(tail);
  scene.add(group);
  return { group, tail, t: 0 };
}

// ---------- Schlossgeist: halbtransparent, freundlich warmweiß ----------
function buildGeist(scene, glowTex) {
  const group = new THREE.Group();
  const cloakMat = new THREE.MeshLambertMaterial({
    color: 0xfff3d6, transparent: true, opacity: 0.5, flatShading: true, side: THREE.DoubleSide,
  });
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.7, 10, 1, true), cloakMat);
  cloak.position.y = 0.85;
  group.add(cloak);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 9, 7), cloakMat);
  head.position.y = 1.75;
  group.add(head);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(3.2);
  glow.position.y = 1.1;
  group.add(glow);
  group.position.set(GEIST_POS.x, terrainHeight(GEIST_POS.x, GEIST_POS.z) + 1.3, GEIST_POS.z);
  scene.add(group);
  return { group, cloak, head, t: 0 };
}

export function buildNpcs(scene, glowTex, hud, audio, fx, health, interact, deps) {
  // deps = { collectibles, puzzles, spells, moor, dementors }
  const students = STUDENT_PATHS.map((p, i) => new Student(scene, p, i));

  const lenaFig = buildFigure(0x8a4a6a, 0x3a2412, LENA_ROBE);
  for (const m of lenaFig.mats) m.opacity = 1;
  lenaFig.group.position.set(LENA_POS.x, terrainHeight(LENA_POS.x, LENA_POS.z), LENA_POS.z);
  scene.add(lenaFig.group);

  const barnabyFig = buildFigure(0x2b6b35, 0x1a1a1a, BARNABY_ROBE);
  for (const m of barnabyFig.mats) m.opacity = 1;
  barnabyFig.group.scale.setScalar(1.12);
  barnabyFig.group.position.set(BARNABY_POS.x, terrainHeight(BARNABY_POS.x, BARNABY_POS.z), BARNABY_POS.z);
  scene.add(barnabyFig.group);

  const geist = buildGeist(scene, glowTex);
  const cat = buildCat(scene);
  let catFollowing = false;
  let currentPlayer = null;

  const quests = { katze: 0, kraeuter: 0, kraeuterDone: 0, kraeuterStarted: 0 };
  let onQuestChange = null; // von main.js gesetzt, ruft persist()

  const leuchtkraeuter = deps.leuchtkraeuter || [];
  const kraeuterEntries = [];

  function placeCatHome() {
    if (quests.katze >= 2) {
      cat.group.position.set(LENA_POS.x + 1.1, terrainHeight(LENA_POS.x + 1.1, LENA_POS.z + 0.6), LENA_POS.z + 0.6);
    } else {
      cat.group.position.set(CAT_POS.x, terrainHeight(CAT_POS.x, CAT_POS.z), CAT_POS.z);
    }
    catFollowing = false;
  }
  placeCatHome();

  interact.register({
    x: LENA_POS.x, z: LENA_POS.z, r: 2.4, prompt: 'E — Mit Lena sprechen',
    onInteract: () => {
      if (quests.katze === 0) {
        hud.showDialog('Lena', [
          'Hast du meine Katze gesehen? Musch ist weggelaufen…',
          'Ich glaube, sie ist Richtung See gelaufen, zum Bootshaus.',
          'Bitte, wenn du sie findest — sag ihr, sie soll heimkommen!',
        ], () => { quests.katze = 1; onQuestChange?.(); });
      } else if (quests.katze === 1 && catFollowing) {
        hud.showDialog('Lena', [
          'Musch! Da bist du ja! Vielen Dank, dass du sie gefunden hast!',
          'Hier — das ist für dich.',
        ], () => {
          quests.katze = 2;
          placeCatHome();
          health.hearts = health.maxHearts;
          audio.chime('fanfare');
          fx.burst(
            { x: lenaFig.group.position.x, y: lenaFig.group.position.y + 1.2, z: lenaFig.group.position.z },
            0xffcf8a, 24, 4, { gravity: -3, life: 0.9, size: 0.3 }
          );
          hud.showToast('✨ Quest abgeschlossen: Die verlorene Katze — Herzen aufgefrischt!', 4);
          onQuestChange?.();
        });
      } else if (quests.katze === 1) {
        hud.showDialog('Lena', ['Hast du Musch schon gefunden? Sie war zuletzt beim Bootshaus.']);
      } else {
        hud.showDialog('Lena', ['Danke nochmal, dass du Musch gefunden hast!']);
      }
    },
  });

  interact.register({
    x: BARNABY_POS.x, z: BARNABY_POS.z, r: 2.4, prompt: 'E — Mit Barnaby sprechen',
    onInteract: () => {
      if (!quests.kraeuterStarted && !quests.kraeuterDone) {
        hud.showDialog('Barnaby', [
          'Ah, ein Abenteurer! Ich brauche etwas für meinen Kessel.',
          'Im Gewächshaus wachsen Leuchtkräuter — bring mir drei davon!',
        ], () => { quests.kraeuterStarted = 1; onQuestChange?.(); });
      } else if (!quests.kraeuterDone && quests.kraeuter < 3) {
        hud.showDialog('Barnaby', [`Noch ${3 - quests.kraeuter} Leuchtkräuter, dann kann ich brauen!`]);
      } else if (!quests.kraeuterDone) {
        hud.showDialog('Barnaby', [
          'Alle drei? Wunderbar, danke dir!',
          'Als Dank braue ich dir etwas Wärmendes — das hält den Frost fern.',
        ], () => {
          quests.kraeuterDone = 1;
          audio.chime('fanfare');
          hud.showToast('🔥 Quest abgeschlossen: Kräuter für den Kessel — "Warm ums Herz" wirkt jetzt dauerhaft!', 4.5);
          onQuestChange?.();
        });
      } else {
        hud.showDialog('Barnaby', ['Danke nochmal für die Leuchtkräuter — mein Kessel dampft wie nie zuvor.']);
      }
    },
  });

  leuchtkraeuter.slice(0, 3).forEach((lk, i) => {
    const entry = interact.register({
      x: lk.x, z: lk.z, r: 1.6, prompt: 'E — Leuchtkraut pflücken',
      enabled: false,
      onInteract: () => {
        if (quests.kraeuter > i) return;
        quests.kraeuter++;
        lk.sprite.visible = false;
        entry.enabled = false;
        audio.chime();
        hud.showToast(`✦ Leuchtkraut eingesammelt (${quests.kraeuter}/3)`, 2);
        onQuestChange?.();
      },
    });
    kraeuterEntries.push(entry);
  });

  const catEntry = interact.register({
    get x() { return cat.group.position.x; },
    get z() { return cat.group.position.z; },
    r: 2, prompt: 'E — Musch ansprechen', enabled: false,
    onInteract: () => {
      if (quests.katze !== 1 || catFollowing) return;
      catFollowing = true;
      hud.showToast('🐾 Musch schnurrt und folgt dir jetzt!', 2.5);
    },
  });

  interact.register({
    x: GEIST_POS.x, z: GEIST_POS.z, r: 3, prompt: 'E — Mit dem Schlossgeist sprechen',
    onInteract: () => {
      const lines = [];
      if (deps.spells.epUnlocked && !deps.moor.laterneCollected) {
        lines.push('Im Nebelmoor wartet noch die Silberne Seelenlaterne auf dich…');
        lines.push('Fünf Seelenlichter müssen heimkehren, bevor sich die Krypta öffnet.');
      } else if (deps.puzzles.artifactCount < ARTIFACT_ORDER.length) {
        const missing = ARTIFACT_ORDER.find((id) => !deps.puzzles.artifacts.has(id));
        const hint = PUZZLE_HINTS[missing] || 'einen vergessenen Winkel des Schlosses';
        lines.push('Noch nicht alle Geheimnisse dieses Schlosses sind gelüftet…');
        lines.push(`Versuch dich an ${hint}.`);
      } else if (deps.collectibles.count < deps.collectibles.total) {
        let nearest = null, nearestD = Infinity;
        if (currentPlayer) {
          for (const item of deps.collectibles.items) {
            if (item.collected) continue;
            const d = Math.hypot(item.group.position.x - currentPlayer.pos.x, item.group.position.z - currentPlayer.pos.z);
            if (d < nearestD) { nearestD = d; nearest = item; }
          }
        }
        lines.push(`${deps.collectibles.total - deps.collectibles.count} Schnätze schweben noch irgendwo im Schloss…`);
        lines.push(nearest ? `Ich spüre goldenes Glitzern — „${nearest.name}“.` : 'Wo genau, weiß selbst ich nicht mehr.');
      } else {
        lines.push('Du hast schon fast alles gesehen, was dieses Schloss zu bieten hat.');
        lines.push('Ich bin stolz auf dich, kleiner Zauberer.');
      }
      hud.showDialog('Schlossgeist', lines);
    },
  });

  return {
    quests,
    set onQuestChange(fn) { onQuestChange = fn; },

    save() { return { ...quests }; },

    // Lehre aus moor.js/creatures.js: restore setzt ALLES synchron zurück —
    // auch die Katzen-Position, nicht nur den Zahlenstand.
    restore(saved) {
      Object.assign(quests, {
        katze: 0, kraeuter: 0, kraeuterDone: 0, kraeuterStarted: 0,
      }, saved || {});
      catFollowing = false; // Save-Reload holt die Katze IMMER zurück nach Hause
      placeCatHome();
      for (let i = 0; i < kraeuterEntries.length; i++) {
        const picked = quests.kraeuter > i;
        leuchtkraeuter[i].sprite.visible = !picked;
        kraeuterEntries[i].enabled = false;
      }
    },

    update(dt, player, skyState) {
      currentPlayer = player;
      for (const s of students) s.update(dt, skyState.nightGlow);

      animateFigure(lenaFig, dt, false);
      animateFigure(barnabyFig, dt, false);

      geist.t += dt;
      geist.group.position.y = terrainHeight(GEIST_POS.x, GEIST_POS.z) + 1.3 + Math.sin(geist.t * 0.6) * 0.15;
      geist.group.rotation.y = geist.t * 0.2;

      cat.t += dt;
      cat.tail.rotation.z = Math.sin(cat.t * 2.4) * 0.2;
      if (catFollowing && currentPlayer) {
        const dx = currentPlayer.pos.x - cat.group.position.x, dz = currentPlayer.pos.z - cat.group.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 25) {
          // Kein Pathfinding: bei zu großer Distanz einfach hinter den Spieler springen.
          const bx = currentPlayer.pos.x + Math.sin(currentPlayer.yaw) * 2.2;
          const bz = currentPlayer.pos.z + Math.cos(currentPlayer.yaw) * 2.2;
          cat.group.position.set(bx, terrainHeight(bx, bz), bz);
        } else if (d > 1.4) {
          const speed = 3.4;
          const nx = dx / d, nz = dz / d;
          cat.group.position.x += nx * speed * dt;
          cat.group.position.z += nz * speed * dt;
          cat.group.position.y = terrainHeight(cat.group.position.x, cat.group.position.z);
          cat.group.rotation.y = Math.atan2(-nx, -nz);
        }
      }

      // Interakt-Reichweiten für bewegliche/zustandsabhängige Ziele live nachziehen
      catEntry.enabled = quests.katze === 1 && !catFollowing;
      for (let i = 0; i < kraeuterEntries.length; i++) {
        kraeuterEntries[i].enabled = quests.kraeuterStarted === 1 && !quests.kraeuterDone && quests.kraeuter <= i;
      }
    },
  };
}
