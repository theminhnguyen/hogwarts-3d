// Regressionstests für src/progress.js — Objective Resolver (Sonnet-5-Polish,
// Meilenstein D2). Nutzt DEFAULT_SAVE/normalizeSave aus save.js als
// Ausgangsbasis, damit die Testdaten immer ein gültiges, vollständiges
// Save-Objekt sind (keine handgestrickten Teil-Objekte, die an echten
// Feldern vorbeigehen könnten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SAVE, normalizeSave } from '../src/save.js';
import { resolveProgress } from '../src/progress.js';

function save(overrides = {}) {
  return normalizeSave({ ...DEFAULT_SAVE, ...overrides });
}

test('frischer Save: Kapitel "Der Hauspokal", nichts entdeckt', () => {
  const result = resolveProgress(save());
  assert.equal(result.chapter, 'Der Hauspokal');
  assert.equal(result.primary.id, 'hauspokal');
  assert.equal(result.primary.completed, false);
  assert.match(result.primary.description, /12 Schnätze/);
  assert.match(result.primary.description, /4 Artefakte/);
  assert.match(result.primary.description, /4 Rätsel/);
  assert.deepEqual(result.secondary, []);
});

test('Hauspokal-Fortschritt: teilweise Schnätze/Artefakte/Rätsel gelöst', () => {
  const result = resolveProgress(save({
    collected: ['a', 'b', 'c'],
    art: ['flamme'],
    pz: { feuer: 1, garten: 1, lied: 0, sterne: 0 },
  }));
  assert.equal(result.chapter, 'Der Hauspokal');
  assert.match(result.primary.description, /9 Schnätze/);
  assert.match(result.primary.description, /3 Artefakte/);
  assert.match(result.primary.description, /2 Rätsel/);
  // Lied der Steine noch offen -> Hinweis zeigt auf den Steinkreis.
  assert.equal(result.primary.landmarkId, 'steinkreis');
  assert.match(result.nextHint, /Steinkreis/);
});

test('Hauspokal gewonnen, Nebelmoor noch offen -> Kapitel "Das Nebelmoor"', () => {
  const result = resolveProgress(save({
    pz: { feuer: 1, garten: 1, lied: 1, sterne: 1, hauspokal: 1 },
    moor: { lichter: ['l1', 'l2'], laterne: 0 },
  }));
  assert.equal(result.chapter, 'Das Nebelmoor');
  assert.equal(result.primary.id, 'nebelmoor');
  assert.equal(result.primary.landmarkId, 'nebelmoor');
  assert.match(result.primary.description, /2\/5/);
});

test('Hauspokal + Laterne erledigt, Heiligtümer offen -> "Die Heiligtümer des Todes"', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 0, stein: 0, steinCd: 0 },
  }));
  assert.equal(result.chapter, 'Die Heiligtümer des Todes');
  assert.equal(result.primary.id, 'heiligtuemer');
  assert.match(result.primary.description, /1\/3/);
});

test('Alles erledigt (Hauspokal, Laterne, alle 3 Heiligtümer) -> abgeschlossen', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 1, stein: 1, steinCd: 0 },
  }));
  assert.equal(result.chapter, 'Meister des Todes');
  assert.equal(result.primary.completed, true);
});

test('Nebenaufgaben: Katze aktiv + Kräuter laufend erscheinen als secondary (max. 2)', () => {
  const result = resolveProgress(save({
    quests: { katze: 1, kraeuter: 2, kraeuterDone: 0, kraeuterStarted: 1 },
    heim: { kate: 1, zutaten: { glitzer: 0, seide: 0, stern: 0, essenz: 0, leuchtkraut: 0 }, trank: { id: '', restT: 0 } },
  }));
  assert.equal(result.secondary.length, 2);
  assert.ok(result.secondary.some((s) => s.id === 'katze'));
  assert.ok(result.secondary.some((s) => s.id === 'kraeuter'));
  // Animagus wäre durch heim.kate=1 grundsätzlich freigeschaltet, aber die
  // Kappung bei zwei Nebenaufgaben hat Vorrang (Plan B1: "bis zu zwei").
  assert.ok(!result.secondary.some((s) => s.id === 'animagus'));
});

test('Animagus erscheint als Nebenaufgabe, sobald Kate gekauft ist und noch nicht gelernt wurde', () => {
  const result = resolveProgress(save({
    heim: { kate: 1, zutaten: { glitzer: 0, seide: 0, stern: 0, essenz: 0, leuchtkraut: 0 }, trank: { id: '', restT: 0 } },
    animagus: { gelernt: 0, form: 'rabe' },
  }));
  assert.ok(result.secondary.some((s) => s.id === 'animagus'));
});

test('resolveProgress ändert den übergebenen Save nicht (rein lesend)', () => {
  const s = save();
  const before = JSON.stringify(s);
  resolveProgress(s);
  assert.equal(JSON.stringify(s), before);
});
