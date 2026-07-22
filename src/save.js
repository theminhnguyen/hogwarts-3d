// Save-Fundament (Sonnet-5-Polish 1.0, Meilenstein A): reine, testbare
// Save-Logik ohne Browser-Bindung. localStorage wird nur als "storage"-
// Adapter hereingereicht (Objekt mit getItem/setItem/removeItem) — dadurch
// lässt sich alles Kritische mit `node --test` prüfen (Fake-Storage statt
// echtem Browser).
//
// SAVE_KEY behält bewusst die alte "v1"-Zeichenkette (Phase 0) — ein
// Umbenennen würde alle bestehenden Spielstände verwaisen lassen. Die
// eigentliche Versionierung läuft über SAVE_VERSION im `v`-Feld des
// gespeicherten Objekts, nicht über den Schlüsselnamen.
export const SAVE_KEY = 'hogwarts3d-save-v1';
export const SAVE_VERSION = 6; // v5 (S1-S12) + v6 (Sonnet-5-Polish: tutorial/map/ui)
export const EXPORT_FORMAT = 'hogwarts3d-save';
export const MAX_IMPORT_BYTES = 250_000;

export const DEFAULT_SAVE = {
  collected: [],
  art: [],
  pz: {},
  moor: { lichter: [], laterne: 0 },
  quests: {},
  besen: 0,
  bestzeit: 0,
  ace: 0,
  muted: false,
  music: false,
  peaceful: false,
  grafik: 'schoen',
  t: undefined,
  gold: 0,
  ruf: 0,
  seenDeath: 0,
  wild: { aktivCamp: -1, befreit: 0, geerntet: 0 },
  mounts: { hippo: 0, thestral: 0, sattel: 0 },
  dunkel: { buch: 0, pfad: 'hell', male: 0 },
  heim: {
    kate: 0,
    zutaten: { glitzer: 0, seide: 0, stern: 0, essenz: 0, leuchtkraut: 0 },
    trank: { id: '', restT: 0 },
  },
  begleiter: { aktiv: '', frei: [] },
  hallows: { stab: 0, umhang: 0, stein: 0, steinCd: 0 },
  animagus: { gelernt: 0, form: 'rabe' },
  // Sonnet-5-Polish (v6):
  tutorial: { seen: [] },
  map: { discovered: [] },
  ui: { mapHelpSeen: false },
};

// ---------- kleine defensive Primitiv-Helfer ----------
// "akzeptiert nur erwartete Primitive/Arrays/bekannte Felder" (Plan A1) —
// jedes Feld wird einzeln typgeprüft, nie pauschal `raw.x || default`
// vertraut (ein Import könnte dort z.B. einen String statt Array anliefern).
function arr(v) { return Array.isArray(v) ? v : []; }
function strArr(v) { return arr(v).filter((x) => typeof x === 'string'); }
function num(v, fallback) { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }
function bool(v) { return v === true; }
function str(v, fallback) { return typeof v === 'string' ? v : fallback; }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

