// Einstiegspunkt: baut die Welt schrittweise auf (mit Ladebalken),
// verdrahtet Menü/Pointer-Lock, betreibt die Spielschleife inkl.
// automatischer Qualitätsanpassung (Render-Auflösung nach FPS).

import * as THREE from 'three';
import { buildTerrain, buildWater, ASCHENKLAMM, FROSTZINNEN } from './terrain.js';
import { SkySystem } from './sky.js';
import { buildCastle } from './castle.js';
import { buildStructures } from './structures.js';
import { buildNature, LifeSystem, makeGlowTexture, updateSway } from './props.js';
import { Collectibles } from './collectibles.js';
import { Player } from './player.js';
import { SoundManager } from './audio.js';
import { Hud } from './hud.js';
import { FxSystem } from './fx.js';
import { WandSystem, SPELLS, SPELL_ORDER } from './wand.js';
import { SpellSystem } from './spells.js';
import { HealthSystem } from './health.js';
import { CreatureSystem, setFaunaPrey } from './creatures.js';
import { DementorSystem } from './dementor.js';
import { PuzzleSystem } from './puzzles.js';
import { buildMoor } from './moor.js';
import { WeatherSystem } from './weather.js';
import { PostFX } from './post.js';
import { buildVillage } from './village.js';
import { buildTrain } from './train.js';
import { buildWillow } from './willow.js';
import { InteractSystem } from './interact.js';
import { buildNpcs } from './npc.js';
import { buildGrove } from './grove.js';
import { buildBroom } from './broom.js';
import { buildFahlholz, buildHuegelgrab, buildKate } from './wildmark.js';
import { buildHome } from './home.js';
import { buildFauna } from './fauna.js';
import { EconomySystem } from './economy.js';
import { buildWilderer } from './wilderer.js';
import { buildMount } from './mount.js';
import { buildDark } from './dark.js';
import { buildCompanion } from './companion.js';
import { buildHallows } from './hallows.js';
import { buildAnimagus, FORM_ORDER, FORM_LABEL } from './animagus.js';
import { buildMarauderMap } from './marauders-map.js';
import { buildTutorial } from './tutorial.js';
import { createRegionManager } from './regions.js';
import { createAtmosphereSystem } from './atmosphere.js';
import { buildAschenklamm } from './aschenklamm.js';
import { buildFrostzinnen } from './frostzinnen.js';
import { loadSave as loadSaveFromStorage, writeSave as writeSaveToStorage, createExport, parseImport, SAVE_KEY, MAX_IMPORT_BYTES } from './save.js';

function loadSave() { return loadSaveFromStorage(localStorage); }
function writeSave(data) { writeSaveToStorage(localStorage, data); }

// Sonnet-5-Polish (A3/A4): zwei rotierende Backup-Slots statt nur einem —
// beim Import/Reset wird jeweils der ÄLTERE Slot überschrieben, sodass immer
// mindestens eine ältere Sicherung erhalten bleibt. Da Import einen
// window.location.reload() auslöst (main.js-Neustart, siehe unten), darf
// "welcher Slot ist neuer" NICHT im flüchtigen JS-Speicher stehen — daher
// ein Zeitstempel-Begleitschlüssel (`-t`) direkt in localStorage.
const BACKUP_KEYS = ['hogwarts3d-backup-a', 'hogwarts3d-backup-b'];
function backupCurrentSave() {
  try {
    const times = BACKUP_KEYS.map((k) => Number(localStorage.getItem(`${k}-t`)) || 0);
    const target = times[0] <= times[1] ? BACKUP_KEYS[0] : BACKUP_KEYS[1];
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      localStorage.setItem(target, raw);
      localStorage.setItem(`${target}-t`, String(Date.now()));
    }
  } catch { /* privat-modus etc. */ }
}
function newestBackup() {
  try {
    const times = BACKUP_KEYS.map((k) => Number(localStorage.getItem(`${k}-t`)) || 0);
    if (times[0] === 0 && times[1] === 0) return null;
    const key = times[0] >= times[1] ? BACKUP_KEYS[0] : BACKUP_KEYS[1];
    return localStorage.getItem(key);
  } catch { return null; }
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

// PLAN-EPISCHE-WELT.md (E0d/E0e): Region-Streaming-Fundament. Braucht nur
// `scene`, deshalb schon hier erzeugt statt als eigener Build-Step — spätere
// Meilensteine (E4+) rufen einfach regionManager.register(...) in ihrem
// jeweiligen Build-Step auf, ohne main.js sonst anfassen zu müssen. Aktuell
// (E0) noch ohne registrierten Content — reines Fundament, siehe
// TESTPLAN-1.0.md/Browser-Verifikation für den Wake/Sleep-Nachweis.
const regionManager = createRegionManager(scene);
// PLAN-EPISCHE-WELT.md (E3): Regions-Atmosphäre-Fundament, ebenfalls noch
// ohne registrierte echte Zonen — die neuen Regionen (E4+) registrieren
// sich hier mit ihrer jeweiligen Himmelsfärbung/Nebel/Ambient-Sound.
const atmosphere = createAtmosphereSystem();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (fx) fx.onResize();
  post.resize();
});

// ---------- Welt schrittweise aufbauen ----------
const hud = new Hud();
const audio = new SoundManager();
const save = loadSave();
const post = new PostFX(renderer, scene, camera);
post.setQuality(save.grafik);
post.onDegrade = () => hud.showToast('Grafik automatisch reduziert (Bloom aus)', 3.5);

let sky, water, castle, structures, moor, life, collectibles, player;
let fx, wand, spells, health, creatures, puzzles, dementors, weather, village, train, willow, interact, npc, grove, broom, fahlholz, fauna, economy, wilderer, mount, kate, home, dark, companion, hallows, huegelgrab, animagus, tutorial, marauders;
let aschenklammRegion; // E4: RegionManager-Handle (regions.js) — Register-Aufruf selbst läuft eigenständig als Build-Step weiter unten
let frostzinnenRegion; // E5: dito für die Frostzinnen
let lanternWasCollected = false; // erkennt den Moment, in dem die Laterne live geborgen wird
let natureSwayMaterials = [];
let natureTreeSpots = []; // S2: echte Baum-Positionen für Bowtruckles (fauna.js)
const glowTex = makeGlowTexture();

// ---------- Kürbis-Gag: Incendio auf die Kürbisse vor Hagrids Hütte ----------
// entzündet sie zu Jack-o'-Laternen — warmes Licht + Glow, klingt über 10s ab.
const pumpkinGlows = [];
let pumpkinFirstFound = false;

function buildPumpkinGlows() {
  for (const p of structures.pumpkins) {
    const light = new THREE.PointLight(0xffa438, 0, 6, 2);
    light.position.set(p.x, p.y + 0.3, p.z);
    scene.add(light);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffa438, transparent: true,
      opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.setScalar(p.radius * 2.4);
    glow.position.set(p.x, p.y + 0.2, p.z);
    scene.add(glow);
    const entry = { light, glow, fade: 0 };
    pumpkinGlows.push(entry);
    spells.registerTarget({
      kind: 'pumpkin', radius: p.radius + 0.35, accepts: ['incendio'],
      getPos: () => p,
      onSpell: () => {
        entry.fade = 10;
        fx.burst(p, 0xffa438, 10, 3, { gravity: -2, life: 0.5 });
        if (!pumpkinFirstFound) {
          pumpkinFirstFound = true;
          hud.showToast("Jack-o'-Lantern! 🎃", 3);
        }
      },
    });
  }
}

