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
    this.gold = el('gold');
    this._goldShown = false;
    this.tameRing = el('tame-ring');
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
    this.lightningFlash = el('lightning-flash');
    this.bossbar = el('bossbar');
    this.bossbarFill = this.bossbar.querySelector('i');
    this.airgauge = el('airgauge');
    this._toastTimer = 0;
    this._hurtTimer = 0;
    this._fpsVisible = false;
    this.interactPrompt = el('interact-prompt');
    this.dialog = el('dialog');
    this.dialogName = el('dialog-name');
    this.dialogText = el('dialog-text');
    this._dialogLines = [];
    this._dialogIdx = 0;
    this._dialogOnClose = null;
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

  // Blitz-Aufhellung im Sturm (weather.js)
  flashLightning() {
    this.lightningFlash.classList.remove('flash');
    void this.lightningFlash.offsetWidth;
    this.lightningFlash.classList.add('flash');
  }

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

  // S10 Tauchen: blaugrüne Trübung + dunklere Ränder (Muster --frost/--frost-dark)
  setUnderwater(frac) { this.vignette.style.setProperty('--underwater', frac.toFixed(3)); }

  // S11 Animagus-Wolf: Nachtsicht hellt die Nacht-Vignette grünlich auf
  // (mix-blend-mode:screen in index.html, siehe --nightvision).
  setNightVision(frac) { this.vignette.style.setProperty('--nightvision', frac.toFixed(3)); }

  // S10 Luftanzeige — nur sichtbar, solange geschwommen wird (main.js steuert
  // das via player.swimming). frac<0.25 färbt den Balken warnend rot-orange.
  setAirGauge(visible, frac) {
    this.airgauge.classList.toggle('visible', visible);
    if (!visible) return;
    this.airgauge.style.setProperty('--air-fill', frac.toFixed(3));
    this.airgauge.classList.toggle('low', frac < 0.25);
  }

  setCounter(n, total) { this.counter.textContent = `✦ ${n} / ${total}`; }

  setArtifacts(n, total) {
    this.artifacts.textContent = `🏆 ${n} / ${total}`;
    if (!this._artifactsShown && n > 0) { this._artifactsShown = true; this.artifacts.style.display = 'block'; }
  }

  // Dezent: erscheint erst beim ersten Gold (Niffler-Glitzer, S2), bleibt
  // danach dauerhaft sichtbar — wie die Artefakt-Zeile.
  setGold(n) {
    this.gold.textContent = `💰 ${n}`;
    if (!this._goldShown && n > 0) { this._goldShown = true; this.gold.style.display = 'block'; }
  }

  // Zähm-Fortschrittsring (S5): frac null blendet ihn aus.
  setTameRing(frac) {
    if (frac === null) { this.tameRing.classList.remove('visible'); return; }
    this.tameRing.classList.add('visible');
    this.tameRing.style.setProperty('--tame', Math.max(0, Math.min(1, frac)).toFixed(3));
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
      // s.key (S8): feste Tastennummer statt Array-Position — die verbotenen
      // Sprüche liegen immer auf 6/7/8, unabhängig davon, ob Patronum (Slot 5)
      // schon freigeschaltet ist und damit die Positionen verschiebt.
      return `<div class="spell-chip" id="spell-${s.id}" style="--spell-color:${hex}">
        <span class="spell-key">${s.key || i + 1}</span>
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

  showInteractPrompt(text) {
    this.interactPrompt.textContent = text;
    this.interactPrompt.classList.add('visible');
  }

  hideInteractPrompt() { this.interactPrompt.classList.remove('visible'); }

  get dialogOpen() { return this.dialog.classList.contains('visible'); }

  // onClose (optional): feuert, sobald die letzte Zeile weggeklickt wurde —
  // NPC-/Quest-Code hängt hier Folgereaktionen ein, hud.js kennt keine Quests.
  showDialog(name, lines, onClose = null) {
    this._dialogLines = lines;
    this._dialogIdx = 0;
    this._dialogOnClose = onClose;
    this.dialogName.textContent = name;
    this.dialogText.textContent = lines[0];
    this.dialog.classList.add('visible');
  }

  // Von E aufgerufen, solange dialogOpen === true. Blättert weiter oder
  // schließt bei der letzten Zeile.
  advanceDialog() {
    this._dialogIdx++;
    if (this._dialogIdx >= this._dialogLines.length) {
      this.dialog.classList.remove('visible');
      const cb = this._dialogOnClose;
      this._dialogOnClose = null;
      cb?.();
      return;
    }
    this.dialogText.textContent = this._dialogLines[this._dialogIdx];
  }

  showToast(text, seconds = 3.2) {
    this.toast.innerHTML = text;
    this.toast.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('visible'), seconds * 1000);
  }
}
