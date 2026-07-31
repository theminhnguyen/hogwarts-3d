// Umgebungslicht (IBL) für die Grafikstufe „Episch" (Nutzerwunsch 2026-07-31).
//
// Warum das nötig ist: MeshStandardMaterial ist ein PBR-Material und erwartet
// eine Umgebung, die es spiegeln kann. Ohne `scene.environment` bekommt es
// seinen Umgebungsanteil ausschliesslich aus dem HemisphereLight — Metall und
// glatte Oberflächen sehen dann STUMPFER aus als vorher mit Lambert. PBR ohne
// IBL ist ein klassischer Rückschritt; deshalb gehören materials.js' Standard-
// Umstellung und diese Datei zwingend zusammen.
//
// Ansatz: statt die echte Szene per PMREMGenerator.fromScene() abzutasten
// (teuer, und wir wollen NUR den Himmel, nicht die Geometrie ringsum), male
// ich eine winzige equirektangulare HDR-Textur (64×32) direkt aus denselben
// Farben, die auch der Himmels-Shader in sky.js benutzt, und lasse three daraus
// die vorgefilterte Spiegel-Map bauen. Dadurch bleibt die Umgebung automatisch
// mit dem Tag/Nacht-Zyklus synchron, ohne dass irgendetwas doppelt gepflegt
// werden muss.

import * as THREE from 'three';

// 64×32 reicht völlig: PMREM verwischt die Eingabe ohnehin stark. Höher
// aufgelöst würde nur die Neuberechnung verteuern, ohne sichtbaren Gewinn.
const W = 64, H = 32;

// Alle 2 s neu berechnen. Der Tag/Nacht-Zyklus dauert 300 s — in 2 s ändert
// sich der Himmel so wenig, dass der Übergang unsichtbar bleibt, während die
// Kosten (~1-2 ms alle 2 s) im Rauschen verschwinden.
const REFRESH_INTERVAL = 2;

export class EnvironmentProbe {
  constructor(renderer, scene) {
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    // FloatType (statt UnsignedByte): die Sonne darf Werte weit über 1.0
    // annehmen. Genau dieser Überschuss erzeugt später die hellen Glanzpunkte
    // auf Stein und Metall — mit 8-bit-Daten wäre bei 1.0 Schluss und die
    // Reflexe blieben matt.
    this.data = new Float32Array(W * H * 4);
    this.tex = new THREE.DataTexture(this.data, W, H, THREE.RGBAFormat, THREE.FloatType);
    this.tex.mapping = THREE.EquirectangularReflectionMapping;

    this.rt = null;
    this._t = REFRESH_INTERVAL; // erste Berechnung sofort beim ersten update()
    this._dir = new THREE.Vector3();
  }

  // dt-getaktet, damit main.js sich um kein Timing kümmern muss.
  update(dt, sky) {
    this._t += dt;
    if (this._t < REFRESH_INTERVAL) return;
    this._t = 0;
    this._render(sky);
  }

  _render(sky) {
    const u = sky.skyUniforms;
    const zen = u.uZenith.value, hor = u.uHorizon.value, sunC = u.uSunColor.value;
    const sunDir = u.uSunDir.value, sunAmt = u.uSunAmount.value;
    const daylight = sky.state.daylight;

    // Bodenanteil: ohne ihn bekämen Objekte von unten gar kein Licht
    // zurückgeworfen und wirkten wie freischwebend ausgeschnitten. Gedämpftes
    // Gras-/Erdbraun, das nachts mit abdunkelt.
    const gl = 0.22 + daylight * 0.78;
    const gr = 0.13 * gl, gg = 0.15 * gl, gb = 0.09 * gl;

    const d = this._dir, data = this.data;
    let i = 0;
    for (let y = 0; y < H; y++) {
      // v=0 ist oben (three.js-Konvention für equirektangulare Texturen)
      const phi = ((y + 0.5) / H) * Math.PI;
      const sy = Math.sin(phi), cy = Math.cos(phi);
      for (let x = 0; x < W; x++) {
        const az = ((x + 0.5) / W) * Math.PI * 2;
        d.set(sy * Math.cos(az), cy, sy * Math.sin(az));

        // Himmelsverlauf — exakt dieselbe Formel wie im Fragment-Shader von
        // sky.js, damit Spiegelung und sichtbarer Himmel zusammenpassen.
        const h = Math.max(d.y, 0);
        const k = Math.pow(h, 0.55);
        let r = hor.r + (zen.r - hor.r) * k;
        let g = hor.g + (zen.g - hor.g) * k;
        let b = hor.b + (zen.b - hor.b) * k;

        if (sunAmt > 0) {
          const s = Math.max(d.x * sunDir.x + d.y * sunDir.y + d.z * sunDir.z, 0);
          const glow = Math.pow(s, 14) * 0.45;
          // Enger, sehr energiereicher Kern zusätzlich zum weichen Glow: das
          // ist die eigentliche Lichtquelle für Glanzpunkte (im sichtbaren
          // Himmel übernimmt das die Sonnenscheibe, die bei 64×32 aber nicht
          // auflösbar wäre — daher hier als breiterer, heller Fleck).
          const core = Math.pow(s, 120) * 6;
          const add = glow + core;
          r += sunC.r * add; g += sunC.g * add; b += sunC.b * add;
        }

        // Unterhalb des Horizonts zum Bodenton überblenden
        if (d.y < 0) {
          const t = Math.min(-d.y * 1.7, 1);
          r += (gr - r) * t; g += (gg - g) * t; b += (gb - b) * t;
        }

        data[i++] = r; data[i++] = g; data[i++] = b; data[i++] = 1;
      }
    }

    this.tex.needsUpdate = true;
    // Das alte Render-Target MUSS freigegeben werden — fromEquirectangular()
    // legt bei jedem Aufruf ein neues an, sonst wächst der GPU-Speicher alle
    // 2 s weiter (klassisches Leck bei periodisch aufgefrischten Env-Maps).
    const old = this.rt;
    this.rt = this.pmrem.fromEquirectangular(this.tex);
    this.scene.environment = this.rt.texture;
    old?.dispose();
  }

  dispose() {
    this.rt?.dispose();
    this.tex.dispose();
    this.pmrem.dispose();
    this.scene.environment = null;
  }
}