function updatePumpkinGlows(dt) {
  for (const g of pumpkinGlows) {
    if (g.fade <= 0) continue;
    g.fade = Math.max(0, g.fade - dt);
    const t = g.fade / 10;
    g.light.intensity = 8 * t;
    g.glow.material.opacity = 0.8 * t;
  }
}

const buildSteps = [
  ['Himmel & Licht', () => { sky = new SkySystem(scene); if (save.t) sky.timeOfDay = save.t; }],
  ['Wetter', () => { weather = new WeatherSystem(scene, hud, audio); }],
  ['Gelände', () => { scene.add(buildTerrain()); }],
  ['See', () => { water = buildWater(); scene.add(water.mesh); }],
  ['Schloss', () => { castle = buildCastle(scene); castle.setGlowTexture(glowTex); }],
  ['Bootshaus, Hütte & Feld', () => { structures = buildStructures(scene); }],
  ['Wälder & Wiesen', () => {
    const nature = buildNature(scene);
    natureSwayMaterials = nature.swayMaterials;
    natureTreeSpots = nature.treeSpots;
  }],
  ['Leben & Magie', () => {
    life = new LifeSystem(scene, glowTex, [...castle.flames, ...structures.flames], structures.owlPerches);
    collectibles = new Collectibles(scene, glowTex, save.collected || []);
    hud.setCounter(collectibles.count, collectibles.total);
  }],
  ['Spieler', () => { player = new Player(camera); }],
  ['Zauberstab', () => {
    fx = new FxSystem(scene, renderer);
    wand = new WandSystem(camera, glowTex);
    spells = new SpellSystem(scene, wand, fx, audio, hud, glowTex, player, save.dunkel);
    hud.buildSpellbar(SPELL_ORDER.map(id => ({ id, ...SPELLS[id] })));
    buildPumpkinGlows();
  }],
  // Braucht fx+audio (Truhen-Effekte, Sounds) — deshalb erst NACH 'Zauberstab'.
  ['Nebelmoor', () => {
    moor = buildMoor(scene, glowTex, hud, audio, fx);
    moor.restore(save.moor);
    if (moor.laterneCollected) { lanternWasCollected = true; showLanternWon(); }
  }],
  ['Rätsel', () => {
    puzzles = new PuzzleSystem(scene, spells, fx, audio, hud, glowTex, structures, collectibles);
    puzzles.restore(save.pz, save.art);
    if (puzzles.finaleWon) showHauspokalWon();
  }],
  ['Kreaturen & Gesundheit', () => {
    health = new HealthSystem(player, hud, fx, audio, save.pz?.maxHearts || 5);
    creatures = new CreatureSystem(scene, fx, audio, health, collectibles, hud, glowTex, save.heim);
    creatures.restoreTroll(save.pz?.troll, save.pz?.trollChest);
    if (save.peaceful) creatures.peaceful = true;
    hud.setHearts(health.hearts, health.effectiveMaxHearts);
  }],
  ['Dementoren', () => {
    dementors = new DementorSystem(scene, fx, audio, health, hud, glowTex);
    if (save.peaceful) dementors.peaceful = true;
  }],
  ['Dorf & Bahn', () => {
    village = buildVillage(scene, glowTex, hud, audio, health, fx);
    train = buildTrain(scene, glowTex, audio);
    train.onSmoke = (pos) => fx.trail(pos, 0x9aa0a8);
  }],
  // Braucht nur hud+save — bewusst früh, damit 'Fauna' (Niffler-Gold) und
  // 'NPCs & Quests' (Fero) beide bereits darauf zugreifen können.
  ['Wirtschaft', () => {
    economy = new EconomySystem(hud, save);
  }],
  ['Peitschende Weide', () => {
    willow = buildWillow(scene, glowTex, audio, fx, health);
    willow.restore(save.pz?.willowChest);
    if (save.peaceful) willow.peaceful = true;
  }],
  ['NPCs & Quests', () => {
    interact = new InteractSystem(hud);
    npc = buildNpcs(scene, glowTex, hud, audio, fx, health, interact, {
      collectibles, puzzles, spells, moor, dementors,
      leuchtkraeuter: structures.leuchtkraeuter,
      train, economy, heim: save.heim, mounts: save.mounts, dunkel: save.dunkel,
      begleiter: save.begleiter, hallows: save.hallows, animagus: save.animagus,
      wild: save.wild,
    });
    npc.restore(save.quests);
    npc.onQuestChange = () => persist();
  }],
  ['Spinnennest', () => {
    grove = buildGrove(scene, glowTex, hud, audio, fx, health);
    grove.restore(save.pz?.spinnerChest);
    grove.onChestOpen = () => persist();
    grove.nets.forEach((net, i) => {
      spells.registerTarget({
        kind: 'web', radius: 1.6, accepts: ['incendio'],
        getPos: () => net,
        onSpell: () => grove.burnNet(i),
      });
    });
  }],
  ['Besenflug', () => {
    broom = buildBroom(scene, camera, glowTex, hud, audio, fx, interact, wand);
    broom.restore(save);
    if (broom.ace) showAceWon();
    broom.onUnlock = () => persist();
    broom.onFinish = () => { if (broom.ace) showAceWon(); persist(); };
  }],
  ['Wildmark', () => {
    // S1: Fahlholz/Hügelgrab bleiben reine Deko (Grabkammer-Öffnung erst
    // S10). Die Kate liefert jetzt (S7) ihr setOwned()-Handle für home.js.
    fahlholz = buildFahlholz(scene);
    huegelgrab = buildHuegelgrab(scene);
    kate = buildKate(scene, glowTex);
  }],
  // E4 (PLAN-EPISCHE-WELT.md): Region-Registrierung ist bewusst billig — die
  // eigentliche Aschenklamm (Terrain-Deko, Drache, Rätsel, Quest) baut erst
  // buildAschenklamm() lazy beim ersten Wecken (regions.js), NICHT hier.
  // Braucht health/interact/spells (Kreaturen & Gesundheit/NPCs & Quests
  // laufen bereits) — reine Registrierung, keine echte 3D-Arbeit.
  ['Aschenklamm (Region)', () => {
    aschenklammRegion = regionManager.register({
      key: 'aschenklamm',
      center: { x: ASCHENKLAMM.x, z: ASCHENKLAMM.z },
      // wakeRadius < sleepRadius (Hysterese, Stolperfalle #15) — Puffer bis
      // zum nächsten Alt-Bestand (Hügelgrab/Kate/Fahlholz, ≥107m entfernt,
      // siehe terrain.js-Kommentar) bleibt auch bei sleepRadius=130 gewahrt.
      wakeRadius: 90,
      sleepRadius: 130,
      build: (root, deps) => buildAschenklamm(root, deps),
      deps: {
        glowTex, hud, audio, fx, health, interact, spells,
        aschenklamm: save.aschenklamm, siegel: save.siegel, heim: save.heim,
        onChange: () => persist(),
      },
    });
    atmosphere.registerZone({
      center: { x: ASCHENKLAMM.x, z: ASCHENKLAMM.z }, radius: ASCHENKLAMM.r + 15, feather: 70,
      color: 0xff4420, fogFarMul: 0.78, ambientMul: 1.12, soundId: 'aschenklamm',
    });
  }],
  // E5: gleiches Muster wie Aschenklamm — reine Registrierung, buildFrostzinnen()
  // baut erst lazy beim ersten Wecken.
  ['Frostzinnen (Region)', () => {
    frostzinnenRegion = regionManager.register({
      key: 'frostzinnen',
      center: { x: FROSTZINNEN.x, z: FROSTZINNEN.z },
      // Puffer bis zum nächsten Alt-Bestand (Dorf, ≥193m entfernt, siehe
      // terrain.js-Kommentar) bleibt auch bei sleepRadius=130 klar gewahrt.
      wakeRadius: 90,
      sleepRadius: 130,
      build: (root, deps) => buildFrostzinnen(root, deps),
      deps: {
        glowTex, hud, audio, fx, health, interact, spells,
        frostzinnen: save.frostzinnen, siegel: save.siegel, heim: save.heim,
        onChange: () => persist(),
      },
    });
    atmosphere.registerZone({
      center: { x: FROSTZINNEN.x, z: FROSTZINNEN.z }, radius: FROSTZINNEN.r + 15, feather: 70,
      color: 0xbfe0f0, fogFarMul: 0.85, ambientMul: 1.05, soundId: 'frostzinnen',
    });
  }],
  ['Zuhause', () => {
    home = buildHome(scene, camera, glowTex, hud, audio, fx, health, interact, economy, kate, {
      heim: save.heim, sky, weather, puzzles, moor, spells, player,
    });
    home.restore();
    home.onChange = () => persist();
  }],
  ['Fauna', () => {
    fauna = buildFauna(scene, fx, audio, natureTreeSpots, () => {
      const gold = 1 + Math.floor(Math.random() * 3);
      economy.addGold(gold);
      // Grabbel-Passivum (S9): +1 Glitzer extra bei wilden Niffler-Funden,
      // solange er der aktive Begleiter ist.
      const grabbelBonus = save.begleiter.aktiv === 'grabbel' ? 1 : 0;
      save.heim.zutaten.glitzer += 1 + grabbelBonus;
      hud.showToast(`✨ Glitzerstaub gefunden! +${gold} Gold, +${1 + grabbelBonus} Glitzerstaub${grabbelBonus ? ' (Grabbel schnüffelt mit!)' : ''}`, 2.5);
      persist();
    });
    // Akromantula-Kopplung (creatures.js, S2): Füchse+Hasen werden für
    // Riesenspinnen jagdbare Beute (Ökosystem-Kette Akromantula>Fuchs>Hase).
    setFaunaPrey(fauna.huntableBySpiders);
  }],
  ['Wilderer & Duell', () => {
    wilderer = buildWilderer(scene, glowTex, hud, audio, fx, health, interact, economy, {
      heim: save.heim, dunkel: save.dunkel, wild: save.wild, hallows: save.hallows, spells,
      // S10: Umhang-Anführer erscheint erst, wenn die Heiligtümer-Questreihe
      // freigeschaltet ist (Hauspokal+Laterne) — puzzles/moor existieren zu
      // diesem Zeitpunkt bereits (beide Build-Steps laufen vor diesem hier).
      hallowsUnlocked: () => puzzles.finaleWon && moor.laterneCollected,
    });
    wilderer.restore(save.wild);
    if (save.peaceful) wilderer.peaceful = true;
    wilderer.onWildChange = () => persist();
  }],
  ['Mount', () => {
    mount = buildMount(scene, camera, glowTex, hud, audio, fx, health, interact, player, {
      hippos: fauna.hippos, mounts: save.mounts, feroState: npc.fero.feroState, save,
    });
    mount.restore(save.mounts);
    mount.onMountChange = () => { persist(); refreshStatusLines(); };
  }],
  // Letzter Schritt: braucht spells/dementors/health/economy/interact —
  // alle bereits gebaut.
  ['Dunkler Pfad', () => {
    dark = buildDark(scene, glowTex, hud, audio, fx, interact, economy, {
      dunkel: save.dunkel, spells, dementors, health, sky,
    });
    dark.restore();
    dark.onChange = () => { persist(); refreshStatusLines(); };
  }],
  // Begleiter (S9): braucht npc (Musch-Handoff+Fero-Frischfisch), home
  // (Rastplatz in der Kate), creatures/wilderer (Schutz-Ziele),
  // collectibles (Pinivas Schnatz-Suche) — alle bereits gebaut.
  ['Begleiter', () => {
    companion = buildCompanion(scene, glowTex, hud, audio, fx, interact, economy, player, npc, {
      begleiter: save.begleiter, heim: save.heim, home, feroState: npc.fero.feroState,
      creatures, wilderer, collectibles,
    });
    companion.setNightGlowGetter(() => sky.state.nightGlow);
    // Wie mount.js: "gezähmt/gefunden" (begleiter.frei) bleibt gespeichert,
    // "gerade gerufen" NICHT — nach jedem Laden erst wieder Taste G nötig.
    companion.restore();
    companion.onChange = () => persist();
  }],
  // Heiligtümer (S10): braucht home (Podeste), huegelgrab (Slab-Mesh+Blocker,
  // S1 vorbereitet), mount/dementors (Meister-des-Todes-Effekte), puzzles/moor
  // (Freischalt-Gate) — alle bereits gebaut. Letzter Schritt.
  ['Heiligtümer', () => {
    hallows = buildHallows(scene, glowTex, hud, audio, fx, health, interact, home, huegelgrab, {
      hallows: save.hallows, mount, dementors, puzzles, moor, spells,
    });
    hallows.restore();
    hallows.onChange = () => { persist(); refreshStatusLines(); };
    hallows.onSeenDeath = () => { if (!save.seenDeath) { save.seenDeath = 1; persist(); } };
    if (save.peaceful) hallows.peaceful = true;
    // S10: Umhang/Elderstab/Stein casten über dieselbe spells.cast()-Weiche
    // wie alle anderen Sprüche (Mausrad + Spellbar) — dark/hallows existieren
    // erst jetzt, deshalb Spätbindung statt Konstruktor-Parameter.
    spells.setDarkHallows(dark, hallows);
  }],
  // Animagus (S11): braucht home (Kessel/Trank), weather (Sturm-Gate für
  // das Ritual), interact — alle bereits gebaut. Letzter Schritt.
  ['Animagus', () => {
    animagus = buildAnimagus(scene, glowTex, hud, audio, fx, interact, player, {
      animagus: save.animagus, heim: save.heim, weather,
    });
    animagus.onChange = () => persist();
  }],
  // Karte des Rumtreibers (Sonnet-5-Polish, Meilenstein B1): braucht keine
  // Three.js-Objekte, nur hud+save — als eigener, unabhängiger letzter
  // Schritt, damit die Reihenfolge keine versteckte Abhängigkeit vortäuscht.
  ['Karte des Rumtreibers', () => {
    marauders = buildMarauderMap(hud, save);
  }],
  // Kontext-Hinweise (Meilenstein C2): braucht interact/creatures/health/
  // marauders — alle bereits gebaut, daher letzter Schritt.
  ['Kontext-Hinweise', () => {
    tutorial = buildTutorial(hud, save, { interact, creatures, health, marauders });
  }],
];

