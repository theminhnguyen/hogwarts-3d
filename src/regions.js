// Region-Streaming (PLAN-EPISCHE-WELT.md, Meilenstein E0d): lazy-baut neuen
// Content erst, wenn sich der Spieler nähert, und schläft ihn beim Entfernen
// wieder (Root-Gruppe unsichtbar, update() übersprungen). So kann die Welt
// INSGESAMT 3-4x mehr Leben enthalten, ohne dass mehr als der bisherige
// Kernradius (d0 ≲ 350, siehe PLAN-EPISCHE-WELT.md Abschnitt 3) gleichzeitig
// simuliert wird. WICHTIG: bestehende Systeme (creatures.js, npc.js, fauna.js,
// wilderer.js, ...) werden NICHT hierüber umgestellt — die bleiben "immer
// wach" im Kernradius. Nur NEUER Content ab Meilenstein E4 registriert sich
// hier. Das hält das Regressionsrisiko für den stabilen Altbestand bei 0.
import * as THREE from 'three';

// Stolperfalle #15 (PLAN-EPISCHE-WELT.md Abschnitt 9): die Distanzprüfung
// läuft JEDEN Frame frisch (kein "Grenze von außen überschritten"-Vergleich
// mit dem Vorframe) — dadurch weckt auch ein Spieler, der per Besen/Rabe in
// einem einzigen Frame mitten in eine Region hineinfliegt, sie zuverlässig,
// statt sie erst zu bemerken, wenn er "von draußen" durch wakeRadius tritt.
function distXZ(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Perf-Runde 2026-10-09: Regionen werden schon so viele Meter VOR dem
// Aufwachen gebaut — versteckt und schlafend. main.js lässt in dieser Zeit
// über `onPrepared` die Shader der neuen Materialien im Hintergrund
// übersetzen, damit beim eigentlichen Aufwachen (wakeRadius) nichts mehr
// kompiliert werden muss. Ein gebauter, schlafender Bereich ist kein neuer
// Zustand: genau so sieht jede Region aus, nachdem man sie wieder verlassen hat.
export const PREPARE_MARGIN = 60;

// opts.onPrepared(root): wird einmal pro Region direkt nach dem (versteckten)
// Bau aufgerufen.
export function createRegionManager(scene, opts = {}) {
  const regions = [];

  function build(region) {
    // Erstkontakt: einmalig synchron bauen (analog zu den buildSteps in
    // main.js). Teure Regionen (E4+, Bosse) können intern selbst über
    // mehrere Frames einblenden — das Register/Wake-Protokoll hier
    // erzwingt keine Ein-Frame-Fertigstellung. Unsichtbar VOR build(),
    // damit beim Vorbereiten nichts aufblitzt.
    region.root = new THREE.Group();
    region.root.name = `region-${region.key}`;
    region.root.visible = false;
    scene.add(region.root);
    region.handle = region.build(region.root, region.deps) || {};
    region.built = true;
    opts.onPrepared?.(region.root);
  }

  function setAwake(region, awake) {
    if (awake === region.awake) return;
    if (awake && !region.built) build(region);
    region.awake = awake;
    if (region.root) region.root.visible = awake;
    region.handle?.setAwake?.(awake);
  }

  function updateOne(region, dt, player) {
    const d = distXZ(player.pos, region.center);
    if (!region.built && d < region.prepareRadius) build(region);
    if (!region.awake && d < region.wakeRadius) setAwake(region, true);
    else if (region.awake && d > region.sleepRadius) setAwake(region, false);
    if (region.awake) region.handle?.update?.(dt, player);
  }

  function register({ key, center, wakeRadius, sleepRadius, prepareRadius, build, deps }) {
    if (!(sleepRadius > wakeRadius)) {
      throw new Error(`regions.register("${key}"): sleepRadius (${sleepRadius}) muss > wakeRadius (${wakeRadius}) sein — sonst keine Hysterese gegen Flackern am Rand.`);
    }
    const prep = prepareRadius ?? wakeRadius + PREPARE_MARGIN;
    if (!(prep >= wakeRadius)) {
      throw new Error(`regions.register("${key}"): prepareRadius (${prep}) muss >= wakeRadius (${wakeRadius}) sein.`);
    }
    const region = {
      key, center, wakeRadius, sleepRadius, prepareRadius: prep, build, deps: deps || {},
      built: false, awake: false, root: null, handle: null,
    };
    regions.push(region);
    return {
      get key() { return region.key; },
      get built() { return region.built; },
      get awake() { return region.awake; },
      get meshes() { return region.handle?.meshes || []; },
      // E4+: echte Regionen (Bosse, Ziel-Registry-Objekte) müssen von main.js
      // erreichbar sein (Spruch-Zielliste, Bossbar, Trank-Effekte) — null vor
      // dem ersten (versteckten) Bau, danach das von build() zurückgegebene
      // Objekt. Gebaut heißt NICHT wach — wer "aktiv" braucht, prüft .awake.
      get handle() { return region.handle; },
      setAwake: (v) => setAwake(region, v),
      update: (dt, player) => updateOne(region, dt, player),
    };
  }

  return {
    register,
    // Von main.js's frame() einmal pro Frame für ALLE registrierten
    // Regionen aufgerufen (Regionen selbst brauchen dafür keinen eigenen
    // main.js-Hook — einfach register() aufrufen, den Rest übernimmt hier).
    update(dt, player) {
      for (const r of regions) updateOne(r, dt, player);
    },
    get count() { return regions.length; },
    get awakeCount() { return regions.filter(r => r.awake).length; },
  };
}
