// Regressionstests für die Auswahl-Logik des Licht-Pools (src/light-pool-logic.js,
// Perf-Runde 2026-10-09). Reine Logik ohne three.js — Lichtquellen sind hier
// einfache Objekte, entscheidend ist nur ihre Identität.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignSlots, lightScore, FADE_TIME, HYSTERESIS } from '../src/light-pool-logic.js';

function makeSlots(n) {
  return Array.from({ length: n }, () => ({ src: null, weight: 0 }));
}
// Kandidaten frisch pro Bild (wie im echten Pool: nur leuchtende, sichtbare Lichter).
function cands(list) {
  return list.map(([src, score]) => ({ src, score }));
}
function assigned(slots) {
  return slots.filter((s) => s.src).map((s) => s.src.id).sort();
}
const L = (id) => ({ id });

test('lightScore: Kamera im Lichtkegel ist negativ, Reichweite 0 heißt unbegrenzt', () => {
  assert.equal(lightScore(0, 0, 0, 3, 4, 0, 10), -5);
  assert.equal(lightScore(0, 0, 0, 30, 40, 0, 10), 40);
  assert.equal(lightScore(0, 0, 0, 1000, 0, 0, 0), -Infinity);
});

test('assignSlots: bei Überzahl bekommen die wichtigsten Lichter die Plätze', () => {
  const slots = makeSlots(2);
  const [a, b, c] = [L('a'), L('b'), L('c')];
  assignSlots(slots, cands([[a, 30], [b, -2], [c, 10]]), 1 / 60);
  assert.deepEqual(assigned(slots), ['b', 'c']);
});

test('assignSlots: nie mehr Zuweisungen als Plätze, kein Licht doppelt', () => {
  const slots = makeSlots(3);
  const lights = Array.from({ length: 10 }, (_, i) => L('l' + i));
  for (let frame = 0; frame < 30; frame++) {
    // Abstände ändern sich jedes Bild (Spieler läuft)
    assignSlots(slots, cands(lights.map((l, i) => [l, ((i * 7 + frame * 3) % 50) - 5])), 1 / 60);
    const ids = assigned(slots);
    assert.ok(ids.length <= 3);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('assignSlots: Licht direkt bei der Kamera ist sofort voll da, entferntes blendet ein', () => {
  const slots = makeSlots(2);
  const near = L('near'), far = L('far');
  assignSlots(slots, cands([[near, -3], [far, 20]]), 1 / 60);
  assert.equal(slots.find((s) => s.src === near).weight, 1);
  assert.equal(slots.find((s) => s.src === far).weight, 0);
  // nach FADE_TIME voll eingeblendet
  for (let t = 0; t < FADE_TIME + 0.05; t += 1 / 60) assignSlots(slots, cands([[near, -3], [far, 20]]), 1 / 60);
  assert.equal(slots.find((s) => s.src === far).weight, 1);
});

test('assignSlots: erloschenes Licht gibt seinen Platz sofort frei', () => {
  const slots = makeSlots(1);
  const a = L('a'), b = L('b');
  assignSlots(slots, cands([[a, -1]]), 1 / 60);
  assert.deepEqual(assigned(slots), ['a']);
  // a ist aus (taucht nicht mehr unter den Kandidaten auf) — b bekommt den Platz im selben Bild
  assignSlots(slots, cands([[b, -1]]), 1 / 60);
  assert.deepEqual(assigned(slots), ['b']);
  assert.equal(slots[0].weight, 1);
});

test('assignSlots: entferntes neues Licht wartet, bis das verdrängte ausgeblendet ist', () => {
  const slots = makeSlots(1);
  const a = L('a'), b = L('b');
  assignSlots(slots, cands([[a, 30]]), 1);
  assignSlots(slots, cands([[a, 30]]), 1); // a voll eingeblendet
  assert.equal(slots[0].weight, 1);
  const bScore = 30 - HYSTERESIS - 10; // deutlich wichtiger, aber noch weit weg (>0)
  assignSlots(slots, cands([[a, 30], [b, bScore]]), FADE_TIME / 2);
  assert.deepEqual(assigned(slots), ['a'], 'a blendet erst aus, statt hart zu verschwinden');
  assert.ok(slots[0].weight > 0 && slots[0].weight < 1);
  // Im Schritt, in dem a fertig ausgeblendet ist, übernimmt b den Platz — bei 0.
  assignSlots(slots, cands([[a, 30], [b, bScore]]), FADE_TIME / 2);
  assert.deepEqual(assigned(slots), ['b']);
  assert.equal(slots[0].weight, 0, 'b blendet von 0 an ein');
  assignSlots(slots, cands([[a, 30], [b, bScore]]), 1 / 60);
  assert.ok(slots[0].weight > 0 && slots[0].weight < 0.1);
});

test('assignSlots: Licht direkt bei der Kamera verdrängt sofort (z. B. frischer Zauber)', () => {
  const slots = makeSlots(1);
  const a = L('a'), spell = L('spell');
  assignSlots(slots, cands([[a, 30]]), 1);
  assignSlots(slots, cands([[a, 30]]), 1);
  assignSlots(slots, cands([[a, 30], [spell, -4]]), 1 / 60);
  assert.deepEqual(assigned(slots), ['spell']);
  assert.equal(slots[0].weight, 1);
});

test('assignSlots: Hysterese verhindert Flackern bei fast gleich wichtigen Lichtern', () => {
  const slots = makeSlots(1);
  const a = L('a'), b = L('b');
  assignSlots(slots, cands([[a, 10]]), 1);
  assignSlots(slots, cands([[a, 10]]), 1); // a voll eingeblendet
  // b ist nur minimal wichtiger als a — a behält den Platz
  for (let i = 0; i < 10; i++) assignSlots(slots, cands([[a, 10], [b, 10 - HYSTERESIS / 2]]), 1 / 60);
  assert.deepEqual(assigned(slots), ['a']);
  assert.equal(slots[0].weight, 1);
});

test('assignSlots: weniger Lichter als Plätze — alle bekommen einen, Rest bleibt leer', () => {
  const slots = makeSlots(8);
  assignSlots(slots, cands([[L('a'), 3], [L('b'), -1]]), 1 / 60);
  assert.deepEqual(assigned(slots), ['a', 'b']);
  assert.equal(slots.filter((s) => !s.src).length, 6);
});

test('assignSlots: keine Kandidaten (alles dunkel) leert alle Plätze', () => {
  const slots = makeSlots(3);
  assignSlots(slots, cands([[L('a'), 1], [L('b'), 2]]), 1);
  assignSlots(slots, [], 1 / 60);
  assert.deepEqual(assigned(slots), []);
  assert.ok(slots.every((s) => s.weight === 0));
});
