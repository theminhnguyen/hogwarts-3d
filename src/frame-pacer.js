// Bildraten-Begrenzung (Perf-Runde 2026-10-09) — reine Logik ohne three.js,
// damit `node --test` sie prüfen kann (Muster: light-pool-logic.js).
//
// requestAnimationFrame läuft im Takt des Bildschirms. Auf 120-Hz-Displays
// (MacBook Pro) würde das Spiel ohne Begrenzung doppelt so viele Bilder
// rechnen wie nötig — doppelte Wärme und doppelter Akkuverbrauch.

// Toleranz gegen das übliche Zittern der rAF-Abstände: ein 60-Hz-Bildschirm
// mit 60er-Begrenzung soll trotzdem JEDES Bild zeichnen (Abstände schwanken
// dort zwischen ~15,5 und ~17,8 ms).
export const FRAME_SLACK_MS = 2;

export function createFramePacer() {
  let last = null;
  let budget = 0;
  return {
    // now: rAF-Zeitstempel in ms. cap: gewünschte Höchstrate (0 = unbegrenzt).
    // Liefert true, wenn in diesem rAF-Aufruf gezeichnet werden soll.
    shouldRender(now, cap) {
      const elapsed = last === null || !Number.isFinite(now - last) ? Infinity : now - last;
      last = now;
      if (!(cap > 0)) return true;
      // Zeit-Budget statt fester Lücke: verteilt die Bilder z. B. auf 144 Hz
      // gleichmäßiger als "nur jedes n-te". Deckel bei 2 Intervallen, damit
      // nach einem Tab-Wechsel kein Nachhol-Schwall entsteht.
      const interval = 1000 / cap;
      budget = Math.min(budget + elapsed, interval * 2);
      if (budget < interval - FRAME_SLACK_MS) return false;
      budget = Math.max(0, budget - interval);
      return true;
    },
  };
}
