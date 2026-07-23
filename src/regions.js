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

export function createRegionManager(scene) {
  const regions = [];

  function setAwake(region, awake) {
    if (awake === region.awake) return;
    if (awake && !region.built) {
      // Erstkontakt: einmalig synchron bauen (analog zu den buildSteps in
      // main.js). Teure Regionen (E4+, Bosse) können intern selbst über
      // mehrere Frames einblenden — das Register/Wake-Protokoll hier
      // erzwingt keine Ein-Frame-Fertigstellung.
      region.root = new THREE.Group();
      region.root.name = `region-${region.key}`;
      scene.add(region.root);
      region.handle = region.build(region.root, region.deps) || {};
      region.built = true;
    }
    region.awake = awake;
    if (region.root) region.root.visible = awake;
    region.handle?.setAwake?.(awake);
  }

  function updateOne(region, dt, player) {
    const d = distXZ(player.pos, region.center);
    if (!region.awake && d < region.wakeRadius) setAwake(region, true);
    else if (region.awake && d > region.sleepRadius) setAwake(region, false);
    if (region.awake) region.handle?.update?.(dt, player);
  }

  function register({ key, center, wakeRadius, sleepRadius, build, deps }) {
    if (!(sleepRadius > wakeRadius)) {
      throw new Error(`regions.register("${key}"): sleepRadius (${sleepRadius}) muss > wakeRadius (${wakeRadius}) sein — sonst keine Hysterese gegen Flackern am Rand.`);
    }
    const region = {
      key, center, wakeRadius, sleepRadius, build, deps: deps || {},
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
      // dem ersten Wecken, danach das von build() zurückgegebene Objekt.
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
