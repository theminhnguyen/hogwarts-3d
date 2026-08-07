// Regressionstests für gespiegelte Konstanten (Qualitätsplan Etappe C4).
// progress.js spiegelt ein paar "wie viele gibt es insgesamt"-Zahlen von
// Hand aus anderen Modulen (siehe Kommentare dort: "collectibles.js:
// SPOTS.length" usw.). Ein Refactoring an der Quelle (neuer Schnatz-Spot,
// neues Seelenlicht, …) vergisst leicht, den gespiegelten Wert nachzuziehen
// — genau das prüft diese Datei automatisiert nach.
//
// Die Quelldateien (collectibles.js, puzzles.js) importieren three.js, das
// unter node --test nicht installiert ist — deshalb wie bei i18n.test.mjs
// als Text gelesen und die Arrays per Regex ausgezählt, statt zu importieren.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const progressSrc = await readFile(new URL('../src/progress.js', import.meta.url), 'utf8');

function mirroredConst(name) {
  const m = progressSrc.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  assert.ok(m, `${name} nicht in progress.js gefunden — Konstante umbenannt?`);
  return Number(m[1]);
}

test('SCHNATZ_TOTAL (progress.js) stimmt mit collectibles.js SPOTS.length überein', async () => {
  const src = await readFile(new URL('../src/collectibles.js', import.meta.url), 'utf8');
  const start = src.indexOf('const SPOTS = [');
  assert.ok(start > -1, 'SPOTS-Array nicht gefunden — Struktur von collectibles.js geändert?');
  const end = src.indexOf('\n];', start);
  const block = src.slice(start, end);
  const count = (block.match(/\{\s*id:/g) || []).length;
  assert.equal(mirroredConst('SCHNATZ_TOTAL'), count);
});

test('ARTIFACT_TOTAL (progress.js) stimmt mit puzzles.js ARTIFACT_ORDER.length überein', async () => {
  const src = await readFile(new URL('../src/puzzles.js', import.meta.url), 'utf8');
  const m = src.match(/ARTIFACT_ORDER\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'ARTIFACT_ORDER nicht in puzzles.js gefunden');
  const count = m[1].split(',').map((s) => s.trim()).filter(Boolean).length;
  assert.equal(mirroredConst('ARTIFACT_TOTAL'), count);
});

test('LICHTER_TOTAL (progress.js) stimmt mit moor.js SOULLIGHT_SPOTS.length überein', async () => {
  const src = await readFile(new URL('../src/moor.js', import.meta.url), 'utf8');
  const start = src.indexOf('const SOULLIGHT_SPOTS = [');
  assert.ok(start > -1, 'SOULLIGHT_SPOTS-Array nicht gefunden — Struktur von moor.js geändert?');
  const end = src.indexOf('\n];', start);
  const block = src.slice(start, end);
  const count = (block.match(/\{\s*id:/g) || []).length;
  assert.equal(mirroredConst('LICHTER_TOTAL'), count);
});

test('KRAEUTER_TOTAL (progress.js) stimmt mit den hartkodierten 3ern in npc.js überein', async () => {
  const src = await readFile(new URL('../src/npc.js', import.meta.url), 'utf8');
  assert.ok(src.includes('leuchtkraeuter.slice(0, 3)'), 'npc.js verwendet nicht mehr slice(0, 3) — KRAEUTER_TOTAL nachziehen?');
  assert.ok(src.includes("quests.kraeuter < 3"), 'npc.js verwendet nicht mehr < 3 — KRAEUTER_TOTAL nachziehen?');
  assert.equal(mirroredConst('KRAEUTER_TOTAL'), 3);
});
