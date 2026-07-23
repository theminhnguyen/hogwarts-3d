// Regions-Atmosphäre (PLAN-EPISCHE-WELT.md, Meilenstein E3 / eigene Idee 6.1):
// pro Region eigene Himmelsfärbung/Nebel/Ambient-Sound, die beim Betreten
// über eine gefiederte Distanzkante sanft überblendet. Reines Fundament wie
// regions.js in E0 — noch OHNE registrierte echte Zonen (die kommen erst mit
// den neuen Regionen ab E4). `update()` liefert ein `regionTint`-Objekt im
// exakt gleichen Format, das sky.js bereits für die Wetter-Verdunkelung
// (`gloom`) versteht — dieselbe Lerp-Mechanik, nur mit beliebiger Zielfarbe
// statt festem Sturm-Grau.
import * as THREE from 'three';

export function createAtmosphereSystem() {
  const zones = [];

  // color: Hex-Zahl (z.B. 0xff5a30). fogFarMul (optional, Default 1): Nebel-
  // Sichtweite relativ zur normalen Tageszeit-Sichtweite (sky.js scene.fog.far)
  // — <1 = dichterer Nebel (z.B. Schwarzwasser), >1 = klarer. ambientMul
  // (optional, Default 1): Multiplikator auf Sonne/Hemisphäre-Intensität.
  // soundId (optional): von main.js/audio.js später (E4+) für ein Ambient-
  // Sound-Bett genutzt — hier nur durchgereicht, keine eigene Audio-Logik.
  function registerZone({ center, radius, feather = 60, color, fogFarMul = 1, ambientMul = 1, soundId = null }) {
    const zone = { center, radius, feather, color: new THREE.Color(color), fogFarMul, ambientMul, soundId };
    zones.push(zone);
    return zone;
  }

  function unregisterZone(zone) {
    const i = zones.indexOf(zone);
    if (i >= 0) zones.splice(i, 1);
  }

  // Regionen liegen laut Plan-Abschnitt 4 (Platzierungs-Regel) mindestens
  // ~130m auseinander — ein echter Multi-Zonen-Gewichtsmix ist damit nicht
  // nötig, es zählt bewusst nur die NÄCHSTE Zone mit dem größten Blend-Anteil.
  function update(playerPos) {
    let best = null, bestAmount = 0;
    for (const z of zones) {
      const d = Math.hypot(playerPos.x - z.center.x, playerPos.z - z.center.z);
      const amount = d < z.radius ? 1 : d < z.radius + z.feather ? 1 - (d - z.radius) / z.feather : 0;
      if (amount > bestAmount) { bestAmount = amount; best = z; }
    }
    if (!best || bestAmount <= 0.001) return { regionTint: null, ambientMul: 1, soundId: null };
    return {
      regionTint: { color: best.color, amount: bestAmount, fogFarMul: best.fogFarMul },
      ambientMul: 1 + (best.ambientMul - 1) * bestAmount,
      soundId: best.soundId,
    };
  }

  return { registerZone, unregisterZone, update, get zoneCount() { return zones.length; } };
}
