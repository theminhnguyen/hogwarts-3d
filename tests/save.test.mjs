// Regressionstests für src/save.js (Sonnet-5-Polish, Meilenstein D2).
// Läuft mit dem in Node eingebauten Testrunner — keine neue Abhängigkeit
// (`npm test` -> `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, SAVE_VERSION, EXPORT_FORMAT, MAX_IMPORT_BYTES,
  DEFAULT_SAVE, normalizeSave, loadSave, writeSave, createExport, parseImport,
} from '../src/save.js';

// Einfacher Fake-Storage (kein echter Browser/localStorage nötig).
function fakeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
  };
}

// Ein vollständiger, "aktueller" Spielstand mit von den Defaults abweichenden
// Werten in JEDEM bekannten Feld — prüft, dass normalizeSave() nichts verliert.
function fullSave() {
  return {
    collected: ['schnatz-1', 'schnatz-2'],
    art: ['flamme', 'krone'],
    pz: { feuer: 1, garten: 1, lied: 0, sterne: 0, hauspokal: 0 },
    moor: { lichter: ['licht-1'], laterne: 1 },
    quests: { katze: 1, kraeuter: 2, kraeuterDone: 0, kraeuterStarted: 1 },
    besen: 1,
    bestzeit: 42.5,
    ace: 1,
    muted: true,
    music: true,
    peaceful: true,
    grafik: 'schnell',
    t: 12.3,
    gold: 250,
    ruf: 15,
    seenDeath: 1,
    wild: { aktivCamp: 2, befreit: 3, geerntet: 4 },
    mounts: { hippo: 1, thestral: 1, sattel: 1 },
    dunkel: { buch: 1, pfad: 'dunkel', male: 2 },
    heim: {
      kate: 1,
      zutaten: { glitzer: 3, seide: 2, stern: 1, essenz: 4, leuchtkraut: 5, schuppe: 2 },
      trank: { id: 'animagus', restT: 30 },
    },
    begleiter: { aktiv: 'musch', frei: ['musch', 'piniva'] },
    hallows: { stab: 1, umhang: 1, stein: 1, steinCd: 5 },
    animagus: { gelernt: 1, form: 'wolf' },
    tutorial: { seen: ['start', 'interact'] },
    map: { discovered: ['schloss', 'saal'] },
    ui: { mapHelpSeen: true },
    aschenklamm: { eggStolen: 1, dragonDefeated: 1, chestCollected: 1 },
    siegel: { drache: 1 },
  };
}

test('normalizeSave bewahrt alle Felder eines vollständigen aktuellen Saves', () => {
  const result = normalizeSave(fullSave());
  assert.deepEqual(result, fullSave());
});

test('normalizeSave liefert bei leerem/fehlendem Input sichere Defaults ohne Ausnahme', () => {
  for (const input of [{}, null, undefined, 'kaputter string', 42, [], true]) {
    assert.doesNotThrow(() => normalizeSave(input));
    const result = normalizeSave(input);
    assert.deepEqual(result.collected, []);
    assert.deepEqual(result.tutorial, { seen: [] });
    assert.deepEqual(result.map, { discovered: [] });
    assert.equal(result.gold, 0);
    assert.equal(result.animagus.form, 'rabe');
  }
});

test('normalizeSave ergänzt tutorial/map/ui bei einem alten Save ohne diese Felder', () => {
  const oldSave = { collected: ['a'], gold: 5, art: ['flamme'] };
  const result = normalizeSave(oldSave);
  assert.deepEqual(result.tutorial, { seen: [] });
  assert.deepEqual(result.map, { discovered: [] });
  assert.deepEqual(result.ui, { mapHelpSeen: false });
  // Alte Felder bleiben erhalten, nicht durch den neuen Default ersetzt.
  assert.deepEqual(result.collected, ['a']);
  assert.equal(result.gold, 5);
  assert.deepEqual(result.art, ['flamme']);
});

