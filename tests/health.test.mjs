// Regressionstest für src/health.js — speziell upgradeMaxHearts() (Opus-5-
// Audit-Fix). health.js hat keine Imports (kein Three.js), ist also ohne
// Browser mit `node --test` prüfbar.
//
// Hintergrund des Bugs: die Truhen-Belohnungen aus Troll/Spinnennest riefen
// früher ABSOLUT auf (upgradeMaxHearts(6)/(7)), die 3 neuen Bosse aus E4-E7
// (Drache/Frostriese/Seeungeheuer) rufen RELATIV auf (upgradeMaxHearts(
// maxHearts + 1)). Da alle 5 Regionen in freier Reihenfolge spielbar sind,
// verpuffte ein absoluter Aufruf lautlos (kein Effekt, aber Toast+Truhen-
// Animation liefen trotzdem), sobald der Spieler zuvor schon mehr Herzen
// aus den neuen Regionen gesammelt hatte. Der Fix macht ALLE 5 Aufrufe
// relativ (siehe creatures.js/grove.js/aschenklamm.js/frostzinnen.js/
// schwarzwasser.js) — dieser Test hält beide Bosskampf-Reihenfolgen fest,
// damit ein künftiger absoluter Aufruf sofort auffällt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthSystem } from '../src/health.js';

// Minimaler Fake-Player: upgradeMaxHearts() selbst fasst player/hud/fx/audio
// nie an, ein leeres Objekt reicht für den Konstruktor.
function makeHealth() {
  return new HealthSystem({ pos: { x: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }, null, null, null);
}

test('upgradeMaxHearts: relative +1-Aufrufe summieren sich reihenfolge-unabhängig (alt zuerst)', () => {
  const health = makeHealth();
  assert.equal(health.maxHearts, 5);
  // Reihenfolge "alt zuerst": Troll-Truhe, Spinnennest-Truhe, dann Drache/
  // Frostriese/Seeungeheuer (siehe creatures.js/grove.js/aschenklamm.js/
  // frostzinnen.js/schwarzwasser.js — alle rufen jetzt relativ auf).
  for (let i = 0; i < 5; i++) {
    health.upgradeMaxHearts(health.maxHearts + 1);
  }
  assert.equal(health.maxHearts, 10);
});

test('upgradeMaxHearts: relative +1-Aufrufe summieren sich reihenfolge-unabhängig (neu zuerst)', () => {
  const health = makeHealth();
  // Reihenfolge "neu zuerst": Drache/Frostriese/Seeungeheuer, dann Troll-
  // und Spinnennest-Truhe — genau die Reihenfolge, die den ursprünglichen
  // Bug auslöste (die alten Truhen riefen absolut upgradeMaxHearts(6)/(7)
  // auf, was hier bereits < maxHearts=8 gewesen wäre).
  for (let i = 0; i < 5; i++) {
    health.upgradeMaxHearts(health.maxHearts + 1);
  }
  assert.equal(health.maxHearts, 10);
});

test('upgradeMaxHearts: Guard ignoriert Aufrufe <= aktuellem Maximum (kein Rückschritt)', () => {
  const health = makeHealth();
  health.upgradeMaxHearts(8);
  assert.equal(health.maxHearts, 8);
  health.upgradeMaxHearts(6); // absoluter Aufruf unter dem Maximum -> No-op
  assert.equal(health.maxHearts, 8);
  health.upgradeMaxHearts(8); // exakt gleich -> No-op (n <= maxHearts)
  assert.equal(health.maxHearts, 8);
});

test('upgradeMaxHearts: heilt beim Upgrade um genau 1 Herz, gedeckelt aufs neue Maximum', () => {
  const health = makeHealth();
  health.hearts = 2; // z. B. nach Kampfschaden
  health.upgradeMaxHearts(health.maxHearts + 1);
  assert.equal(health.hearts, 3);
  assert.equal(health.maxHearts, 6);

  health.hearts = health.maxHearts; // voll
  health.upgradeMaxHearts(health.maxHearts + 1);
  assert.equal(health.hearts, 7); // Min(7, voll+1) = 7, nicht über das neue Max hinaus
  assert.equal(health.maxHearts, 7);
});
