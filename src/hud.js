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
    this.artifacts = el('artifacts');
    this.puzzleStatus = el('puzzle-status');
    this._artifactsShown = false;
    this.soullights = el('soullights');
    this.lanternIcon = el('lantern-icon');
    this.spellbar = el('spellbar');
    this.spellChips = {};
    this._spellMax = {};
    this.heartsEl = el('hearts');
    this._heartEls = [];
    this._heartsMax = 0;
    this.vignette = el('vignette');
    this.whiteout = el('whiteout');
    this.bossbar = el('bossbar');
    this.bossbarFill = this.bossbar.querySelector('i');
    this._toastTimer = 0;
    this._hurtTimer = 0;
    this._fpsVisible = false;
  }

  setActive(on) { this.hud.classList.toggle('active', on); }

  // Baut die Herz-Reihe neu, wenn sich maxHearts ändert (z.B. Herz-Upgrade)
  setHearts(current, max) {
    if (this._heartsMax !== max) {
      this._heartsMax = max;
      this.heartsEl.innerHTML = Array.from({ length: max },
        () => '<span class="heart"><span class="heart-fill"></span></span>').join('');
      this._heartEls = [...this.heartsEl.querySelectorAll('.heart-fill')];
    }
    this._heartEls.forEach((h, i) => {
      const frac = Math.max(0, Math.min(1, current - i));
      h.style.setProperty('--fill', frac.toFixed(2));
    });
  }

  // Roter Vignette-Blitz bei Schaden
  flashHurt() {
    this.vignette.classList.remove('hurt');
    void this.vignette.offsetWidth; // Reflow erzwingen, damit schnelle Treffer neu animieren
    this.vignette.classList.add('hurt');
    clearTimeout(this._hurtTimer);
    this._hurtTimer = setTimeout(() => this.vignette.classList.remove('hurt'), 340);
  }

  // Weißblende beim Tod (0 = unsichtbar, 1 = voll deckend)
  setWhiteout(frac) { this.whiteout.style.opacity = frac; }

  // Kälte-Aura nahe Schattengeistern (0..1, blauer Rand-Schleier)
  setCold(frac) { this.vignette.style.setProperty('--cold', frac.toFixed(3)); }

  // Trübung/Entsättigung im Nebelmoor (0..1, wächst zum Zentrum hin)
  setMoor(frac) { this.vignette.style.setProperty('--moor', frac.toFixed(3)); }

  // Dementor-Frost-Aura (0..1). Ab 0.7 blendet zusätzlich eine leichte
  // Gesamt-Abdunklung ein (--frost-dark, 0..1 über den Bereich 0.7..1).
  setFrost(frac) {
    this.vignette.style.setProperty('--frost', frac.toFixed(3));
    this.vignette.style.setProperty('--frost-dark', Math.max(0, (frac - 0.7) / 0.3).toFixed(3));
  }

  setCounter(n, total) { this.counter.textContent = `✦ ${n} / ${total}`; }

  setArtifacts(n, total) {
    this.artifacts.textContent = `🏆 ${n} / ${total}`;
    if (!this._artifactsShown && n > 0) { this._artifactsShown = true; this.artifacts.style.display = 'block'; }
  }

  // total=null blendet die Zeile aus (kein Grund, sie gerade zu zeigen)
  setSoulLights(n, total) {
    if (total === null) { this.soullights.style.display = 'none'; return; }
    this.soullights.style.display = 'block';
    this.soullights.textContent = `🏮 ${n} / ${total}`;
  }

  // Ersetzt den Seelenlichter-Zähler dauerhaft durch ein statisches Icon,
  // sobald die Silberne Seelenlaterne geborgen ist.
  showLanternIcon() {
    this.soullights.style.display = 'none';
    this.lanternIcon.style.display = 'block';
  }

  // text=null blendet die Zeile aus (kein aktives Rätsel gerade)
  setPuzzleStatus(text) {
    if (text === null) { this.puzzleStatus.style.display = 'none'; return; }
    this.puzzleStatus.textContent = text;
    this.puzzleStatus.style.display = 'block';
  }

  // frac=null blendet die Bossbar aus (nur während Troll-Aggro sichtbar)
  setBoss(frac) {
    if (frac === null) { this.bossbar.style.display = 'none'; return; }
    this.bossbar.style.display = 'block';
    this.bossbarFill.style.setProperty('--boss-fill', Math.max(0, Math.min(1, frac)).toFixed(3));
  }

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