const loadingBar = document.getElementById('loading-bar');
const menuLoading = document.getElementById('menu-loading');
const menuMain = document.getElementById('menu-main');
const hauspokalStatus = document.getElementById('hauspokal-status');
function showHauspokalWon() { hauspokalStatus.classList.remove('hidden'); }
const lanternStatus = document.getElementById('lantern-status');
function showLanternWon() { lanternStatus.classList.remove('hidden'); hud.showLanternIcon(); }
const aceStatus = document.getElementById('ace-status');
function showAceWon() { aceStatus.classList.remove('hidden'); }
// S12: Pfad/Mounts/Heiligtümer — im Gegensatz zu den 3 Einweg-Bannern oben
// kein "einmal freigeschaltet, für immer sichtbar", sondern jedes Mal neu
// aus dem aktuellen Save-Stand gebaut (Pfad kann sich zurück ändern).
const progressStatus = document.getElementById('progress-status');
function refreshStatusLines() {
  const lines = [];
  if (save.dunkel.buch === 1) {
    lines.push(save.dunkel.pfad === 'dunkel' ? '🖤 Pfad: dunkel' : '🌗 Pfad: hell');
  }
  const mountNames = [];
  if (save.mounts.hippo) mountNames.push('Hippogreif');
  if (save.mounts.thestral) mountNames.push('Thestral');
  if (mountNames.length) lines.push(`🐴 Mounts: ${mountNames.join(', ')}`);
  const hallowCount = (save.hallows.stab ? 1 : 0) + (save.hallows.umhang ? 1 : 0) + (save.hallows.stein ? 1 : 0);
  if (hallowCount > 0) lines.push(`☠️ Heiligtümer: ${hallowCount}/3${hallowCount === 3 ? ' — Meister des Todes' : ''}`);
  progressStatus.innerHTML = lines.join('<br>');
  progressStatus.classList.toggle('hidden', lines.length === 0);
}

