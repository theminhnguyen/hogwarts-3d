// Generische Interakt-Registry: NPCs/Objekte melden sich mit Position +
// Reichweite + Prompt-Text an, das System zeigt den nächsten aktiven
// Treffer als HUD-Prompt und löst ihn per Taste E aus (main.js).

export class InteractSystem {
  constructor(hud) {
    this.hud = hud;
    this.targets = [];
    this.current = null;
  }

  // x/z dürfen auch Getter sein (bewegliche NPCs) — { get x() {...}, ... }.
  // WICHTIG: per Objekt-Destrukturierung ({x, z} = spec) würde ein Getter
  // sofort ausgewertet und als toter Zahlen-Snapshot eingefroren — deshalb
  // Property-DESCRIPTORS kopieren (Object.defineProperties), nicht Werte.
  register(spec) {
    const entry = {};
    Object.defineProperties(entry, Object.getOwnPropertyDescriptors(spec));
    if (entry.r === undefined) entry.r = 2.2;
    if (entry.enabled === undefined) entry.enabled = true;
    this.targets.push(entry);
    return entry;
  }

  // Nutzerwunsch (2026-08-06): gesperrte Ziele in Reichweite zeigen — sofern
  // sie einen lockedPrompt mitgeben — einen Hinweis statt komplett stumm zu
  // bleiben ("warum reagiert das nicht?"). this.current bleibt dabei IMMER
  // best (nie lockedBest) — Taste E darf bei einem reinen Hinweis nie
  // onInteract auslösen.
  update(player) {
    let best = null, bestD = Infinity;
    let lockedBest = null, lockedBestD = Infinity;
    for (const t of this.targets) {
      const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
      if (d >= t.r) continue;
      if (t.enabled) {
        if (d < bestD) { bestD = d; best = t; }
      } else if (t.lockedPrompt && d < lockedBestD) {
        lockedBestD = d; lockedBest = t;
      }
    }
    this.current = best;
    if (best) this.hud.showInteractPrompt(best.prompt);
    else if (lockedBest) this.hud.showInteractPrompt(lockedBest.lockedPrompt, true);
    else this.hud.hideInteractPrompt();
  }

  trigger() {
    if (this.current) this.current.onInteract();
  }
}
