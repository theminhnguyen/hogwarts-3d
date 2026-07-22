// Gemeinsame Flugphysik für Besen (broom.js, W7) und Reit-Mounts im Flug
// (mount.js, S6) — aus player.js EXTRAHIERT (Patronus-Lehre: gemeinsamen
// Code auslagern statt kopieren, damit jeder Fix beiden Nutzern zugutekommt).
// Bleibt bewusst so simpel wie die Boden-Mount-Physik: kein eigenes
// Kurvenradius-Modell, "träge/wendig" wird allein über die Trägheits-
// Konstante der Exponentialglättung (accelK) simuliert.

// tuning = { speed, boost, climb, accelK, maxAboveGround, maxAbsY }
//   speed/boost: Ziel-Tempo ohne/mit Sprint (Shift)
//   climb: vertikale Steigrate bei gehaltener Leertaste
//   accelK: je kleiner, desto träger/majestätischer reagiert die Steuerung
//   maxAboveGround/maxAbsY: siehe clampFlightHeight()
export const BROOM_FLIGHT = { speed: 12, boost: 18, climb: 4, accelK: 3, maxAboveGround: 50, maxAbsY: 75 };
export const HIPPO_FLIGHT = { speed: 24, boost: 24, climb: 4, accelK: 1.6, maxAboveGround: 50, maxAbsY: 75 };
export const THESTRAL_FLIGHT = { speed: 28, boost: 28, climb: 4.5, accelK: 4.4, maxAboveGround: 50, maxAbsY: 75 };
// S11 Animagus-Rabenform: flaches Tempo 16 (Plan gibt keinen separaten
// Sprint-Wert vor), accelK deutlich höher als bei jedem Mount — "klein und
// flink" statt majestätisch träge.
export const RAVEN_FLIGHT = { speed: 16, boost: 16, climb: 4, accelK: 5.5, maxAboveGround: 50, maxAbsY: 75 };

// Ein Simulationsschritt Blickrichtungsflug — mutiert player.vel direkt (wie
// player.js das für alle anderen Bewegungsarten schon tut) und player.flying/
// player._noAscendT für den automatischen Abstieg. fwd: -1/0/1 (S/idle/W).
export function updateFlight(player, dt, fwd, sprinting, spaceHeld, tuning) {
  const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
  const cosP = Math.cos(player.pitch), sinP = Math.sin(player.pitch);
  const fwd3X = -sinY * cosP, fwd3Y = sinP, fwd3Z = -cosY * cosP;
  const flySpeed = (sprinting ? tuning.boost : tuning.speed) * player.slowFactor;
  const targetFX = fwd3X * flySpeed * fwd;
  const targetFY = fwd3Y * flySpeed * fwd + (spaceHeld ? tuning.climb : 0);
  const targetFZ = fwd3Z * flySpeed * fwd;
  const flyAccel = 1 - Math.exp(-tuning.accelK * dt);
  player.vel.x += (targetFX - player.vel.x) * flyAccel;
  player.vel.y += (targetFY - player.vel.y) * flyAccel;
  player.vel.z += (targetFZ - player.vel.z) * flyAccel;

  // Automatischer Abstieg: am Boden UND (rückwärts ODER untätig) 1s lang
  const idleOrBack = fwd <= 0;
  player._noAscendT = player.grounded && idleOrBack ? player._noAscendT + dt : 0;
  if (player._noAscendT >= 1) {
    player.flying = false;
    player._noAscendT = 0;
    player.onLandFlight?.();
  }
}

// Flughöhen-Clamp: terrainHeight+maxAboveGround UND absolut y<=maxAbsY, als
// Positions-Clamp am ENDE der Bewegungslogik (Lehre 14/24 — kein
// Zurücksteuern über die Geschwindigkeit, sondern harter Clamp danach).
export function clampFlightHeight(player, terr, tuning) {
  const maxY = Math.min(tuning.maxAbsY, terr + tuning.maxAboveGround);
  if (player.pos.y > maxY) { player.pos.y = maxY; if (player.vel.y > 0) player.vel.y = 0; }
}
