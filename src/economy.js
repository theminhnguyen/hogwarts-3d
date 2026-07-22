// Gold & Ruf (S3, PLAN-SCHATTEN-UND-SCHWINGEN.md Abschnitt 5.3). Ruf ist
// FLAVOR — sperrt NIE Inhalte (K12), wirkt nur auf Schülerverhalten
// (npc.js: winken/fliehen) und Feros Preise.

export const RUF_MIN = -100;
export const RUF_MAX = 100;
export const RUF_HIGH = 20;  // ab hier: Schüler winken, Fero-Rabatt 20%
export const RUF_LOW = -20;  // ab hier: Schüler fliehen, Fero-Aufpreis 50%

export class EconomySystem {
  constructor(hud, save) {
    this.hud = hud;
    this.save = save;
    hud.setGold(save.gold);
  }

  get gold() { return this.save.gold; }
  get ruf() { return this.save.ruf; }
  get rufHigh() { return this.save.ruf >= RUF_HIGH; }
  get rufLow() { return this.save.ruf <= RUF_LOW; }
  // S12-Balancing: bislang lohnte sich guter Ruf NUR kosmetisch (Schüler
  // winken) — Fero bestrafte schlechten Ruf (×1.5), belohnte guten aber
  // nirgends. Jetzt symmetrisch: ×0.8 bei rufHigh, auf ALLE seine Preise
  // UND den Kate-Kaufpreis angewendet (beide lesen economy.priceMul).
  get priceMul() { return this.rufLow ? 1.5 : this.rufHigh ? 0.8 : 1; }

  addGold(n) {
    this.save.gold = Math.max(0, this.save.gold + n);
    this.hud.setGold(this.save.gold);
  }

  // Preis wird VOR dem Abbuchen mit priceMul multipliziert (Aufruferseite
  // übergibt den Basispreis) — false = nicht genug Gold, kein Kauf erfolgt.
  spendGold(n) {
    const cost = Math.round(n * this.priceMul);
    if (this.save.gold < cost) return false;
    this.save.gold -= cost;
    this.hud.setGold(this.save.gold);
    return true;
  }

  addRuf(n) {
    this.save.ruf = Math.max(RUF_MIN, Math.min(RUF_MAX, this.save.ruf + n));
  }
}