async function buildWorld() {
  // Sonnet-5-Polish (D1): schlägt ein Build-Schritt fehl, bliebe ohne dieses
  // try/catch "Die Welt wird erschaffen …" für immer stehen. Technischer
  // Fehler nur in die Konsole, Spieler sieht nur eine kurze, unbeängstigende
  // Nachricht mit Neuladen-Button.
  try {
    for (let i = 0; i < buildSteps.length; i++) {
      const [, fn] = buildSteps[i];
      // setTimeout statt requestAnimationFrame: rAF friert in inaktiven Tabs ein
      await new Promise(r => setTimeout(r, 0));
      fn();
      loadingBar.style.width = `${((i + 1) / buildSteps.length) * 100}%`;
    }
    refreshStatusLines();
    await new Promise(r => setTimeout(r, 0));
    menuLoading.classList.add('hidden');
    menuMain.classList.remove('hidden');
  } catch (err) {
    console.error('Weltaufbau fehlgeschlagen:', err);
    menuLoading.classList.add('hidden');
    document.getElementById('menu-error').classList.remove('hidden');
  }
}

document.getElementById('btn-reload-error').addEventListener('click', () => window.location.reload());

// ---------- Menü & Pointer-Lock ----------
const menu = document.getElementById('menu');
const btnStart = document.getElementById('btn-start');
const btnSound = document.getElementById('btn-sound');
const btnMusic = document.getElementById('btn-music');
const btnReset = document.getElementById('btn-reset');

let playing = false;
let started = false;

audio.setMuted(save.muted === true);
btnSound.textContent = `Ton: ${audio.muted ? 'aus' : 'an'}`;
audio.setMusic(save.music === true);
btnMusic.textContent = `Musik: ${audio.musicOn ? 'an' : 'aus'}`;
btnMusic.addEventListener('click', () => {
  audio.setMusic(!audio.musicOn);
  btnMusic.textContent = `Musik: ${audio.musicOn ? 'an' : 'aus'}`;
  persist();
});

