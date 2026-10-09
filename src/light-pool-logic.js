// Reine Auswahl-Logik des Licht-Pools (Perf-Runde 2026-10-09) — bewusst
// OHNE three.js, damit `node --test` sie direkt prüfen kann (Muster:
// progress.js). Das three.js-Gegenstück mit den echten Lichtern liegt in
// light-pool.js.
//
// Hintergrund: three.js rechnet JEDES sichtbare PointLight in JEDEM
// beleuchteten Pixel mit — auch eines mit intensity 0. Mit 32 gleichzeitig
// sichtbaren Lichtern (davon 26 dunkel) kostete ein Bild auf einem M1 Pro
// ~11 ms GPU-Zeit statt ~2 ms. Und jede Änderung der ANZAHL sichtbarer
// Lichter (Region wacht auf, Meteornacht) ließ three.js alle Shader neu
// kompilieren — bis zu 2,6 s Standbild. Der Pool hält deshalb eine FESTE
// Zahl echter Lichter und verteilt sie jedes Bild auf die wichtigsten
// "virtuellen" Lichtquellen.

// Ein- und Ausblenden beim Wechsel, damit ein Licht am Rand der Auswahl
// nicht hart aufploppt.
export const FADE_TIME = 0.35;
// Bonus (in Metern) für Lichter, die schon einen Platz haben — verhindert
// Hin- und Herspringen zwischen zwei fast gleich weit entfernten Lichtern.
export const HYSTERESIS = 8;

// Wie wichtig ist ein Licht fürs aktuelle Bild? Abstand Kamera→Licht minus
// Reichweite: negativ heißt, die Kamera steht im Lichtkegel. Kleiner = wichtiger.
// Reichweite 0 bedeutet in three.js "unbegrenzt" — dann immer ganz vorne.
export function lightScore(camX, camY, camZ, x, y, z, range) {
  if (!(range > 0)) return -Infinity;
  return Math.hypot(x - camX, y - camY, z - camZ) - range;
}

// slots:      Array<{ src, weight }> — feste Länge = Poolgröße. `src` ist die
//             zugewiesene Lichtquelle (oder null), `weight` 0..1 ihr Ein-/
//             Ausblendfaktor.
// candidates: Array<{ src, score }> — NUR Lichter, die gerade leuchten und
//             sichtbar sind. Wird umsortiert und um Hilfsfelder ergänzt
//             (slot/rank/wanted); der Aufrufer darf die Objekte wiederverwenden.
// Verändert `slots` an Ort und Stelle, gibt nichts zurück.
export function assignSlots(slots, candidates, dt, opts = {}) {
  const fadeTime = opts.fadeTime ?? FADE_TIME;
  const hysteresis = opts.hysteresis ?? HYSTERESIS;
  const n = slots.length;
  const step = fadeTime > 0 ? dt / fadeTime : 1;

  // 1) Welche Kandidaten sitzen schon in einem Platz? Plätze, deren Licht
  //    erloschen oder unsichtbar geworden ist, werden sofort frei — ihr
  //    Licht trägt ohnehin nichts mehr bei, also gibt es nichts auszublenden.
  for (const c of candidates) c.slot = -1;
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    if (!s.src) continue;
    let found = null;
    for (const c of candidates) if (c.src === s.src) { found = c; break; }
    if (found) found.slot = i;
    else { s.src = null; s.weight = 0; }
  }

  // 2) Rangfolge (mit Hysterese-Bonus für bereits platzierte Lichter).
  for (const c of candidates) c.rank = c.slot >= 0 ? c.score - hysteresis : c.score;
  candidates.sort((a, b) => a.rank - b.rank);
  for (let k = 0; k < candidates.length; k++) candidates[k].wanted = k < n;

  // 3) Bestehende Plätze ein- bzw. ausblenden; ganz ausgeblendet = frei.
  for (const c of candidates) {
    if (c.slot < 0) continue;
    const s = slots[c.slot];
    if (c.wanted) {
      s.weight = Math.min(1, s.weight + step);
    } else {
      s.weight = Math.max(0, s.weight - step);
      if (s.weight === 0) { s.src = null; c.slot = -1; }
    }
  }

  // 4) Neu gewünschte Lichter unterbringen (wichtigste zuerst). Ist kein
  //    Platz frei, wartet ein entferntes Licht, bis ein ausblendendes fertig
  //    ist (höchstens FADE_TIME) — so verschwindet nichts hart. Nur ein Licht,
  //    in dessen Kegel die Kamera schon steht (frischer Zauber, Lumos), darf
  //    sofort den unwichtigsten ausblendenden Platz übernehmen.
  for (const c of candidates) {
    if (!c.wanted || c.slot >= 0) continue;
    let idx = -1;
    for (let i = 0; i < n; i++) if (!slots[i].src) { idx = i; break; }
    if (idx < 0) {
      if (c.score > 0) continue;
      let victim = null;
      for (const o of candidates) {
        if (o.slot >= 0 && !o.wanted && (!victim || o.rank > victim.rank)) victim = o;
      }
      if (!victim) continue; // kann nicht passieren: höchstens n gewünschte Lichter
      idx = victim.slot;
      victim.slot = -1;
    }
    // Steht die Kamera schon im Lichtkegel (frisch gewirkter Zauber, Lumos,
    // entzündete Feuerschale), sofort voll — sonst sanft einblenden.
    slots[idx].src = c.src;
    slots[idx].weight = c.score <= 0 ? 1 : 0;
    c.slot = idx;
  }
}
