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

  // Incendio-Cast: anschwellendes Lowpass-Rauschen + kurzes Knistern obendrauf
  castIncendio() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.6);

    for (let i = 0; i < 5; i++) {
      const t0 = t + Math.random() * 0.4;
      const crackle = ctx.createBufferSource();
      crackle.buffer = this.noiseBuf;
      const cf = ctx.createBiquadFilter();
      cf.type = 'highpass';
      cf.frequency.value = 2500;
      const cg = ctx.createGain();
      this._env(cg, t0, 0.002, 0.05 + Math.random() * 0.05, 0.03);
      crackle.connect(cf).connect(cg).connect(this.master);
      crackle.start(t0, Math.random() * 1.5, 0.05);
    }
  }

  // Leviosa halten: leiser Sinus-Chor mit Vibrato, läuft bis release(false)
  leviosaHold(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on) {
      if (this._leviosaNodes) return;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      const oscs = [400, 500, 600].map((freq) => {
        const o = ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = freq;
        const og = ctx.createGain();
        og.gain.value = 0.06;
        o.connect(og).connect(g);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5 + Math.random();
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 4; // ±4 Hz Vibrato
        lfo.connect(lfoGain).connect(o.frequency);
        o.start(); lfo.start();
        return { o, lfo };
      });
      g.gain.setTargetAtTime(0.5, t, 0.15);
      this._leviosaNodes = { gain: g, oscs };
    } else if (this._leviosaNodes) {
      const { gain, oscs } = this._leviosaNodes;
      gain.gain.setTargetAtTime(0, t, 0.15);
      setTimeout(() => { for (const { o, lfo } of oscs) { o.stop(); lfo.stop(); } }, 400);
      this._leviosaNodes = null;
    }
  }

  // Lumos an/aus: heller bzw. dunkler Ping
  lumosToggle(on) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = on ? 1320 : 660;
    const g = ctx.createGain();
    this._env(g, t, 0.005, 0.12, 0.15);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.25);
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

  // Lied der Steine: Dreieck-Osc, Pentatonik d4-f4-g4-a4 (ein Ton je Stein)
  runeTone(index) {
    if (!this.ctx || this.muted) return;
    const freqs = [293.66, 349.23, 392.0, 440.0];
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freqs[index] ?? freqs[0];
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.18, 0.35);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.4);
  }

  // Falsche Simon-Says-Folge: tiefer Brummton
  simonFail() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.22, 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  // Sternbild: Stern rastet ein — aufsteigender Glockenton
  starLock() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.35);
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.15, 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.5);
  }

  // Feuerwerk: tiefer Abschuss-Noise, nach ~1s Doppelknall + Glitzer-Chimes
  fireworkBang() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 300;
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.18, 0.3);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.35);

    for (const d of [1.0, 1.08]) {
      const t0 = t + d;
      const bsrc = ctx.createBufferSource();
      bsrc.buffer = this.noiseBuf;
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass'; bf.frequency.value = 700; bf.Q.value = 1.2;
      const bg = ctx.createGain();
      this._env(bg, t0, 0.005, 0.28, 0.25);
      bsrc.connect(bf).connect(bg).connect(this.master);
      bsrc.start(t0, Math.random() * 1.5, 0.3);
    }
    for (let i = 0; i < 6; i++) {
      const t0 = t + 1.1 + Math.random() * 0.6;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 1600 + Math.random() * 1200;
      const g2 = ctx.createGain();
      this._env(g2, t0, 0.005, 0.05, 0.15);
      o.connect(g2).connect(this.master);
      o.start(t0); o.stop(t0 + 0.25);
    }
  }

  // Hauspokal-Finale: volle, mehrstimmige 5-Ton-Hymne (Grundton + Quinte)
  hauspokalFanfare() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((freq, i) => {
      const t0 = t + i * 0.18;
      for (const mul of [1, 1.5]) {
        const o = ctx.createOscillator();
        o.type = i === notes.length - 1 ? 'sawtooth' : 'triangle';
        o.frequency.value = freq * mul;
        const g = ctx.createGain();
        this._env(g, t0, 0.015, mul === 1 ? 0.16 : 0.08, 0.9);
        o.connect(g).connect(this.master);
        o.start(t0); o.stop(t0 + 1.0);
      }
    });
  }

  chime(final = false) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // 'fanfare' = Truhen-Öffnen: aufsteigendes Quinten-Arpeggio (C-G-C-G-C)
    const notes = final === 'fanfare' ? [523, 784, 1046, 1568, 2093]
      : final ? [660, 880, 1100, 1320, 1760] : [880, 1320];
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

  // Druckplatte belegt: tiefer, satter "Klonk"
  puzzleClonk() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    const g = ctx.createGain();
    this._env(g, t, 0.004, 0.3, 0.22);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.3);
  }

  // Stein/Hecke bewegt sich: 1-2s tiefes Rumpeln (gefiltertes Rauschen)
  puzzleRumble(duration = 2) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.15);
    g.gain.setValueAtTime(0.22, t + duration - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration);
  }

  // Wichtel-Kichern: 3-5 schnelle Sinus-Blips in zufälliger Reihenfolge
  pixieGiggle() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const t0 = t + i * (0.06 + Math.random() * 0.03);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 1800 + Math.random() * 800;
      const g = ctx.createGain();
      this._env(g, t0, 0.005, 0.05, 0.05);
      o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.09);
    }
  }

  // Schaden am Spieler: Thud + kurzer Hochpass-Zisch
  hurt() {
    if (!this.ctx || this.muted) return;
    this._thump(140, 0.18);
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 3000;
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.10, 0.08);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.1);
  }

  // Troll wird auf den Spieler aufmerksam: tiefes, kurzes Brüllen
  trollRoar() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(85, t);
    o.frequency.linearRampToValueAtTime(130, t + 0.15);
    o.frequency.linearRampToValueAtTime(70, t + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 500;
    const g = ctx.createGain();
    this._env(g, t, 0.03, 0.3, 0.4);
    o.connect(f).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.75);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 350; nf.Q.value = 0.8;
    const ng = ctx.createGain();
    this._env(ng, t, 0.03, 0.18, 0.35);
    src.connect(nf).connect(ng).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.5);
  }

  // Keulenschlag auf den Boden: dumpfer, tiefer Einschlag + Rumpeln
  trollSlam() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.3);
    const g = ctx.createGain();
    this._env(g, t, 0.003, 0.5, 0.35);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.4);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 220;
    const ng = ctx.createGain();
    this._env(ng, t, 0.004, 0.32, 0.3);
    src.connect(f).connect(ng).connect(this.master);
    src.start(t, Math.random() * 1.5, 0.35);
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

  // Schatten-Drone: EIN globales Node-Set (nicht pro Geist!), Gain je nach
  // Nähe des nächsten Geists von außen gesetzt (0..1).
  _ensureGhostDrone() {
    if (this.ghostDroneGain || !this.ctx) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);

    const o1 = ctx.createOscillator();
    o1.type = 'sine'; o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'sine'; o2.frequency.value = 57;
    const mix = ctx.createGain();
    mix.gain.value = 0.6;
    o1.connect(mix); o2.connect(mix);

    // langsames Tremolo
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    lfo.connect(lfoGain).connect(mix.gain);

    mix.connect(out);
    o1.start(); o2.start(); lfo.start();
    this.ghostDroneGain = out;
  }

  setGhostDrone(proximity) {
    if (!this.ctx) return;
    this._ensureGhostDrone();
    if (this.ghostDroneGain) {
      const target = Math.max(0, Math.min(1, proximity)) * 0.3;
      this.ghostDroneGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }
  }

  // Dementor-Atem: EIN globales Node-Set (Muster: Schatten-Drone), tiefes
  // Bandpass-Rauschen mit langsamem Rassel-An-/Abschwellen, Gain je nach
  // Nähe des nächsten Dementors von außen gesetzt (0..1).
  _ensureDementorBreath() {
    if (this.dementorBreathGain || !this.ctx) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 180;
    f.Q.value = 1.2;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.4; // rasselndes Ein-/Ausatmen
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(breathGain.gain);

    src.connect(f).connect(breathGain).connect(out);
    src.start(); lfo.start();
    this.dementorBreathGain = out;
  }

  setDementorBreath(proximity) {
    if (!this.ctx) return;
    this._ensureDementorBreath();
    if (this.dementorBreathGain) {
      const target = Math.max(0, Math.min(1, proximity)) * 0.35;
      this.dementorBreathGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }
  }

  // Zauber verpufft wirkungslos an einem immunen Ziel: kraftloser, leiser Plopp
  spellFizzle() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    const g = ctx.createGain();
    this._env(g, t, 0.004, 0.08, 0.13);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.2);
  }

  // Expecto Patronum: aufsteigender heller Dreiklang + Hochpass-Schimmer
  patronusCast() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [784, 1046, 1568].forEach((freq, i) => {
      const t0 = t + i * 0.15;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const g = ctx.createGain();
      this._env(g, t0, 0.01, 0.16, 0.5);
      o.connect(g).connect(this.master);
      o.start(t0); o.stop(t0 + 0.6);
    });
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 4000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, 1.2);
  }

  // Dementor wird vom Patronus vertrieben: tiefer Glockenton, aufsteigend
  dementorRepel() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    const g = ctx.createGain();
    this._env(g, t, 0.008, 0.16, 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.45);
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
