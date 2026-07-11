// HUD: Zähler, Uhr, Kompass, FPS, Hinweise und Toast-Meldungen.

const el = (id) => document.getElementById(id);

const SECTORS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

export class Hud {
  constructor() {
    this.hud = el('hud');
    this.counter = el('counter');
    this.clock = el('clock');
    this.compass = el('compass');
    this.fps = el('fps');
    this.tracker = el('tracker');
    this.trackerArrow = el('tracker-arrow');
    this.trackerDist = el('tracker-dist');
    this.hint = el('hint');
    this.toast = el('toast');
    this.spellbar = el('spellbar');
    this.spellChips = {};
    this._spellMax = {};
    this._toastTimer = 0;
    this._fpsVisible = false;
  }

  setActive(on) { this.hud.classList.toggle('active', on); }

  setCounter(n, total) { this.counter.textContent = `✦ ${n} / ${total}`; }

  // Baut die 4 Spruch-Chips einmalig auf (Reihenfolge = Anzeigereihenfolge)
  buildSpellbar(spells) {
    this.spellbar.innerHTML = spells.map((s, i) => {
      const hex = '#' + s.color.toString(16).padStart(6, '0');
      return `<div class="spell-chip" id="spell-${s.id}" style="--spell-color:${hex}">
        <span class="spell-key">${i + 1}</span>
        <span class="spell-emoji">${s.emoji}</span>
      </div>`;
    }).join('');
    for (const s of spells) {
      this.spellChips[s.id] = el(`spell-${s.id}`);
      this._spellMax[s.id] = s.cooldown || 1;
    }
  }

  // Hebt den aktiven Spruch hervor und zeichnet den Cooldown-Sweep
  setSpell(activeId, cooldowns) {
    for (const id in this.spellChips) {
      const chip = this.spellChips[id];
      chip.classList.toggle('active', id === activeId);
      const cd = cooldowns ? cooldowns[id] : 0;
      const frac = Math.max(0, Math.min(1, cd / (this._spellMax[id] || 1)));
      chip.style.setProperty('--cd', frac.toFixed(3));
    }
  }

  // Pfeil zeigt relativ zur Blickrichtung auf den nächsten Schnatz
  setTracker(info, heading) {
    if (!info) { this.tracker.style.display = 'none'; return; }
    this.tracker.style.display = 'flex';
    const rel = info.angle - heading;
    this.trackerArrow.style.transform = `rotate(${rel - Math.PI / 2}rad)`;
    this.trackerDist.textContent = `${Math.round(info.dist)} m`;
  }

  setClock(text) { this.clock.textContent = text; }

  setHeading(rad) {
    const idx = Math.round(rad / (Math.PI / 4)) % 8;
    this.compass.textContent = SECTORS[idx];
  }

  toggleFps() {
    this._fpsVisible = !this._fpsVisible;
    this.fps.style.display = this._fpsVisible ? 'block' : 'none';
    return this._fpsVisible;
  }

  setFps(fps, pixelRatio) {
    if (this._fpsVisible) {
      this.fps.textContent = `${fps.toFixed(0)} FPS · Auflösung ×${pixelRatio.toFixed(2)}`;
    }
  }

  showHint(text) {
    this.hint.textContent = text;
    this.hint.classList.add('visible');
  }

  hideHint() { this.hint.classList.remove('visible'); }

  showToast(text, seconds = 3.2) {
    this.toast.innerHTML = text;
    this.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('visible'), seconds * 1000);
  }
}
