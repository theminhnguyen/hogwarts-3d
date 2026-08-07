// Regressionstests für die DE/EN-Übersetzungsparität in src/i18n.js
// (Qualitätsplan Etappe A1).
//
// i18n.js greift beim Modul-Laden auf localStorage zu (Zeile 15: `let lang =
// localStorage.getItem(...)`), das unter `node --test` ohne
// --localstorage-file fehlt. Deshalb wird die Datei hier NICHT importiert,
// sondern als Text gelesen und geparst — das gleiche Verfahren, das schon
// mehrfach von Hand im Browser (fetch + Regex) gefahren wurde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const src = await readFile(new URL('../src/i18n.js', import.meta.url), 'utf8');

// Zeilenverankert! Ein naives indexOf('de: {') kann irgendwo im Fließtext
// eines Wertes falsch treffen.
const deStart = src.indexOf('\n  de: {');
const enStart = src.indexOf('\n  en: {');
const dictEnd = src.indexOf('\n};', enStart);
assert.ok(
  deStart > -1 && enStart > -1 && dictEnd > -1 && deStart < enStart && enStart < dictEnd,
  'DICT-Blockgrenzen nicht gefunden — hat sich der Aufbau von i18n.js geändert?',
);

const deBlock = src.slice(deStart, enStart);
const enBlock = src.slice(enStart, dictEnd);

// Werte stehen meist in '...', aber sobald der Text selbst ein ' enthält
// (z. B. "Jack-o'-Lantern!"), verwendet i18n.js "..." — beide Formen matchen.
const ENTRY_RE = /^\s{4}'([a-zA-Z0-9_.]+)':\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"),?\s*$/gm;

function parseBlock(block) {
  const map = new Map();
  const duplicates = [];
  let match;
  ENTRY_RE.lastIndex = 0;
  while ((match = ENTRY_RE.exec(block))) {
    const [, key, literal] = match;
    if (map.has(key)) duplicates.push(key);
    // literal ist ein syntaktisch valides JS-String-Literal aus unserer
    // eigenen Quelldatei (kein externer Input) — sicher auswertbar.
    const value = new Function(`return ${literal}`)();
    map.set(key, value);
  }
  return { map, duplicates };
}

const de = parseBlock(deBlock);
const en = parseBlock(enBlock);

test('i18n: DE-Block wird geparst und ist plausibel groß', () => {
  assert.ok(de.map.size > 100, `nur ${de.map.size} DE-Einträge gefunden — Parser-Regex kaputt?`);
});

test('i18n: EN-Block wird geparst und ist plausibel groß', () => {
  assert.ok(en.map.size > 100, `nur ${en.map.size} EN-Einträge gefunden — Parser-Regex kaputt?`);
});

test('i18n: geparste Eintragszahl deckt sich mit Roh-Zeilenzahl (kein Eintrag übersehen)', () => {
  const rawLines = (src.match(/^\s{4}'[a-zA-Z0-9_.]+':/gm) || []).length;
  assert.equal(
    de.map.size + en.map.size,
    rawLines,
    'ENTRY_RE hat weniger/mehr Zeilen erfasst als es Schlüssel-Zeilen im File gibt — vermutlich ein Wert-Format, das die Regex nicht abdeckt.',
  );
});

test('i18n: keine doppelten Schlüssel innerhalb eines Blocks', () => {
  assert.deepEqual(de.duplicates, [], `doppelte DE-Schlüssel: ${de.duplicates.join(', ')}`);
  assert.deepEqual(en.duplicates, [], `doppelte EN-Schlüssel: ${en.duplicates.join(', ')}`);
});

test('i18n: DE und EN haben identische Schlüsselmengen', () => {
  const deKeys = new Set(de.map.keys());
  const enKeys = new Set(en.map.keys());
  const onlyDe = [...deKeys].filter((k) => !enKeys.has(k)).sort();
  const onlyEn = [...enKeys].filter((k) => !deKeys.has(k)).sort();
  assert.deepEqual(onlyDe, [], `Schlüssel nur in DE (fehlt in EN): ${onlyDe.join(', ')}`);
  assert.deepEqual(onlyEn, [], `Schlüssel nur in EN (fehlt in DE): ${onlyEn.join(', ')}`);
});

function placeholders(str) {
  return new Set([...str.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]));
}

test('i18n: {platzhalter} stimmen zwischen DE- und EN-Text überein', () => {
  const mismatches = [];
  for (const [key, deVal] of de.map) {
    const enVal = en.map.get(key);
    if (enVal === undefined) continue; // fehlender Schlüssel wird oben schon gemeldet
    const deP = placeholders(deVal);
    const enP = placeholders(enVal);
    const onlyDe = [...deP].filter((p) => !enP.has(p));
    const onlyEn = [...enP].filter((p) => !deP.has(p));
    if (onlyDe.length || onlyEn.length) {
      mismatches.push(`${key}: DE hat {${onlyDe.join(',')}}, EN hat {${onlyEn.join(',')}}`);
    }
  }
  assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

// Eigennamen/Fantasiebegriffe, die bewusst auch im EN-Text mit Umlaut/ß
// stehen (keine vergessene Übersetzung, sondern Weltnamen).
const UMLAUT_EXCEPTIONS = new Set([]);

test('i18n: keine Umlaute/ß in EN-Werten (Heuristik für vergessene Übersetzung)', () => {
  const offenders = [];
  for (const [key, val] of en.map) {
    if (UMLAUT_EXCEPTIONS.has(key)) continue;
    if (/[äöüÄÖÜß]/.test(val)) offenders.push(`${key}: "${val}"`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});