// Reine Normalisierung — KEIN Browserzugriff, kein Werfen. Nimmt beliebigen
// (auch bösartigen/kaputten) Input entgegen und liefert IMMER ein
// vollständiges, sicheres Save-Objekt zurück. Wird von loadSave() (normaler
// Boot), parseImport() (Datei-Import) UND writeSave() (Sicherheitsnetz vor
// jedem Schreiben) genutzt — eine einzige Quelle der Wahrheit für "was ist
// ein gültiger Save".
export function normalizeSave(value) {
  const raw = obj(value);
  const heimRaw = obj(raw.heim);
  const zutatenRaw = obj(heimRaw.zutaten);
  const trankRaw = obj(heimRaw.trank);
  // Sonderregel (K7, S1): ein Troll-Sieg zählt rückwirkend als miterlebter
  // Tod, auch wenn `seenDeath` selbst noch nicht gesetzt war (Alt-Saves).
  const seenDeath = raw.seenDeath === 1 ? 1 : (obj(raw.pz).troll === true ? 1 : 0);

  return {
    collected: strArr(raw.collected),
    art: strArr(raw.art),
    pz: obj(raw.pz),
    moor: { lichter: arr(obj(raw.moor).lichter), laterne: num(obj(raw.moor).laterne, 0) },
    quests: obj(raw.quests),
    besen: num(raw.besen, 0),
    bestzeit: num(raw.bestzeit, 0),
    ace: num(raw.ace, 0),
    muted: bool(raw.muted),
    music: bool(raw.music),
    peaceful: bool(raw.peaceful),
    grafik: raw.grafik === 'schnell' ? 'schnell' : 'schoen',
    t: typeof raw.t === 'number' ? raw.t : undefined,
    gold: num(raw.gold, 0),
    ruf: num(raw.ruf, 0),
    seenDeath,
    wild: {
      aktivCamp: num(obj(raw.wild).aktivCamp, -1),
      befreit: num(obj(raw.wild).befreit, 0),
      geerntet: num(obj(raw.wild).geerntet, 0),
    },
    mounts: {
      hippo: num(obj(raw.mounts).hippo, 0),
      thestral: num(obj(raw.mounts).thestral, 0),
      sattel: num(obj(raw.mounts).sattel, 0),
    },
    dunkel: {
      buch: num(obj(raw.dunkel).buch, 0),
      pfad: obj(raw.dunkel).pfad === 'dunkel' ? 'dunkel' : 'hell',
      male: num(obj(raw.dunkel).male, 0),
    },
    // heim.zutaten.leuchtkraut (S7) ist neuer als heim selbst — Feld für Feld
    // zusammensetzen, sonst bliebe es bei Alt-Saves für immer undefined.
    heim: {
      kate: num(heimRaw.kate, 0),
      zutaten: {
        glitzer: num(zutatenRaw.glitzer, 0),
        seide: num(zutatenRaw.seide, 0),
        stern: num(zutatenRaw.stern, 0),
        essenz: num(zutatenRaw.essenz, 0),
        leuchtkraut: num(zutatenRaw.leuchtkraut, 0),
      },
      trank: { id: str(trankRaw.id, ''), restT: num(trankRaw.restT, 0) },
    },
    begleiter: { aktiv: str(obj(raw.begleiter).aktiv, ''), frei: strArr(obj(raw.begleiter).frei) },
    hallows: {
      stab: num(obj(raw.hallows).stab, 0),
      umhang: num(obj(raw.hallows).umhang, 0),
      stein: num(obj(raw.hallows).stein, 0),
      steinCd: num(obj(raw.hallows).steinCd, 0),
    },
    animagus: {
      gelernt: num(obj(raw.animagus).gelernt, 0),
      form: ['rabe', 'katze', 'wolf'].includes(obj(raw.animagus).form) ? obj(raw.animagus).form : 'rabe',
    },
    tutorial: { seen: strArr(obj(raw.tutorial).seen) },
    map: { discovered: strArr(obj(raw.map).discovered) },
    ui: { mapHelpSeen: bool(obj(raw.ui).mapHelpSeen) },
  };
}

export function loadSave(storage) {
  let raw = {};
  try { raw = JSON.parse(storage.getItem(SAVE_KEY)) || {}; } catch { raw = {}; }
  return normalizeSave(raw);
}

// Normalisiert IMMER vor dem Schreiben (Sicherheitsnetz) — persist() in
// main.js baut das Objekt von Hand zusammen, ein Tippfehler dort darf nie
// einen kaputten Save erzeugen.
export function writeSave(storage, data) {
  try { storage.setItem(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, ...normalizeSave(data) })); } catch { /* privat-modus etc. */ }
}

export function createExport(data) {
  return {
    format: EXPORT_FORMAT,
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    data: normalizeSave(data),
  };
}

// Nimmt rohen Dateitext entgegen, gibt { ok:true, data } oder
// { ok:false, error } zurück — wirft NIE (Aufrufer soll nie try/catch
// brauchen). Größenprüfung zuerst (billig), dann Parsen, dann Format.
export function parseImport(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Keine lesbare Datei.' };
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: `Datei zu groß (>${Math.round(MAX_IMPORT_BYTES / 1000)} KB) — das ist kein gültiger Spielstand.` };
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'Datei ist kein gültiges JSON.' }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Unerwartetes Dateiformat.' };
  }
  if (parsed.format !== EXPORT_FORMAT) {
    return { ok: false, error: 'Das ist keine Hogwarts-3D-Spielstand-Datei.' };
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    return { ok: false, error: 'Datei enthält keinen Spielstand.' };
  }
  // Ältere/neuere `version`-Werte werden akzeptiert (normalizeSave füllt
  // fehlende Felder ohnehin auf) — nur das Grundformat muss passen.
  return { ok: true, data: normalizeSave(parsed.data) };
}