function persist() {
  const pdata = puzzles ? puzzles.save() : { art: save.art, pz: save.pz };
  writeSave({
    collected: collectibles ? collectibles.collectedIds : [],
    art: pdata.art,
    pz: {
      ...pdata.pz,
      troll: creatures ? creatures.trollDefeated : (save.pz?.troll || false),
      trollChest: creatures ? creatures.troll.chest.collected : (save.pz?.trollChest || false),
      maxHearts: health ? health.maxHearts : (save.pz?.maxHearts || 5),
      willowChest: willow ? willow.chestOpened : (save.pz?.willowChest || false),
      spinnerChest: grove ? grove.chestCollected : (save.pz?.spinnerChest || false),
    },
    moor: moor ? moor.save() : save.moor,
    quests: npc ? npc.save() : save.quests,
    ...(broom ? broom.save() : { besen: save.besen, bestzeit: save.bestzeit, ace: save.ace }),
    muted: audio.muted,
    music: audio.musicOn,
    t: sky ? sky.timeOfDay : undefined,
    peaceful: creatures ? creatures.peaceful : (save.peaceful === true),
    grafik: post.quality,
    // v5-Felder (S1): noch ohne eigenes Live-System (kommt erst S3-S11),
    // daher unverändert durchgereicht — AUSSER seenDeath (K7/Abschnitt 2):
    // ein Troll-Sieg zählt als miterlebter Tod, sobald er diese Session
    // passiert (nicht erst nach Reload wie bei der Alt-Save-Migration).
    gold: save.gold,
    ruf: save.ruf,
    seenDeath: save.seenDeath || (creatures?.trollDefeated ? 1 : 0),
    wild: save.wild,
    mounts: save.mounts,
    dunkel: save.dunkel,
    heim: save.heim,
    begleiter: save.begleiter,
    hallows: save.hallows,
    animagus: save.animagus,
    tutorial: save.tutorial,
    map: save.map,
    ui: save.ui,
    aschenklamm: save.aschenklamm,
    frostzinnen: save.frostzinnen,
    siegel: save.siegel,
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
    // Sonnet-5-Polish (C2): der alte, session-only "Finde die 12 goldenen
    // Schnätze"-Toast (started-Flag, nicht persistiert) wird durch den
    // persistierten tutorial.js-Hinweis ersetzt — zeigt sich dadurch wirklich
    // nur EINMAL pro Spielstand, nicht nach jedem Reload erneut.
    tutorial.onStart();
  }
  if (!on) {
    btnStart.textContent = 'Weiterspielen';
    // Karte darf nie hinter dem Pausenmenü offen bleiben (z.B. wenn im
    // Pointer-Lock-Modus Escape sowohl die Karte schließen als auch den
    // Lock beenden würde — Letzteres kann JS nicht verhindern).
    if (marauders?.isOpen) marauders.close();
    persist();
  }
}

btnStart.addEventListener('click', () => {
  audio.init();
  audio.setMusic(audio.musicOn); // AudioContext existiert jetzt erst — Pads ggf. nachträglich aufbauen
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

const btnPeaceful = document.getElementById('btn-peaceful');
btnPeaceful.textContent = `Kreaturen: ${save.peaceful ? 'zahm' : 'wild'}`;
btnPeaceful.addEventListener('click', () => {
  creatures.peaceful = !creatures.peaceful;
  dementors.peaceful = creatures.peaceful;
  willow.peaceful = creatures.peaceful;
  wilderer.peaceful = creatures.peaceful;
  hallows.peaceful = creatures.peaceful;
  btnPeaceful.textContent = `Kreaturen: ${creatures.peaceful ? 'zahm' : 'wild'}`;
  persist();
});

const btnGrafik = document.getElementById('btn-grafik');
btnGrafik.textContent = `Grafik: ${save.grafik === 'schnell' ? 'Schnell' : 'Schön'}`;
btnGrafik.addEventListener('click', () => {
  post.setQuality(post.quality === 'schoen' ? 'schnell' : 'schoen');
  btnGrafik.textContent = `Grafik: ${post.quality === 'schnell' ? 'Schnell' : 'Schön'}`;
  persist();
});

// S11: Formwahl NUR fürs Ritual/Taste V — hat unabhängig von animagus.gelernt
// immer einen Wert (Default 'rabe' aus dem Save-Schema), damit man die Form
// schon vor dem Ritual vorwählen kann.
const btnAnimagusForm = document.getElementById('btn-animagus-form');
btnAnimagusForm.textContent = `Tierform: ${FORM_LABEL[save.animagus.form]}`;
btnAnimagusForm.addEventListener('click', () => {
  const i = FORM_ORDER.indexOf(save.animagus.form);
  save.animagus.form = FORM_ORDER[(i + 1) % FORM_ORDER.length];
  btnAnimagusForm.textContent = `Tierform: ${FORM_LABEL[save.animagus.form]}`;
  persist();
});

// Sonnet-5-Polish (B1): "Karte & Aufgaben" aus dem Pausenmenü — setzt das
// Spiel fort (wie "Weiterspielen") und öffnet danach sofort die Karte.
// btnStart.click() löst denselben Pointer-Lock-Versuch inkl. Fallback aus;
// wir warten per rAF-Polling auf `playing===true`, statt die Timing-Logik
// von dort zu duplizieren.
const btnMap = document.getElementById('btn-map');
btnMap.addEventListener('click', () => {
  btnStart.click();
  const openWhenReady = () => {
    if (playing) marauders.open();
    else requestAnimationFrame(openWhenReady);
  };
  requestAnimationFrame(openWhenReady);
});

function performReset() {
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
  if (puzzles) puzzles.restore({}, []);
  if (creatures) creatures.restoreTroll(false, false);
  if (moor) moor.restore({});
  if (willow) willow.restore(false);
  if (grove) grove.restore(false);
  if (npc) npc.restore({});
  if (broom) broom.restore({});
  // S10: hallows VOR wilderer.restore() zurücksetzen — dessen restore()
  // leitet leaderResolved live aus hallows.umhang ab (Lehre: Reihenfolge bei
  // abgeleitetem Zustand zählt, sonst bliebe das Anführer-Versteck nach
  // einem Reset fälschlich für immer "schon erledigt").
  Object.assign(save.hallows, { stab: 0, umhang: 0, stein: 0, steinCd: 0 });
  if (wilderer) wilderer.restore({ aktivCamp: -1, befreit: 0, geerntet: 0 });
  if (mount) mount.restore({ hippo: 0, thestral: 0, sattel: 0 });
  if (player) { player.flying = false; player.riding = false; player.flightTuning = null; }
  lanternWasCollected = false;
  if (health) {
    health.maxHearts = 5;
    health.hearts = Math.min(health.hearts, 5);
    hud.setHearts(health.hearts, health.effectiveMaxHearts);
  }
  hauspokalStatus.classList.add('hidden');
  lanternStatus.classList.add('hidden');
  aceStatus.classList.add('hidden');
  // v5-Felder (S1): direkt im in-memory save-Objekt zurückgesetzt (persist()
  // reicht sie sonst unverändert durch). WICHTIG: Objekt-Felder werden IN
  // PLACE mutiert (Object.assign), nicht neu zugewiesen (save.x = {...}) —
  // economy.js/npc.js(Fero)/wilderer.js halten direkte Referenzen auf
  // save.heim/mounts/dunkel/wild (Muster S3/S4, spart eigene save()/
  // restore()-Objekte). Eine Neuzuweisung würde diese Referenzen von
  // save.heim usw. lösen: künftige Käufe/Ernten würden dann in ein
  // verwaistes Objekt schreiben, das persist() nie wieder liest.
  save.gold = 0;
  save.ruf = 0;
  hud.setGold(0);
  save.seenDeath = 0;
  Object.assign(save.wild, { aktivCamp: -1, befreit: 0, geerntet: 0 });
  Object.assign(save.mounts, { hippo: 0, thestral: 0, sattel: 0 });
  Object.assign(save.dunkel, { buch: 0, pfad: 'hell', male: 0 });
  save.heim.kate = 0;
  Object.assign(save.heim.zutaten, { glitzer: 0, seide: 0, stern: 0, essenz: 0, leuchtkraut: 0, schuppe: 0, frostkristall: 0 });
  Object.assign(save.heim.trank, { id: '', restT: 0 });
  // Trank-Effekte sofort zurücksetzen statt bis zum nächsten Frame zu warten
  // (das übliche Sync-Muster oben liefe sonst noch 1 Frame mit alten Werten).
  if (player) player.potionSpeedMul = 1;
  if (health) health.tempHeartsBonus = 0;
  if (dementors) { dementors.frostImmune = false; dementors.playerIsDark = false; }
  if (spells) { spells.dmgMul = 1; spells.cooldownMul = 1; }
  if (home) home.restore();
  if (dark) dark.restore();
  Object.assign(save.begleiter, { aktiv: '', frei: [] });
  if (companion) companion.restore();
  if (hallows) hallows.restore();
  if (player) player.invisible = false;
  Object.assign(save.animagus, { gelernt: 0, form: 'rabe' });
  if (animagus) animagus.restore();
  if (btnAnimagusForm) btnAnimagusForm.textContent = `Tierform: ${FORM_LABEL[save.animagus.form]}`;
  // Sonnet-5-Polish: ein Reset ist ein "neuer Anfang" — Kartenaufdeckung und
  // bereits gesehene Tutorial-Hinweise gehören zum Fortschritt dazu.
  Object.assign(save.tutorial, { seen: [] });
  Object.assign(save.map, { discovered: [] });
  Object.assign(save.ui, { mapHelpSeen: false });
  if (tutorial) tutorial.restore();
  if (marauders) marauders.restore();
  // E4/E5: Regionen nur zurücksetzen, wenn schon gebaut (RegionManager baut
  // lazy — vor dem ersten Betreten existiert noch kein handle, dann reicht
  // der Save-Reset unten).
  Object.assign(save.aschenklamm, { eggStolen: 0, dragonDefeated: 0, chestCollected: 0 });
  Object.assign(save.frostzinnen, { eisblitzLearned: 0, giantDefeated: 0, chestCollected: 0 });
  Object.assign(save.siegel, { drache: 0, frost: 0 });
  aschenklammRegion.handle?.restore?.();
  frostzinnenRegion.handle?.restore?.();
  refreshStatusLines();
  persist();
  hud.showToast('Fortschritt zurückgesetzt');
}

// ---------- A3/A4: Bestätigungsdialog, Export, Import, Backup ----------
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmText = document.getElementById('confirm-text');
const confirmYes = document.getElementById('confirm-yes');
const confirmNo = document.getElementById('confirm-no');
let confirmOnYes = null;

function askConfirm(message, onYes) {
  confirmText.textContent = message;
  confirmOnYes = onYes;
  confirmOverlay.classList.remove('hidden');
}
function closeConfirm() {
  confirmOverlay.classList.add('hidden');
  confirmOnYes = null;
}
confirmYes.addEventListener('click', () => {
  const fn = confirmOnYes;
  closeConfirm();
  fn?.();
});
confirmNo.addEventListener('click', closeConfirm);

btnReset.addEventListener('click', () => {
  askConfirm('Wirklich den GESAMTEN Fortschritt zurücksetzen? Eine Sicherung wird vorher automatisch angelegt.', () => {
    backupCurrentSave();
    btnRestoreBackup.classList.remove('hidden');
    performReset();
  });
});

const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnRestoreBackup = document.getElementById('btn-restore-backup');
const importFileInput = document.getElementById('import-file-input');

if (newestBackup()) btnRestoreBackup.classList.remove('hidden');

btnExport.addEventListener('click', () => {
  persist();
  const exportObj = createExport(loadSave());
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `hogwarts3d-spielstand-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  hud.showToast('Spielstand exportiert 💾');
});

btnImport.addEventListener('click', () => {
  importFileInput.value = '';
  importFileInput.click();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    hud.showToast(`Datei zu groß (>${Math.round(MAX_IMPORT_BYTES / 1000)} KB) — das ist kein gültiger Spielstand.`, 3.5);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const result = parseImport(String(reader.result ?? ''));
    if (!result.ok) {
      hud.showToast(`Import fehlgeschlagen: ${result.error}`, 3.5);
      return;
    }
    askConfirm('Spielstand importieren? Der aktuelle Fortschritt wird ersetzt (eine Sicherung wird vorher automatisch angelegt).', () => {
      backupCurrentSave();
      writeSave(result.data);
      hud.showToast('Spielstand importiert — wird neu geladen …');
      setTimeout(() => window.location.reload(), 900);
    });
  };
  reader.readAsText(file);
});

btnRestoreBackup.addEventListener('click', () => {
  const raw = newestBackup();
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (!parsed) {
    hud.showToast('Sicherung ist beschädigt.', 3);
    return;
  }
  askConfirm('Letzte Sicherung wiederherstellen? Der aktuelle Fortschritt wird ersetzt.', () => {
    writeSave(parsed);
    hud.showToast('Sicherung wiederhergestellt — wird neu geladen …');
    setTimeout(() => window.location.reload(), 900);
  });
});

document.addEventListener('pointerlockchange', () => {
  if (fallbackMode) return;
  setPlaying(document.pointerLockElement === canvas);
});

document.addEventListener('pointerlockerror', () => {
  hud.showToast('Maus-Steuerung konnte nicht aktiviert werden — bitte erneut klicken.');
});

// Nicht-Bewegungs-Tasten
const DIGIT_SPELLS = {
  Digit1: 'stupor', Digit2: 'incendio', Digit3: 'leviosa', Digit4: 'lumos', Digit5: 'patronum',
  // S8, nur nach Grimoire-Fund sichtbar/wirksam. Digit9 (S10-Nachtrag) wählt
  // Dunkles Mal jetzt nur noch AUS (wie alle anderen Sprüche) — gewirkt wird
  // per Linksklick, kein Direktcast auf Tastendruck mehr (Konsistenz mit
  // Mausrad + Spellbar).
  Digit6: 'avada', Digit7: 'crucio', Digit8: 'imperio', Digit9: 'mal',
};
const DARK_SPELL_IDS = new Set(['avada', 'crucio', 'imperio', 'mal']);
window.addEventListener('keydown', (e) => {
  if (!playing) return;
  // Sonnet-5-Polish (B1): Während Dialog ODER Karte offen sind, dürfen keine
  // anderen Tasten durchgreifen — vorher blockierte hud.dialogOpen nur den
  // eigenen E-Zweig weiter unten, alle anderen Tasten (Zaubern, V, R, G, U …)
  // liefen währenddessen unbemerkt weiter.
  if (hud.dialogOpen) {
    if (e.code === 'KeyE') hud.advanceDialog();
    return;
  }
  if (marauders.isOpen) {
    // J schließt wie Esc (Plan B1: "Esc schließt zuerst die Karte, bevor das
    // Pausenmenü geöffnet wird") — im Pointer-Lock-Modus beendet der Browser
    // bei Escape IMMER zusätzlich den Pointer-Lock (nicht abfangbar), was
    // parallel setPlaying(false) auslöst; siehe dortiger Kommentar.
    if (e.code === 'KeyJ' || e.code === 'Escape') marauders.close();
    return;
  }
  if (e.code === 'Escape' && fallbackMode) {
    setPlaying(false);
  } else if (e.code === 'KeyJ') {
    marauders.open();
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
    wand.selectSpell('lumos');
    spells.cast(camera);
    hud.showToast(spells.lumosOn ? '✨ Lumos!' : 'Nox.', 1.4);
  } else if (DIGIT_SPELLS[e.code]) {
    const id = DIGIT_SPELLS[e.code];
    if (id === 'patronum' && !spells.epUnlocked) { /* noch nicht frei */ }
    else if (DARK_SPELL_IDS.has(id) && !spells.darkUnlocked) { /* noch nicht frei */ }
    else wand.selectSpell(id);
  } else if (e.code === 'KeyE') {
    interact.trigger();
  } else if (e.code === 'KeyB') {
    // Nicht während eines Mount-Ritts (geerdet ODER fliegend) UND nicht als
    // Tier (S11: "kein Reiten") — sonst würden sich Besen- und Mount-Flug
    // widersprechen (S6, K13-artige Absicherung).
    if (broom.besenUnlocked && !player.swimming && !mount.riding && !player.animalForm) {
      player.flying = !player.flying;
      player.flightTuning = player.flying ? null : player.flightTuning; // null -> Besen-Default (player.js)
      hud.showToast(player.flying ? '🧹 Aufgestiegen!' : '🧹 Abgestiegen.', 1.4);
    }
  } else if (e.code === 'KeyR') {
    // S11: "kein Reiten" als Tier.
    if (!player.swimming && !player.animalForm) mount.whistle();
  } else if (e.code === 'KeyG') {
    companion.toggle();
  } else if (e.code === 'KeyU') {
    if (SPELL_ORDER.includes('umhang')) { wand.selectSpell('umhang'); spells.cast(camera); }
  } else if (e.code === 'KeyI') {
    // E5: nur AUSWÄHLEN (wie die Digit-Sprüche) — Eisblitz ist ein echter
    // Bolzen-Zauber, kein Sofort-Toggle wie der Umhang.
    if (SPELL_ORDER.includes('eisblitz')) wand.selectSpell('eisblitz');
  } else if (e.code === 'KeyV') {
    animagus.handleVKey();
  }
});

// Zaubern: Maustaste (nur wenn Klick auf dem Canvas landet — HUD/Menü sind
// entweder pointer-events:none oder unsichtbar solange playing===true).
window.addEventListener('mousedown', (e) => {
  if (!playing || hud.dialogOpen || marauders.isOpen || e.button !== 0 || e.target !== canvas) return;
  spells.cast(camera);
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  spells?.release();
});
window.addEventListener('wheel', (e) => {
  if (!playing || hud.dialogOpen || marauders.isOpen) return;
  wand.cycleSpell(e.deltaY > 0 ? 1 : -1);
}, { passive: true });

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

  post.render(sky.state.nightGlow, fpsEMA);
}

// Ein Simulationsschritt (vom Render-Loop und von __game.step() genutzt)
function frame(dt) {
  {
    // Sonnet-5-Polish (B1): Karte/Dialog blockieren Bewegung, Kamera-Umsehen
    // UND Zaubern — player.enabled gatete bisher nur die Maussteuerung
    // (siehe player.js mousemove-Listener), WASD/Sprint lief bislang auch
    // während eines offenen Dialogs unbemerkt weiter. Jeden Frame neu
    // abgeleitet statt über Callbacks synchron gehalten (einfacher, hud.js/
    // marauders-map.js müssen main.js dafür nicht kennen).
    player.enabled = !hud.dialogOpen && !marauders.isOpen;
    marauders.tick(player.pos);
    tutorial.update(dt, player.pos);
    time += dt;
    weather.update(dt, player);
    const move = player.update(dt);

    wand.update(dt, player, move, spells.lumosOn, spells.isHoldingLeviosa);
    // Dementoren sind immun, aber trotzdem gültige Bolzen-Ziele (fürs
    // Verpuffen-Feedback) — daher zusammen mit creatures.list übergeben.
    // Wilderer (S4) ebenso: eigene applyHit()-Logik, gleiche Ziel-Liste.
    // fauna.foxes (S8): Imperio-Cone-Scan braucht Füchse separat (kein hp/
    // applyHit, nicht Teil der Kreaturenliste — siehe fauna.js-Kommentar).
    // hallows.king/phantomGhosts (S10): Bleicher König + seine Phase-2-
    // Geister-Beschwörung sind ebenfalls gültige Spruchziele (alive-Flag
    // gated wie überall sonst).
    // aschenklammRegion.handle?.dragon (E4): existiert erst, sobald die Region
    // einmal geweckt wurde (RegionManager baut lazy) — davor liefert die
    // Ternary ein leeres Array, kein Platzhalter-Objekt (sonst würde
    // spells.js' `c.alive`-Check auf einem undefined-Feld crashen).
    spells.update(dt, camera, creatures.list.concat(dementors.list).concat(wilderer.list)
      .concat([hallows.king]).concat(hallows.phantomGhosts)
      .concat(aschenklammRegion.handle?.dragon ? [aschenklammRegion.handle.dragon] : [])
      .concat(frostzinnenRegion.handle?.giant ? [frostzinnenRegion.handle.giant] : []), fauna.foxes);
    // sky.update() läuft weiter unten, aber creatures braucht den Tag/Nacht-
    // Stand vom LETZTEN Frame — nightGlow ändert sich nur sehr langsam
    // (300s/Zyklus), eine Frame Verzögerung ist unmerklich.
    creatures.update(dt, player, sky.state, spells.lumosOn);
    // Risiko-Spirale + Laterne (N4): moor.js speist die effektive Aggro-
    // Reichweite und die Frost-Aufbau-Geschwindigkeit der Dementoren.
    dementors.aggroRangeExtra = moor.carriedCount * 4;
    dementors.aggroRangeMul = moor.laterneCollected ? 0.5 : 1;
    // "Warm ums Herz" (Q2-Belohnung, W5): multipliziert sich mit der Laterne.
    dementors.frostRateMul = (moor.laterneCollected ? 0.5 : 1) * (npc.quests.kraeuterDone ? 0.75 : 1);
    // K4 (S8): Dementoren sind neutral, solange der Spieler dem dunklen Pfad folgt.
    dementors.playerIsDark = save.dunkel.pfad === 'dunkel';
    // S11: Katzen-Schleichen verkleinert den Aggro-Radius aller Feinde ×0.3.
    {
      const stealthMul = player.animalForm === 'katze' ? 0.3 : 1;
      creatures.catStealthMul = stealthMul;
      dementors.catStealthMul = stealthMul;
      wilderer.catStealthMul = stealthMul;
    }
    // S7 Trank-Effekte: EIN aktiver Trank (heim.trank.id), pro Frame in die
    // jeweils zuständigen Systeme gespiegelt (Muster: frostRateMul oben) —
    // home.js selbst tickt nur den Timer runter, kennt aber die Zielsysteme
    // nicht (bleibt "dumm/generisch" wie spells.js' Ziel-Registry).
    {
      const t = save.heim.trank;
      const active = t.id && t.restT > 0;
      player.potionSpeedMul = active && t.id === 'flink' ? 1.3 : 1;
      // S10 Meister des Todes: +1 Max-Herz stapelt sich mit dem Herztrank.
      health.tempHeartsBonus = (active && t.id === 'herz' ? 2 : 0) + (hallows.masterOfDeath ? 1 : 0);
      dementors.frostImmune = active && t.id === 'frost';
      // E4 Feuerschutztrank: negiert den Feueratem-Schaden der Aschenschwinge
      // — analog zu frostImmune, nur gesetzt, wenn die Region bereits gebaut ist.
      if (aschenklammRegion.handle) aschenklammRegion.handle.fireImmune = active && t.id === 'feuerschutz';
      // E5 Eisatem-Trank: negiert den Eiswurf-Schaden von Rimefell.
      if (frostzinnenRegion.handle) frostzinnenRegion.handle.iceThrowImmune = active && t.id === 'eisatem';
      // S10 Elderstab: Schaden ×2 / Cooldown ×0.6, stapelt sich multiplikativ
      // mit dem Dunklen Sud (×1.5).
      const potionDmgMul = active && t.id === 'dunkel' && save.dunkel.pfad === 'dunkel' ? 1.5 : 1;
      spells.dmgMul = potionDmgMul * (hallows.elderstabActive ? 2 : 1);
      spells.cooldownMul = hallows.elderstabActive ? 0.6 : 1;
    }
    dementors.update(dt, player);
    player.slowFactor = dementors.frostFactor > 0.5 ? 0.75 : 1;
    hud.setFrost(dementors.frostFactor);
    moor.update(dt, player);
    village.update(dt, player);
    train.update(dt, player);
    willow.update(dt, player);
    grove.update(dt, player);
    npc.update(dt, player, sky.state, economy.ruf, save.dunkel.pfad === 'dunkel');
    wilderer.update(dt, player, sky);
    dark.update(dt, player, move.sprinting);
    companion.update(dt, player);
    hallows.update(dt, player, sky);
    broom.update(dt, player);
    // Tritt-Ziele (S5): kreatur.list + wilderer.list — Dementoren bewusst
    // NICHT dabei (immateriell, K6 aus dem Plan).
    mount.update(dt, player, creatures.list.concat(wilderer.list));
    // S11: gleiche Ziel-Liste wie der Mount-Tritt — der Wolfsbiss nutzt
    // dasselbe Kegel-Nahkampf-Muster.
    animagus.update(dt, creatures.list.concat(wilderer.list), sky.state.nightGlow);
    home.update(dt, player);
    wand.root.visible = !player.flying && !player.riding && !player.animalForm;
    fahlholz.update(dt);
    fauna.update(dt, player, spells.lumosOn, move.sprinting);
    interact.update(player);
    regionManager.update(dt, player);
    puzzles.update(dt, player, sky.state);
    fx.update(dt);
    camera.position.add(fx.shakeOffset);
    health.update(dt);

    const atmo = atmosphere.update(player.pos);
    sky.update(dt, player.pos, weather.gloom, atmo.regionTint);
    sky.hemi.intensity += weather.lightningBoost; // Blitz-Aufhellung, additiv nach dem normalen Tag/Nacht-Update
    castle.update(dt, time, sky.state.nightGlow);
    structures.update(sky.state.nightGlow, time);
    life.update(dt, sky.state);
    collectibles.update(dt, time, player.pos);
    updateSway(natureSwayMaterials, time, weather.windStrength);

    // Wasser-Uniforms mit der Tageszeit synchronisieren
    const wu = water.uniforms;
    wu.uTime.value = time;
    wu.uSunDir.value.copy(sky.state.sunDir);
    if (sky.state.sunDir.y < 0) wu.uSunDir.value.multiplyScalar(-1); // nachts: Mond
    wu.uSunColor.value.copy(sky.state.sunColor);
    wu.uSky.value.copy(sky.state.skyHorizon);
    wu.uNight.value = sky.state.nightGlow;

    const owlDist = Math.hypot(player.pos.x - structures.eulerei.x, player.pos.z - structures.eulerei.z);
    const owlProximity = Math.max(0, 1 - owlDist / 40);
    audio.update(sky.state.daylight, weather.gloom, owlProximity);
    if (audio.windGain) {
      // Flug (Besen W7 / Mount S6): Fluggeschwindigkeit treibt zusätzliches
      // Windrauschen, skaliert am jeweiligen Boost-Tempo (Besen 18, Hippogreif/
      // Thestral 24/28 — sonst würde Mount-Flug zu leise wirken).
      const flyTerm = player.flying ? (move.speed3D / (player.flightTuning?.boost || 18)) * 0.25 : 0;
      const target = (0.04 + (move.hSpeed / 12) * 0.05 + (player.pos.y / 60) * 0.03 + flyTerm)
        * (0.6 + weather.windStrength * 1.4);
      audio.windGain.gain.value += (target - audio.windGain.gain.value) * 0.02;
    }
    updatePumpkinGlows(dt);

    hud.setClock(sky.clockText);
    hud.setHeading(player.heading);
    hud.setTracker(broom.getTrackerInfo(player) || home.getSplitterTracker(player) || collectibles.nearest(player.pos), player.heading);
    hud.setSpell(wand.activeSpell, { ...spells.cooldowns, mal: dark.malCooldown });
    hud.setHearts(health.hearts, health.effectiveMaxHearts);
    const troll = creatures.troll;
    const trollBoss = ['aggro', 'telegraph', 'slam'].includes(troll.state) ? troll.hp / troll.maxHp : null;
    // E4: gleiche Bossbar wie beim Troll, mitgenutzt (zeitlich nie
    // überlappend — beide Regionen liegen weit auseinander).
    const dragon = aschenklammRegion.handle?.dragon;
    const dragonBoss = dragon && ['flying', 'telegraph', 'firebreath', 'staggered'].includes(dragon.state)
      ? dragon.hp / dragon.maxHp : null;
    // E5: gleiche Bossbar, dritter möglicher Nutzer — alle drei Regionen
    // liegen weit auseinander, nie gleichzeitig aktiv.
    const giant = frostzinnenRegion.handle?.giant;
    const giantBoss = giant && ['aggro', 'telegraph', 'stagger'].includes(giant.state)
      ? giant.hp / giant.maxHp : null;
    hud.setBoss(trollBoss ?? dragonBoss ?? giantBoss);
    hud.setMoor(moor.insideFactor(player.pos));
    if (moor.laterneCollected) {
      if (!lanternWasCollected) { lanternWasCollected = true; showLanternWon(); persist(); }
    } else {
      const soulN = moor.carriedCount + moor.deliveredCount;
      if (soulN > 0 || moor.insideFactor(player.pos) > 0) hud.setSoulLights(soulN, 5);
      else hud.setSoulLights(0, null);
    }
    hud.setFps(fpsEMA, pixelRatio);
    if (player.swimming) hud.showHint('Du schwimmst im See 🏊 — zurück ans Ufer!');
    else hud.hideHint();
    // S10 Tauchen: Luftanzeige läuft während des gesamten Schwimmens mit,
    // Unterwasser-Vignette/-Audiofilter nur beim tatsächlichen Abtauchen.
    hud.setAirGauge(player.swimming, player.airRemaining / 25);
    hud.setUnderwater(player.diving ? 1 : 0);
    audio.setUnderwater(player.diving);

    // Automatische Qualitätsanpassung
    qualityTimer += dt;
    if (qualityTimer > 2.5) {
      qualityTimer = 0;
      if (fpsEMA < 42 && pixelRatio > 0.6) {
        pixelRatio = Math.max(0.6, pixelRatio * 0.85);
        renderer.setPixelRatio(pixelRatio);
        post.resize();
      } else if (fpsEMA > 57 && pixelRatio < MAX_PIXEL_RATIO) {
        pixelRatio = Math.min(MAX_PIXEL_RATIO, pixelRatio * 1.1);
        renderer.setPixelRatio(pixelRatio);
        post.resize();
      }
    }
  }
}

// Sammel-Callback (nach Weltaufbau verdrahtet)
buildWorld().then(() => {
  player.onStep = (sprinting) => audio.step(sprinting);
  player.onJump = () => audio.jump();
  player.onLand = () => audio.land();
  // S10 Tauchen: Luft komplett verbraucht — kleiner "Schreck-Schaden" plus
  // Zwangsauftrieb (player.js ignoriert Shift automatisch sobald air<=0).
  player.onOutOfAir = () => {
    health.damage(1, null);
    hud.showToast('😮‍💨 Dir geht die Luft aus!', 2.5);
  };
  // Debug-/Test-Zugriff (bewusst öffentlich, hilft bei Fehlersuche)
  window.__game = {
    player, sky, camera, renderer, scene,
    wand, spells, fx, health, creatures, puzzles, moor, dementors, weather, post, village, train, willow, interact, npc, hud, grove, broom, fahlholz, fauna, economy, wilderer, mount, home, dark, companion, hallows, animagus, marauders, tutorial,
    regions: regionManager,
    atmosphere,
    get aschenklamm() { return aschenklammRegion.handle; },
    get frostzinnen() { return frostzinnenRegion.handle; },
    get save() { return save; },
    get fps() { return fpsEMA; },
    get pixelRatio() { return pixelRatio; },
    collectibles,
    gott: () => { health.invincible = true; },
    ep: () => spells.unlockPatronum(false), // Testkomfort: EP sofort freischalten
    start: () => { fallbackMode = true; player.dragLook = true; setPlaying(true); },
    teleport: (x, z, yaw = null) => player.teleport(x, z, yaw),
    // Für automatisierte Tests: n Frames direkt simulieren (ohne rAF)
    step: (n = 60, dt = 1 / 60) => {
      for (let i = 0; i < n; i++) frame(dt);
      post.render(sky.state.nightGlow, fpsEMA);
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
  health.onRespawn = () => {
    hud.showToast('Du wachst im Innenhof auf … Zeit, sich neu zu sammeln.', 3.5);
    moor.dropCarriedLights(); // getragene Seelenlichter fallen an ihre Ursprungs-Spots zurück
    // K7 (S6): der erste eigene Tod zählt als miterlebter Tod — Thestral-Gate.
    if (!save.seenDeath) { save.seenDeath = 1; persist(); }
  };
  health.onFountainHeal = () => hud.showToast('Das Brunnenwasser wärmt dich. ♥ voll!', 2.5);
  puzzles.onArtifact = (id, name, n, total) => {
    hud.showToast(`🏆 Artefakt gefunden: ${name} — ${n} / ${total}`, 4);
    persist();
  };
  puzzles.onFinale = () => {
    showHauspokalWon();
    persist();
  };
  creatures.onTrollChest = () => persist();
  creatures.onZutatChange = () => persist();
  willow.onChestOpen = () => persist();
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
