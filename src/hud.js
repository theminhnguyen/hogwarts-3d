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
    this.hint = el('hint');
    this.toast = el('toast');
    this._toastTimer = 0;
    this._fpsVisible = false;
  }

  setActive(on) { this.hud.classList.toggle('active', on); }

  setCounter(n, total) { this.counter.textContent = `✦ ${n} / ${total}`; }

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
