// Einstiegspunkt: baut die Welt schrittweise auf (mit Ladebalken),
// verdrahtet Menü/Pointer-Lock, betreibt die Spielschleife inkl.
// automatischer Qualitätsanpassung (Render-Auflösung nach FPS).

import * as THREE from 'three';
import { buildTerrain, buildWater } from './terrain.js';
import { SkySystem } from './sky.js';
import { buildCastle } from './castle.js';
import { buildStructures } from './structures.js';
import { buildNature, LifeSystem, makeGlowTexture } from './props.js';
import { Collectibles } from './collectibles.js';
import { Player } from './player.js';
import { SoundManager } from './audio.js';
import { Hud } from './hud.js';
import { FxSystem } from './fx.js';
import { WandSystem, SPELLS, SPELL_ORDER } from './wand.js';
import { SpellSystem } from './spells.js';

const SAVE_KEY = 'hogwarts3d-save-v1';

function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; }
  catch { return {}; }
}
function writeSave(data) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* privat-modus etc. */ }
}

// ---------- Renderer & Szene ----------
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
const MAX_PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 1.75);
let pixelRatio = MAX_PIXEL_RATIO;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 2600);
// Die Kamera muss Teil des Szenegraphs sein, sonst rendert three.js ihre
// Kinder (den Zauberstab) nicht mit (renderer.render traversiert nur scene).
scene.add(camera);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (fx) fx.onResize();
});

// ---------- Welt schrittweise aufbauen ----------
const hud = new Hud();
const audio = new SoundManager();
const save = loadSave();

let sky, water, castle, structures, life, collectibles, player;
let fx, wand, spells;
const glowTex = makeGlowTexture();

const buildSteps = [
  ['Himmel & Licht', () => { sky = new SkySystem(scene); if (save.t) sky.timeOfDay = save.t; }],
  ['Gelände', () => { scene.add(buildTerrain()); }],
  ['See', () => { water = buildWater(); scene.add(water.mesh); }],
  ['Schloss', () => { castle = buildCastle(scene); castle.setGlowTexture(glowTex); }],
  ['Bootshaus, Hütte & Feld', () => { structures = buildStructures(scene); }],
  ['Wälder & Wiesen', () => { buildNature(scene); }],
  ['Leben & Magie', () => {
    life = new LifeSystem(scene, glowTex, [...castle.flames, ...structures.flames]);
    collectibles = new Collectibles(scene, glowTex, save.collected || []);
    hud.setCounter(collectibles.count, collectibles.total);
  }],
  ['Spieler', () => { player = new Player(camera); }],
  ['Zauberstab', () => {
    fx = new FxSystem(scene, renderer);
    wand = new WandSystem(camera, glowTex);
    spells = new SpellSystem(scene, wand, fx, audio);
    hud.buildSpellbar(SPELL_ORDER.map(id => ({ id, ...SPELLS[id] })));
  }],
];

const loadingBar = document.getElementById('loading-bar');
const menuLoading = document.getElementById('menu-loading');
const menuMain = document.getElementById('menu-main');

async function buildWorld() {
  for (let i = 0; i < buildSteps.length; i++) {
    const [, fn] = buildSteps[i];
    // setTimeout statt requestAnimationFrame: rAF friert in inaktiven Tabs ein
    await new Promise(r => setTimeout(r, 0));
    fn();
    loadingBar.style.width = `${((i + 1) / buildSteps.length) * 100}%`;
  }
  await new Promise(r => setTimeout(r, 0));
  menuLoading.classList.add('hidden');
  menuMain.classList.remove('hidden');
}

// ---------- Menü & Pointer-Lock ----------
const menu = document.getElementById('menu');
const btnStart = document.getElementById('btn-start');
const btnSound = document.getElementById('btn-sound');
const btnReset = document.getElementById('btn-reset');

let playing = false;
let started = false;

audio.setMuted(save.muted === true);
btnSound.textContent = `Ton: ${audio.muted ? 'aus' : 'an'}`;

function persist() {
  writeSave({
    collected: collectibles ? collectibles.collectedIds : [],
    muted: audio.muted,
    t: sky ? sky.timeOfDay : undefined,
  });
}

// Spielzustand zentral schalten (Pointer-Lock ODER Fallback ohne Lock)
let fallbackMode = false;

