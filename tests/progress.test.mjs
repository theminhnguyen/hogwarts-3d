// Regressionstests für src/progress.js — Objective Resolver (Sonnet-5-Polish,
// Meilenstein D2). Nutzt DEFAULT_SAVE/normalizeSave aus save.js als
// Ausgangsbasis, damit die Testdaten immer ein gültiges, vollständiges
// Save-Objekt sind (keine handgestrickten Teil-Objekte, die an echten
// Feldern vorbeigehen könnten).
//
// i18n (2026-08-04): progress.js liefert seit der Umstellung auf i18n keine
// fertigen deutschen Texte mehr, sondern Schlüssel+Variablen (siehe
// Kommentar in progress.js — Grund: i18n.js braucht echtes `localStorage`,
// das `node --test` unter Node 25 zwar als globales Objekt kennt, aber ohne
// `--localstorage-file` bei jedem Methodenaufruf wirft). Diese Tests prüfen
// deshalb Schlüssel und Variablen statt übersetzter Strings — das prüft
// dieselbe Verzweigungslogik, ist aber sprachunabhängig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SAVE, normalizeSave } from '../src/save.js';
import { resolveProgress } from '../src/progress.js';

function save(overrides = {}) {
  return normalizeSave({ ...DEFAULT_SAVE, ...overrides });
}

test('frischer Save: Kapitel "Der Hauspokal", nichts entdeckt', () => {
  const result = resolveProgress(save());
  assert.equal(result.chapterKey, 'progress.chapter.hauspokal');
  assert.equal(result.primary.id, 'hauspokal');
  assert.equal(result.primary.completed, false);
  assert.equal(result.primary.descKey, 'progress.primary.hauspokal.missing');
  const missing = result.primary.descVars.missing;
  assert.ok(missing.some((m) => m.key === 'progress.missing.schnaetze' && m.vars.n === 12));
  assert.ok(missing.some((m) => m.key === 'progress.missing.artefakte' && m.vars.n === 4));
  assert.ok(missing.some((m) => m.key === 'progress.missing.raetsel' && m.vars.n === 4));
  assert.deepEqual(result.secondary, []);
});

test('Hauspokal-Fortschritt: teilweise Schnätze/Artefakte/Rätsel gelöst', () => {
  const result = resolveProgress(save({
    collected: ['a', 'b', 'c'],
    art: ['flamme'],
    pz: { feuer: 1, garten: 1, lied: 0, sterne: 0 },
  }));
  assert.equal(result.chapterKey, 'progress.chapter.hauspokal');
  const missing = result.primary.descVars.missing;
  assert.ok(missing.some((m) => m.key === 'progress.missing.schnaetze' && m.vars.n === 9));
  assert.ok(missing.some((m) => m.key === 'progress.missing.artefakte' && m.vars.n === 3));
  assert.ok(missing.some((m) => m.key === 'progress.missing.raetsel' && m.vars.n === 2));
  // Lied der Steine noch offen -> Hinweis zeigt auf den Steinkreis.
  assert.equal(result.primary.landmarkId, 'steinkreis');
  assert.equal(result.nextHintKey, 'progress.nextHint.lied');
});

test('Hauspokal gewonnen, Nebelmoor noch offen -> Kapitel "Das Nebelmoor"', () => {
  const result = resolveProgress(save({
    pz: { feuer: 1, garten: 1, lied: 1, sterne: 1, hauspokal: 1 },
    moor: { lichter: ['l1', 'l2'], laterne: 0 },
  }));
  assert.equal(result.chapterKey, 'progress.chapter.nebelmoor');
  assert.equal(result.primary.id, 'nebelmoor');
  assert.equal(result.primary.landmarkId, 'nebelmoor');
  assert.deepEqual(result.primary.descVars, { n: 2, total: 5 });
});

test('Hauspokal + Laterne erledigt, Heiligtümer offen -> "Die Heiligtümer des Todes"', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 0, stein: 0, steinCd: 0 },
  }));
  assert.equal(result.chapterKey, 'progress.chapter.heiligtuemer');
  assert.equal(result.primary.id, 'heiligtuemer');
  assert.deepEqual(result.primary.descVars, { n: 1 });
});

test('Alles erledigt (Hauspokal, Laterne, alle 3 Heiligtümer) -> abgeschlossen', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 1, stein: 1, steinCd: 0 },
  }));
  assert.equal(result.chapterKey, 'progress.chapter.meisterDesTodes');
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

test('Vier Siegel: erscheint erst ab 1 gesammeltem Siegel, verschwindet nach finaleWon', () => {
  const none = resolveProgress(save());
  assert.ok(!none.secondary.some((s) => s.id === 'viersiegel'));

  const partial = resolveProgress(save({ siegel: { drache: 1, frost: 1, hain: 0, tiefe: 0, finaleWon: 0 } }));
  const entry = partial.secondary.find((s) => s.id === 'viersiegel');
  assert.ok(entry);
  assert.equal(entry.descKey, 'progress.secondary.viersiegel.descPartial');
  assert.deepEqual(entry.descVars, { n: 2 });

  const done = resolveProgress(save({ siegel: { drache: 1, frost: 1, hain: 1, tiefe: 1, finaleWon: 1 } }));
  assert.ok(!done.secondary.some((s) => s.id === 'viersiegel'));
});

test('Dunkler-Lord-Gate erfüllt, Lord noch nicht besiegt -> Kapitel "Der Dunkle Lord" (höchste Priorität)', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 1, stein: 1, steinCd: 0 },
    siegel: { drache: 1, frost: 1, hain: 1, tiefe: 1, finaleWon: 1 },
    lord: { torOffen: 1, phaseMax: 2, besiegt: 0, versuche: 3 },
  }));
  assert.equal(result.chapterKey, 'progress.chapter.dunklerLord');
  assert.equal(result.primary.id, 'dunklerlord');
  assert.equal(result.primary.landmarkId, 'schattenfeste');
  assert.equal(result.primary.descKey, 'progress.primary.dunklerlord.torOffenPhase');
  assert.deepEqual(result.primary.descVars, { phase: 2 });
});

test('Dunkler-Lord-Gate erfüllt aber Sternentor noch nicht durchschritten -> KEIN Lord-Kapitel', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 1, stein: 1, steinCd: 0 },
    siegel: { drache: 1, frost: 1, hain: 1, tiefe: 1, finaleWon: 0 },
  }));
  assert.notEqual(result.chapterKey, 'progress.chapter.dunklerLord');
});

test('Dunkler Lord besiegt -> Kapitel fällt durch zum Abschluss-Zweig', () => {
  const result = resolveProgress(save({
    pz: { hauspokal: 1 },
    moor: { laterne: 1 },
    hallows: { stab: 1, umhang: 1, stein: 1, steinCd: 0 },
    siegel: { drache: 1, frost: 1, hain: 1, tiefe: 1, finaleWon: 1 },
    lord: { torOffen: 1, phaseMax: 5, besiegt: 1, versuche: 4 },
  }));
  assert.notEqual(result.chapterKey, 'progress.chapter.dunklerLord');
  assert.equal(result.primary.completed, true);
});

test('resolveProgress ändert den übergebenen Save nicht (rein lesend)', () => {
  const s = save();
  const before = JSON.stringify(s);
  resolveProgress(s);
  assert.equal(JSON.stringify(s), before);
});
