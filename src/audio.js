// Prozeduraler Sound über WebAudio: Wind, Schritte, Sprünge, Sammel-Klang,
// Vogelgezwitscher am Tag, Grillen in der Nacht. Keine Audio-Dateien nötig.

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._nextChirp = 0;
  }

  // Muss nach einer Nutzer-Interaktion aufgerufen werden (Browser-Regel)
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    this.master.connect(ctx.destination);

    // Rausch-Puffer (für Wind & Schritte)
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Dauerhafter Wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 320;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();
    // langsames An- und Abschwellen
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.75;
  }

  _env(gainNode, t0, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  step(sprinting) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + Math.random() * 250;
    const g = ctx.createGain();
    this._env(g, t, 0.004, sprinting ? 0.17 : 0.11, 0.07);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.12);
  }

  jump() { this._thump(180, 0.10); }
  land() { this._thump(120, 0.16); }

  _thump(freq, peak) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.005, peak, 0.12);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  // Stupor-Cast: Saw-Osc 220→90 Hz + zackiger Noise-Burst (highpass)
  castStupor() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.16, 0.14);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2200;
    const ng = ctx.createGain();
    this._env(ng, t, 0.003, 0.08, 0.05);
    src.connect(f).connect(ng).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.08);
  }

  // Bolzen-Einschlag: kurzer Bandpass-Noise-Knall, Tonhöhe je Zauber
  spellImpact(spellId = 'stupor') {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const freqMap = { stupor: 900, incendio: 500, leviosa: 700, lumos: 1200 };
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freqMap[spellId] || 800;
    f.Q.value = 2.2;
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.14, 0.10);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.1);
  }

  chime(final = false) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = final ? [660, 880, 1100, 1320, 1760] : [880, 1320];
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const g = ctx.createGain();
      this._env(g, t + i * 0.09, 0.01, 0.14, 0.5);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.6);
    });
  }

  _bird() {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * (0.12 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sine';
      const base = 2000 + Math.random() * 1400;
      o.frequency.setValueAtTime(base, t0);
      o.frequency.exponentialRampToValueAtTime(base * 0.72, t0 + 0.09);
      const g = ctx.createGain();
      this._env(g, t0, 0.01, 0.028, 0.09);
      o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.15);
    }
  }

  _cricket() {
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const t0 = t + i * 0.055;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 4100 + Math.random() * 250;
      const g = ctx.createGain();
      this._env(g, t0, 0.004, 0.012, 0.03);
      o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.05);
    }
  }

  update(daylight) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    if (now > this._nextChirp) {
      if (daylight > 0.6) this._bird();
      else if (daylight < 0.25) this._cricket();
      this._nextChirp = now + 2.5 + Math.random() * 5;
    }
  }
}