function setPlaying(on) {
  playing = on;
  if (player) player.enabled = on;
  menu.classList.toggle('hidden', on);
  hud.setActive(on);
  if (on && !started) {
    started = true;
    hud.showToast('Finde die 12 goldenen Schnätze! ✦', 4.5);
  }
  if (!on) {
    btnStart.textContent = 'Weiterspielen';
    persist();
  }
}

btnStart.addEventListener('click', () => {
  audio.init();
  let locked = false;
  const onChange = () => { locked = document.pointerLockElement === canvas; };
  document.addEventListener('pointerlockchange', onChange, { once: true });
  try { canvas.requestPointerLock(); } catch { /* Fallback unten */ }
  // Wenn der Browser den Lock nicht gewährt: trotzdem starten (Ziehen zum Umsehen)
  setTimeout(() => {
    document.removeEventListener('pointerlockchange', onChange);
    if (!locked && !playing) {
      fallbackMode = true;
      if (player) player.dragLook = true;
      setPlaying(true);
      hud.showToast('Maus gedrückt halten zum Umsehen · Esc für Menü', 4);
    }
  }, 350);
});

btnSound.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  btnSound.textContent = `Ton: ${audio.muted ? 'aus' : 'an'}`;
  persist();
});

btnReset.addEventListener('click', () => {
  if (collectibles) {
    for (const item of collectibles.items) {
      if (item.collected) {
        item.collected = false;
        item.group.visible = true;
      }
    }
    collectibles.count = 0;
    hud.setCounter(0, collectibles.total);
  }
  persist();
  hud.showToast('Fortschritt zurückgesetzt');
});

document.addEventListener('pointerlockchange', () => {
  if (fallbackMode) return;
  setPlaying(document.pointerLockElement === canvas);
});

document.addEventListener('pointerlockerror', () => {
  hud.showToast('Maus-Steuerung konnte nicht aktiviert werden — bitte erneut klicken.');
});

// Nicht-Bewegungs-Tasten
const DIGIT_SPELLS = { Digit1: 'stupor', Digit2: 'incendio', Digit3: 'leviosa', Digit4: 'lumos' };
window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.code === 'Escape' && fallbackMode) {
    setPlaying(false);
  } else if (e.code === 'KeyT') {
    sky.advance(3);
    hud.showToast(`Zeit vorgespult → ${sky.clockText}`, 1.6);
  } else if (e.code === 'KeyM') {
    audio.setMuted(!audio.muted);
    btnSound.textContent = `Ton: ${audio.muted ? 'aus' : 'an'}`;
    hud.showToast(audio.muted ? 'Ton aus' : 'Ton an', 1.2);
    persist();
  } else if (e.code === 'KeyF') {
    hud.toggleFps();
  } else if (e.code === 'KeyL') {
    lumosOn = !lumosOn;
    wand.selectSpell('lumos');
    hud.showToast(lumosOn ? '✨ Lumos!' : 'Nox.', 1.4);
  } else if (DIGIT_SPELLS[e.code]) {
    wand.selectSpell(DIGIT_SPELLS[e.code]);
  }
});

