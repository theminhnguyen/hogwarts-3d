// Regressionstests für die reinen Datenteile von src/marauders-map.js
// (Qualitätsplan Etappe A3): LANDMARKS, ALMANAC, TITLES, landmarkTrackerInfo.
// DOM-Rendering (buildMarauderMap) bleibt bewusst außen vor.
//
// marauders-map.js importiert i18n.js, das beim Modul-Laden auf localStorage
// zugreift (Zeile 15) — unter node --test nicht vorhanden. Deshalb hier ein
// Minimal-Stub VOR dem Import setzen. Ein normaler statischer Import würde
// zu früh laufen (ESM hebt Imports vor den Modul-Body), deshalb bewusst ein
// dynamischer `await import(...)` NACH dem Stub (Plan A3: Stub-Variante,
// kein Refactoring von marauders-map.js nur für den Test).
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSave } from '../src/save.js';

const { LANDMARKS, ALMANAC, TITLES, landmarkTrackerInfo } = await import('../src/marauders-map.js');

// Ein Save, in dem WIRKLICH ALLES erledigt ist — deckt jede 'fertig'-
// Bedingung aus ALMANAC und jede earned()-Bedingung aus TITLES gleichzeitig ab.
function completedSave() {
  const s = normalizeSave({});
  s.besen = 1;
  s.ace = 1;
  s.seenDeath = 1;
  s.mounts = { hippo: 1, thestral: 1, einhorn: 1, sattel: 1 };
  s.begleiter = { aktiv: 'musch', frei: ['musch', 'piniva', 'grabbel'] };
  s.quests = { feroSammler: 1 };
  s.wild = { aktivCamp: -1, befreit: 1, geerntet: 0, duellSiege: 2 };
  s.siegel = { drache: 1, frost: 1, hain: 1, tiefe: 1, finaleWon: 1 };
  s.hallows = { stab: 1, umhang: 1, stein: 1, steinCd: 0 };
  s.heim.kate = 1;
  s.animagus = { gelernt: 1, form: 'rabe' };
  s.dunkel = { buch: 1, pfad: 'dunkel', male: 0 };
  s.pz = { hauspokal: 1 };
  s.moor.laterne = 1;
  s.lord = { torOffen: 1, phaseMax: 5, besiegt: 1, versuche: 1 };
  return s;
}

test('marauders-map: jeder ALMANAC-Eintrag erreicht "fertig" bei einem vollständig abgeschlossenen Save', () => {
  const s = completedSave();
  const notDone = ALMANAC.filter((a) => a.status(s) !== 'fertig').map((a) => a.id);
  assert.deepEqual(notDone, [], `Einträge, die trotz vollständigem Save nicht 'fertig' melden: ${notDone.join(', ')}`);
});

test('marauders-map: ALMANAC status()/hint() werfen auf einem frischen Default-Save nicht (keine falschen Save-Pfade)', () => {
  const s = normalizeSave({});
  for (const a of ALMANAC) {
    assert.doesNotThrow(() => a.status(s), `${a.id}.status() wirft auf DEFAULT_SAVE — falscher/fehlender Save-Pfad?`);
    const st = a.status(s);
    assert.doesNotThrow(() => a.hint(s), `${a.id}.hint() wirft auf DEFAULT_SAVE — falscher/fehlender Save-Pfad?`);
    const h = a.hint(s);
    assert.ok(h && typeof h.key === 'string', `${a.id}.hint() liefert kein {key,...}-Objekt (Status: ${st})`);
  }
});

test('marauders-map: ALMANAC status()/hint() werfen auf einem komplett abgeschlossenen Save nicht', () => {
  const s = completedSave();
  for (const a of ALMANAC) {
    assert.doesNotThrow(() => a.status(s));
    assert.doesNotThrow(() => a.hint(s));
  }
});