test('normalizeSave ergänzt aschenklamm/siegel/heim.zutaten.schuppe bei einem alten Save ohne diese Felder (v7)', () => {
  const oldSave = {
    collected: ['a'], gold: 5, tutorial: { seen: ['start'] },
    heim: { kate: 1, zutaten: { glitzer: 2, seide: 1, stern: 0, essenz: 0, leuchtkraut: 3 } },
  };
  const result = normalizeSave(oldSave);
  assert.deepEqual(result.aschenklamm, { eggStolen: 0, dragonDefeated: 0, chestCollected: 0 });
  assert.deepEqual(result.siegel, { drache: 0 });
  assert.equal(result.heim.zutaten.schuppe, 0);
  // Alte Felder bleiben erhalten, nicht durch den neuen Default ersetzt.
  assert.deepEqual(result.collected, ['a']);
  assert.equal(result.gold, 5);
  assert.deepEqual(result.tutorial, { seen: ['start'] });
  assert.equal(result.heim.zutaten.glitzer, 2);
  assert.equal(result.heim.zutaten.leuchtkraut, 3);
});

test('normalizeSave lehnt falsche Typen pro Feld ab, statt sie zu übernehmen', () => {
  const result = normalizeSave({
    collected: 'kein-array',
    gold: 'kein-number',
    muted: 'kein-boolean',
    grafik: 'ungueltiger-wert',
    animagus: { form: 'katze-oder-nicht?' },
  });
  assert.deepEqual(result.collected, []);
  assert.equal(result.gold, 0);
  assert.equal(result.muted, false);
  assert.equal(result.grafik, 'schoen');
  assert.equal(result.animagus.form, 'rabe');
});

test('loadSave/writeSave: Roundtrip über einen Fake-Storage bewahrt Fortschritt', () => {
  const storage = fakeStorage();
  const save = fullSave();
  writeSave(storage, save);
  const loaded = loadSave(storage);
  assert.deepEqual(loaded, save);
  // SAVE_KEY ist die einzige Quelle der Wahrheit für den Speicherort.
  assert.ok(storage.getItem(SAVE_KEY));
});

test('loadSave liefert Defaults bei kaputtem JSON in storage, statt zu werfen', () => {
  const storage = fakeStorage();
  storage.setItem(SAVE_KEY, '{ das ist kein json');
  assert.doesNotThrow(() => loadSave(storage));
  const result = loadSave(storage);
  assert.deepEqual(result.collected, []);
});

test('createExport/parseImport: Export -> Import erhält den vollen Fortschritt', () => {
  const save = fullSave();
  const exported = createExport(save);
  assert.equal(exported.format, EXPORT_FORMAT);
  assert.equal(exported.version, SAVE_VERSION);
  assert.ok(exported.exportedAt);

  const result = parseImport(JSON.stringify(exported));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, save);
});

test('parseImport: kaputtes JSON ergibt sauberen Fehler statt Ausnahme', () => {
  const result = parseImport('{ kein gueltiges json');
  assert.equal(result.ok, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});

test('parseImport: falsches Format (kein hogwarts3d-save) wird abgelehnt', () => {
  const result = parseImport(JSON.stringify({ format: 'irgendwas-anderes', data: {} }));
  assert.equal(result.ok, false);
});

test('parseImport: fehlendes data-Feld wird abgelehnt', () => {
  const result = parseImport(JSON.stringify({ format: EXPORT_FORMAT }));
  assert.equal(result.ok, false);
});

test('parseImport: zu große Datei wird abgelehnt (Größenprüfung vor dem Parsen)', () => {
  const tooBig = 'x'.repeat(MAX_IMPORT_BYTES + 1);
  const result = parseImport(tooBig);
  assert.equal(result.ok, false);
});

test('parseImport: nicht-string Input ergibt sauberen Fehler', () => {
  assert.equal(parseImport(undefined).ok, false);
  assert.equal(parseImport(null).ok, false);
  assert.equal(parseImport(42).ok, false);
});

test('DEFAULT_SAVE ist über normalizeSave() idempotent', () => {
  assert.deepEqual(normalizeSave(DEFAULT_SAVE), DEFAULT_SAVE);
});