// Zaubern: Maustaste (nur wenn Klick auf dem Canvas landet — HUD/Menü sind
// entweder pointer-events:none oder unsichtbar solange playing===true).
window.addEventListener('mousedown', (e) => {
  if (!playing || e.button !== 0 || e.target !== canvas) return;
  spells.cast(camera);
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  spells?.release();
});
window.addEventListener('wheel', (e) => {
  if (!playing) return;
  wand.cycleSpell(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

// ---------- Lumos (Lichtzauber am Spieler) ----------
const lumos = new THREE.PointLight(0xcfe0ff, 0, 20, 1.5);
scene.add(lumos);
let lumosOn = false;

// ---------- Spielschleife ----------
const clock = new THREE.Clock();
let time = 0;
let fpsEMA = 60;
let qualityTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  if (!player) return; // Welt noch im Aufbau

  const dt = Math.min(clock.getDelta(), 0.05);
  const rawFps = dt > 0 ? 1 / dt : 60;
  fpsEMA += (rawFps - fpsEMA) * 0.05;

  if (playing) frame(dt);

  renderer.render(scene, camera);
}

// Ein Simulationsschritt (vom Render-Loop und von __game.step() genutzt)
function frame(dt) {
  {
    time += dt;
    const move = player.update(dt);

    wand.update(dt, player, move);
    spells.update(dt, camera, null /* Kreaturen kommen in Phase 2 */);
    fx.update(dt);
    camera.position.add(fx.shakeOffset);

    sky.update(dt, player.pos);
    castle.update(dt, time, sky.state.nightGlow);
    structures.update(sky.state.nightGlow);
    life.update(dt, sky.state);
    collectibles.update(dt, time, player.pos);

    // Wasser-Uniforms mit der Tageszeit synchronisieren
    const wu = water.uniforms;
    wu.uTime.value = time;
    wu.uSunDir.value.copy(sky.state.sunDir);
    if (sky.state.sunDir.y < 0) wu.uSunDir.value.multiplyScalar(-1); // nachts: Mond
    wu.uSunColor.value.copy(sky.state.sunColor);
    wu.uSky.value.copy(sky.state.skyHorizon);
    wu.uNight.value = sky.state.nightGlow;

    audio.update(sky.state.daylight);
    if (audio.windGain) {
      const target = 0.04 + (move.hSpeed / 12) * 0.05 + (player.pos.y / 60) * 0.03;
      audio.windGain.gain.value += (target - audio.windGain.gain.value) * 0.02;
    }

    // Lumos folgt dem Spieler, wirkt vor allem im Dunkeln
    lumos.intensity = lumosOn ? 10 + sky.state.nightGlow * 26 : 0;
    if (lumosOn) lumos.position.set(player.pos.x, player.pos.y + 1.9, player.pos.z);

    hud.setClock(sky.clockText);
    hud.setHeading(player.heading);
    hud.setTracker(collectibles.nearest(player.pos), player.heading);
    hud.setSpell(wand.activeSpell, spells.cooldowns);
    hud.setFps(fpsEMA, pixelRatio);
    if (player.swimming) hud.showHint('Du schwimmst im See 🏊 — zurück ans Ufer!');
    else hud.hideHint();

    // Automatische Qualitätsanpassung
    qualityTimer += dt;
    if (qualityTimer > 2.5) {
      qualityTimer = 0;
      if (fpsEMA < 42 && pixelRatio > 0.6) {
        pixelRatio = Math.max(0.6, pixelRatio * 0.85);
        renderer.setPixelRatio(pixelRatio);
      } else if (fpsEMA > 57 && pixelRatio < MAX_PIXEL_RATIO) {
        pixelRatio = Math.min(MAX_PIXEL_RATIO, pixelRatio * 1.1);
        renderer.setPixelRatio(pixelRatio);
      }
    }
  }
}

// Sammel-Callback (nach Weltaufbau verdrahtet)
buildWorld().then(() => {
  player.onStep = (sprinting) => audio.step(sprinting);
  player.onJump = () => audio.jump();
  player.onLand = () => audio.land();
  // Debug-/Test-Zugriff (bewusst öffentlich, hilft bei Fehlersuche)
  window.__game = {
    player, sky, camera, renderer, scene,
    wand, spells, fx,
    get fps() { return fpsEMA; },
    get pixelRatio() { return pixelRatio; },
    collectibles,
    start: () => { fallbackMode = true; player.dragLook = true; setPlaying(true); },
    teleport: (x, z, yaw = null) => player.teleport(x, z, yaw),
    // Für automatisierte Tests: n Frames direkt simulieren (ohne rAF)
    step: (n = 60, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) frame(dt);
      renderer.render(scene, camera);
    },
    // Sofort in eine Richtung schauen und zaubern (Kamera-Rotation synchron
    // vor dem Cast aktualisieren, sonst nutzt getWorldDirection() die
    // Rotation vom letzten Frame)
    castAt: (yaw, pitch = 0) => {
      player.yaw = yaw;
      player.pitch = pitch;
      player.update(0);
      spells.cast(camera);
    },
  };
  collectibles.onCollect = (item, n, total) => {
    const done = n === total;
    audio.chime(done);
    hud.setCounter(n, total);
    hud.showToast(done
      ? `⚡ Alle ${total} Schnätze gefunden! Du kennst jetzt jeden Winkel des Schlosses.`
      : `✦ ${item.name} — ${n} / ${total}`, done ? 6 : 3);
    persist();
  };
  tick();
});