test('marauders-map: "thestral" durchläuft gesperrt -> offen -> fertig', () => {
  const s = normalizeSave({});
  assert.equal(ALMANAC.find((a) => a.id === 'thestral').status(s), 'gesperrt');
  s.seenDeath = 1;
  assert.equal(ALMANAC.find((a) => a.id === 'thestral').status(s), 'offen');
  s.mounts.thestral = 1;
  assert.equal(ALMANAC.find((a) => a.id === 'thestral').status(s), 'fertig');
});

test('marauders-map: "animagus" durchläuft gesperrt -> offen -> fertig', () => {
  const s = normalizeSave({});
  assert.equal(ALMANAC.find((a) => a.id === 'animagus').status(s), 'gesperrt');
  s.heim.kate = 1;
  assert.equal(ALMANAC.find((a) => a.id === 'animagus').status(s), 'offen');
  s.animagus.gelernt = 1;
  assert.equal(ALMANAC.find((a) => a.id === 'animagus').status(s), 'fertig');
});

test('marauders-map: Einträge ohne "gesperrt"-Zustand starten bei "offen" auf einem Default-Save', () => {
  const s = normalizeSave({});
  const lockable = new Set(['thestral', 'animagus']);
  for (const a of ALMANAC) {
    if (lockable.has(a.id)) continue;
    assert.equal(a.status(s), 'offen', `${a.id} sollte auf einem frischen Save 'offen' sein`);
  }
});

test('marauders-map: jeder TITLES-Eintrag ist auf einem Default-Save nicht erledigt und auf dem Komplett-Save erledigt', () => {
  const fresh = normalizeSave({});
  const done = completedSave();
  for (const ti of TITLES) {
    assert.doesNotThrow(() => ti.earned(fresh), `${ti.id}.earned() wirft auf DEFAULT_SAVE`);
    assert.equal(ti.earned(fresh), false, `${ti.id} sollte auf einem frischen Save nicht erledigt sein`);
    assert.equal(ti.earned(done), true, `${ti.id} sollte auf dem Komplett-Save erledigt sein`);
  }
});

test('landmarkTrackerInfo(): unbekannte ID liefert null', () => {
  assert.equal(landmarkTrackerInfo('nicht-vorhanden', { x: 0, z: 0 }), null);
  assert.equal(landmarkTrackerInfo(null, { x: 0, z: 0 }), null);
  assert.equal(landmarkTrackerInfo('schloss', null), null);
});

test('landmarkTrackerInfo(): bekannte ID liefert korrekte Distanz/Richtung', () => {
  const lm = LANDMARKS.find((l) => l.id === 'steinkreis');
  const playerPos = { x: 0, z: 0 };
  const info = landmarkTrackerInfo('steinkreis', playerPos);
  const dx = lm.x - playerPos.x, dz = lm.z - playerPos.z;
  const expectedDist = Math.hypot(dx, dz);
  const expectedAngle = Math.atan2(dx, -dz);
  assert.ok(Math.abs(info.dist - expectedDist) < 1e-9);
  assert.ok(Math.abs(info.angle - expectedAngle) < 1e-9);
});

test('marauders-map: jede in progress.js verwendete landmarkId existiert in LANDMARKS', async () => {
  const progressSrc = await readFile(new URL('../src/progress.js', import.meta.url), 'utf8');
  const ids = [...progressSrc.matchAll(/landmarkId:\s*'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(ids.length > 0, 'keine landmarkId-Verwendung in progress.js gefunden — Regex kaputt?');
  const known = new Set(LANDMARKS.map((l) => l.id));
  const unknown = [...new Set(ids)].filter((id) => !known.has(id));
  assert.deepEqual(unknown, [], `progress.js verweist auf unbekannte Landmarken: ${unknown.join(', ')}`);
});

test('marauders-map: LANDMARKS-IDs sind eindeutig', () => {
  const ids = LANDMARKS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'doppelte id in LANDMARKS gefunden');
});
