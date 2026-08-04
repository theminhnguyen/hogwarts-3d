// Post-FX „Schön": handgerollter Mini-Composer ohne three.js-Addons —
// Bloom (Brightpass → Downsample → 2× Gauß-Blur) + Farb-Feinschliff
// (Sättigung, sanfte S-Kurve, nächtliche Blauverschiebung in den Schatten)
// + FXAA. „Schnell" bleibt der bisherige direkte renderer.render()-Aufruf,
// exakt null Overhead.
//
// WICHTIG: Alle Fullscreen-Quad-Materialien setzen toneMapped:false — der
// Haupt-Szene-Durchlauf in RT_scene bekommt bereits das eine, gewollte
// ACESFilmic-Tonemapping (renderer.toneMapping bleibt global gesetzt);
// würden meine eigenen Shader das nochmal durchlaufen, wäscht das Bild aus.

import * as THREE from 'three';

const QUAD_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tScene, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float f = smoothstep(uThreshold, uThreshold + 0.25, l);
    gl_FragColor = vec4(c * f, 1.0);
  }
`;

// 9-Tap-Gauß (Kernel-Radius 4), eine Richtung pro Durchlauf (H dann V)
const BLUR_FRAG = /* glsl */`
  uniform sampler2D tInput;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    float w0 = 0.227027, w1 = 0.1945946, w2 = 0.1216216, w3 = 0.054054, w4 = 0.016216;
    vec3 sum = texture2D(tInput, vUv).rgb * w0;
    sum += texture2D(tInput, vUv + uDir * 1.0).rgb * w1;
    sum += texture2D(tInput, vUv - uDir * 1.0).rgb * w1;
    sum += texture2D(tInput, vUv + uDir * 2.0).rgb * w2;
    sum += texture2D(tInput, vUv - uDir * 2.0).rgb * w2;
    sum += texture2D(tInput, vUv + uDir * 3.0).rgb * w3;
    sum += texture2D(tInput, vUv - uDir * 3.0).rgb * w3;
    sum += texture2D(tInput, vUv + uDir * 4.0).rgb * w4;
    sum += texture2D(tInput, vUv - uDir * 4.0).rgb * w4;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// ---------- SSAO (G3, „Episch") ----------
// Umgebungsverdeckung: Ecken, Kanten und Berührungspunkte werden abgedunkelt.
// Das ist der stärkste „Grounding"-Effekt überhaupt — ohne ihn wirken Objekte
// wie auf den Boden geklebt statt daraufstehend.
//
// Die Tiefe kommt aus der depthTexture des Szenen-Render-Targets, es braucht
// also KEINEN zusätzlichen Geometrie-Durchlauf (ein separater Depth-Prepass
// würde die gesamte Szene ein zweites Mal zeichnen).
// Normalen werden aus den Ableitungen der rekonstruierten View-Position
// gewonnen — bei der durchweg flach schattierten Low-Poly-Geometrie hier ist
// das sogar exakt, und es spart einen Normal-Buffer.
const SSAO_FRAG = /* glsl */`
  uniform sampler2D tDepth;
  uniform mat4 uProj;
  uniform mat4 uInvProj;
  uniform vec2 uRes;
  uniform float uRadius;
  uniform float uBias;
  uniform vec3 uKernel[8];
  varying vec2 vUv;

  vec3 viewPosAt(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 v = uInvProj * clip;
    return v.xyz / v.w;
  }

  float hash(vec2 c) { return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    float d = texture2D(tDepth, vUv).x;
    // Himmel (Tiefe am fernen Rand): niemals verdecken, sonst bekäme die
    // Silhouette jedes Gebäudes einen dunklen Saum gegen den Himmel.
    if (d >= 0.9999) { gl_FragColor = vec4(1.0); return; }

    vec3 P = viewPosAt(vUv);
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));

    // Zufällige Drehung pro Pixel bricht das Kernel-Muster auf; das dadurch
    // entstehende Rauschen holt der anschliessende Weichzeichner wieder raus.
    float a = hash(vUv * uRes) * 6.2831853;
    float ca = cos(a), sa = sin(a);

    float occ = 0.0;
    for (int i = 0; i < 8; i++) {
      vec3 k = uKernel[i];
      vec3 kr = vec3(k.x * ca - k.y * sa, k.x * sa + k.y * ca, k.z);
      // In die Hemisphäre der Oberflächennormale klappen
      if (dot(kr, N) < 0.0) kr = -kr;

      vec3 S = P + kr * uRadius;
      vec4 sc = uProj * vec4(S, 1.0);
      vec2 sUv = (sc.xy / sc.w) * 0.5 + 0.5;
      if (sUv.x < 0.0 || sUv.x > 1.0 || sUv.y < 0.0 || sUv.y > 1.0) continue;

      vec3 SP = viewPosAt(sUv);
      // Blickrichtung ist -Z: ein GRÖSSERES z heisst näher an der Kamera.
      // Liegt die echte Oberfläche vor dem Abtastpunkt, verdeckt sie ihn.
      float rangeCheck = smoothstep(0.0, 1.0, uRadius / max(0.0001, abs(P.z - SP.z)));
      if (SP.z >= S.z + uBias) occ += rangeCheck;
    }
    gl_FragColor = vec4(clamp(1.0 - occ / 8.0, 0.0, 1.0));
  }
`;

// 4x4-Kastenweichzeichner über das AO-Bild — entfernt das Rauschen aus der
// zufälligen Kernel-Drehung. Genau so gross wie das Rauschmuster.
const AOBLUR_FRAG = /* glsl */`
  uniform sampler2D tAO;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    float s = 0.0;
    for (int x = -2; x <= 1; x++) {
      for (int y = -2; y <= 1; y++) {
        s += texture2D(tAO, vUv + vec2(float(x), float(y)) * uTexel).r;
      }
    }
    gl_FragColor = vec4(s / 16.0);
  }
`;

// ---------- Godrays / Lichtschächte (G4, „Episch") ----------
// Radiale Streuung von der Sonnenposition aus: entlang der Verbindungslinie
// Pixel→Sonne wird abgetastet und aufsummiert, aber NUR Himmelspixel tragen
// bei. Dadurch wirft jede Geometrie zwischen Auge und Sonne einen echten
// Schatten IN die Strahlen — genau der Effekt, der Sonnenstrahlen zwischen
// Türmen und Bäumen erzeugt.
// Die Himmelserkennung nutzt wieder die Tiefentextur (wie SSAO), es braucht
// also keine separate Maske.
const GODRAY_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform vec2 uSun;
  varying vec2 vUv;
  void main() {
    vec2 delta = (vUv - uSun) / 16.0 * 0.9;
    vec2 uv = vUv;
    float w = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      uv -= delta;
      // step(): 1.0 nur am fernen Tiefenrand = Himmel. Alles davor blockt.
      float sky = step(0.9999, texture2D(tDepth, uv).x);
      acc += texture2D(tScene, uv).rgb * sky * w;
      w *= 0.933; // Abklingen: 0.955^(24/16), damit die Strahllaenge trotz
                  // weniger Schritte gleich bleibt
    }
    gl_FragColor = vec4(acc / 16.0, 1.0);
  }
`;

const COMBINE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tGod;
  uniform float uGodStrength;
  uniform sampler2D tAO;
  uniform float uBloomStrength;
  uniform float uAOStrength;
  uniform float uSaturation;
  uniform float uNight;
  varying vec2 vUv;
  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    // AO wird VOR dem Bloom angewandt: verdeckte Stellen sollen auch weniger
    // ins Leuchten beitragen. uAOStrength ist ausserhalb von „Episch" 0, der
    // Ausdruck fällt dann exakt auf 1.0 zurück (kein Unterschied zu vorher).
    float ao = mix(1.0, texture2D(tAO, vUv).r, uAOStrength);
    scene *= ao;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    // Godrays additiv obendrauf — Streulicht in der Luft, das von nichts
    // verdeckt wird (deshalb NACH der AO-Multiplikation).
    vec3 god = texture2D(tGod, vUv).rgb * uGodStrength;
    vec3 col = scene + bloom * uBloomStrength + god;
    // Leichte S-Kurve (nur zu einem Viertel eingeblendet) — die volle
    // Smoothstep-Kurve crusht dunkle Nachtszenen fast auf Schwarz, siehe
    // Testbefund: eine Vollkurve ist für "leichte" Kontrastanhebung viel
    // zu aggressiv, vor allem bei geringer Ausgangshelligkeit.
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.25);
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(l), col, uSaturation);
    col = mix(col, col * vec3(0.94, 0.97, 1.05), uNight * (1.0 - l) * 0.5);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Kompakte FXAA-Variante (Standard-Algorithmus: Luma-Kantenerkennung +
// Blend entlang der lokalen Kontrastrichtung) — nötig, weil das Rendern in
// eigene Render-Targets das native MSAA des Renderers (antialias:true gilt
// nur fürs Default-Framebuffer) umgeht.
const FXAA_FRAG = /* glsl */`
  uniform sampler2D tInput;
  uniform vec2 uTexel;
  uniform float uCA;        // G4: Stärke der chromatischen Aberration
  uniform float uVignette;  // G4: Stärke der Randabdunklung
  varying vec2 vUv;

  // Rendern in eigene Render-Targets überspringt renderer.outputColorSpace
  // (das gilt nur für den Weg direkt zum Bildschirm-Framebuffer) — RT_scene
  // enthält dadurch unkodierte Linear-Werte. Da dieser Pass der letzte vor
  // dem Bildschirm ist, holt er die fehlende sRGB-Kodierung hier manuell
  // nach (Standard-sRGB-Transferfunktion), sonst wirkt das ganze Bild in
  // "Schön" viel zu dunkel gegenüber dem direkten "Schnell"-Renderpfad.
  vec3 linearToSRGB(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.4)) - 0.055;
    return mix(lo, hi, step(vec3(0.0031308), c));
  }

  void main() {
    vec3 rgbNW = texture2D(tInput, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
    vec3 rgbNE = texture2D(tInput, vUv + vec2( 1.0, -1.0) * uTexel).rgb;
    vec3 rgbSW = texture2D(tInput, vUv + vec2(-1.0,  1.0) * uTexel).rgb;
    vec3 rgbSE = texture2D(tInput, vUv + vec2( 1.0,  1.0) * uTexel).rgb;
    vec3 rgbM  = texture2D(tInput, vUv).rgb;

    vec3 lw = vec3(0.299, 0.587, 0.114);
    float lNW = dot(rgbNW, lw), lNE = dot(rgbNE, lw);
    float lSW = dot(rgbSW, lw), lSE = dot(rgbSE, lw);
    float lM  = dot(rgbM,  lw);

    float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
    float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));

    vec2 dir;
    dir.x = -((lNW + lNE) - (lSW + lSE));
    dir.y =  ((lNW + lSW) - (lNE + lSE));

    float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = clamp(dir * rcpDirMin, -8.0, 8.0) * uTexel;

    vec3 rgbA = 0.5 * (
      texture2D(tInput, vUv + dir * (1.0 / 3.0 - 0.5)).rgb +
      texture2D(tInput, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
      texture2D(tInput, vUv + dir * -0.5).rgb +
      texture2D(tInput, vUv + dir *  0.5).rgb);

    float lB = dot(rgbB, lw);
    vec3 result = (lB < lMin || lB > lMax) ? rgbA : rgbB;

    // G4 Kino-Grading (nur „Episch"; uCA und uVignette sind sonst 0 und der
    // Block bleibt dann wirkungslos). Sitzt hier im LETZTEN Pass,
    // weil beides auf dem fertigen Bild wirken muss — vor dem FXAA angewandt
    // würde die Kantenglättung die Farbsäume wieder verschmieren.
    vec2 off = vUv - 0.5;
    float r2 = dot(off, off);
    // Chromatische Aberration: zum Bildrand hin zunehmender Farbversatz, wie
    // ihn ein echtes Objektiv erzeugt. In der Mitte exakt null.
    vec2 caOff = off * r2 * uCA;
    float cr = texture2D(tInput, vUv - caOff).r;
    float cb = texture2D(tInput, vUv + caOff).b;
    result = vec3(mix(result.r, cr, 0.85), result.g, mix(result.b, cb, 0.85));
    // Vignette: Randabdunklung, lenkt den Blick zur Bildmitte. Breiter
    // Übergang (0.95 -> 0.35), damit sie als Stimmung wirkt und nicht als
    // sichtbarer dunkler Ring.
    float vig = smoothstep(0.95, 0.35, length(off));
    result *= mix(1.0, vig, uVignette);

    gl_FragColor = vec4(linearToSRGB(result), 1.0);
  }
`;

function makeQuadMaterial(fragmentShader, uniforms) {
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VERT, fragmentShader,
    toneMapped: false, depthTest: false, depthWrite: false,
  });
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = 'schoen';
    this.degraded = false;
    this.onDegrade = null; // main.js hängt hier den einmaligen Toast-Callback ein
    this._degradeToastShown = false;

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene = new THREE.Scene();
    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    this.quadScene.add(this.quadMesh);

    this.matBright = makeQuadMaterial(BRIGHT_FRAG, { tScene: { value: null }, uThreshold: { value: 0.75 } });
    this.matBlurH = makeQuadMaterial(BLUR_FRAG, { tInput: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.matBlurV = makeQuadMaterial(BLUR_FRAG, { tInput: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.matCombine = makeQuadMaterial(COMBINE_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, tGod: { value: null },
      uBloomStrength: { value: 0.35 }, uAOStrength: { value: 0 }, uGodStrength: { value: 0 },
      uSaturation: { value: 1.08 }, uNight: { value: 0 },
    });
    this.matFxaa = makeQuadMaterial(FXAA_FRAG, {
      tInput: { value: null }, uTexel: { value: new THREE.Vector2() },
      uCA: { value: 0 }, uVignette: { value: 0 },
    });
    this.matGod = makeQuadMaterial(GODRAY_FRAG, {
      tScene: { value: null }, tDepth: { value: null },
      uSun: { value: new THREE.Vector2(0.5, 0.5) },
    });
    // Wiederverwendete Vektoren für die Sonnen-Projektion (kein Allokieren pro Frame)
    this._sunWorld = new THREE.Vector3();
    this._sunNdc = new THREE.Vector3();

    // G3: Abtastkern für SSAO. Punkte liegen dichter an der Mitte (quadratische
    // Gewichtung) — nahe Geometrie soll stärker zählen als entfernte, sonst
    // wirkt die Verschattung diffus statt als Kontaktschatten.
    const kernel = [];
    for (let i = 0; i < 8; i++) {
      const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
      v.normalize().multiplyScalar(0.3 + 0.7 * ((i + 1) / 8) ** 2);
      kernel.push(v);
    }
    this.matSSAO = makeQuadMaterial(SSAO_FRAG, {
      tDepth: { value: null },
      uProj: { value: new THREE.Matrix4() },
      uInvProj: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2() },
      uRadius: { value: 1.6 },   // Meter im View-Space
      uBias: { value: 0.035 },   // gegen Selbstverschattung auf ebenen Flächen
      uKernel: { value: kernel },
    });
    this.matAOBlur = makeQuadMaterial(AOBLUR_FRAG, {
      tAO: { value: null }, uTexel: { value: new THREE.Vector2() },
    });

    this._allocate();
  }

  _disposeRT(rt) { rt?.dispose(); }

  // RT-Größen folgen der tatsächlichen Drawing-Buffer-Größe (Pixelverhältnis
  // inklusive) — muss bei Resize UND bei jeder pixelRatio-Änderung der
  // Auto-Qualitätsanpassung neu laufen, sonst verzerrt/verpixelt der Bloom.
  _allocate() {
    const size = new THREE.Vector2();
    this.renderer.getDrawingBufferSize(size);
    const w = Math.max(1, Math.floor(size.x)), h = Math.max(1, Math.floor(size.y));
    const bw = Math.max(1, Math.floor(w / 4)), bh = Math.max(1, Math.floor(h / 4));

    // G3: AO läuft auf halber Auflösung. Umgebungsverdeckung ist von Natur aus
    // niederfrequent — bei voller Auflösung kostet sie doppelt so viel, ohne
    // sichtbar besser zu werden.
    const aw = Math.max(1, Math.floor(w / 2)), ah = Math.max(1, Math.floor(h / 2));

    this._disposeRT(this.rtScene); this._disposeRT(this.rtBright);
    this._disposeRT(this.rtBlurA); this._disposeRT(this.rtBlurB); this._disposeRT(this.rtFinal);
    this._disposeRT(this.rtAO); this._disposeRT(this.rtAOBlur); this._disposeRT(this.rtGod);
    this.rtScene?.depthTexture?.dispose();

    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
    // Tiefe direkt am Szenen-Target mitschreiben lassen — dadurch braucht SSAO
    // keinen eigenen Geometrie-Durchlauf. NearestFilter, weil Tiefenwerte
    // Messwerte sind: interpoliert man sie, entstehen an Silhouetten Werte,
    // die zu gar keiner echten Oberfläche gehören.
    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.type = THREE.UnsignedIntType;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;
    this.rtScene.depthTexture = depthTex;

    this.rtBright = new THREE.WebGLRenderTarget(bw, bh, opts);
    this.rtBlurA = new THREE.WebGLRenderTarget(bw, bh, opts);
    this.rtBlurB = new THREE.WebGLRenderTarget(bw, bh, opts);
    this.rtFinal = new THREE.WebGLRenderTarget(w, h, opts);
    this.rtAO = new THREE.WebGLRenderTarget(aw, ah, opts);
    this.rtAOBlur = new THREE.WebGLRenderTarget(aw, ah, opts);
    // Godrays auf Bloom-Auflösung (Viertel) — Lichtschächte sind weiche,
    // grossflächige Gebilde, feine Auflösung bringt dort nichts.
    this.rtGod = new THREE.WebGLRenderTarget(bw, bh, opts);

    this.matBlurH.uniforms.uDir.value.set(1 / bw, 0);
    this.matBlurV.uniforms.uDir.value.set(0, 1 / bh);
    this.matFxaa.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.matSSAO.uniforms.tDepth.value = depthTex;
    this.matSSAO.uniforms.uRes.value.set(aw, ah);
    this.matGod.uniforms.tDepth.value = depthTex;
    this.matGod.uniforms.tScene.value = this.rtScene.texture;
    this.matCombine.uniforms.tGod.value = this.rtGod.texture;
    this.matAOBlur.uniforms.uTexel.value.set(1 / aw, 1 / ah);
    this.matCombine.uniforms.tBloom.value = this.rtBlurB.texture; // gültig auch bei ausgeschaltetem Bloom (Strength=0 nullt den Beitrag)
    // Dasselbe Muster für AO: Textur immer gesetzt, uAOStrength=0 schaltet ab.
    // Ein null-Sampler würde in three eine Warnung erzeugen.
    this.matCombine.uniforms.tAO.value = this.rtAOBlur.texture;
  }

  resize() { this._allocate(); }
  setQuality(q) { this.quality = q; }

  _pass(mat, target) {
    this.quadMesh.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  // sunDir (optional, G4): Weltrichtung ZUR Sonne. Wird auf den Bildschirm
  // projiziert, um den Ursprung der Lichtschächte zu bestimmen. Fehlt sie,
  // bleiben Godrays einfach aus.
  render(nightGlow, fpsEMA, sunDir = null) {
    // Nur 'schnell' rendert direkt ohne jeden Pass. 'schoen' UND 'episch'
    // durchlaufen den Composer — vor der Episch-Stufe stand hier
    // `!== 'schoen'`, was jede künftige Stufe stillschweigend auf den
    // Direktpfad geworfen hätte (Post-FX wären in 'episch' komplett aus
    // gewesen, obwohl die Stufe ausdrücklich MEHR Effekte bedeutet).
    if (this.quality === 'schnell') {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Auto-Degradation mit Hysterese (Muster: pixelRatio-Anpassung in main.js)
    if (fpsEMA < 42) {
      if (!this.degraded) {
        this.degraded = true;
        if (!this._degradeToastShown) { this._degradeToastShown = true; this.onDegrade?.(); }
      }
    } else if (fpsEMA > 52) {
      this.degraded = false;
    }
    if (this.degraded) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const bloomOn = fpsEMA >= 50;
    // Beide tiefenbasierten Effekte (SSAO, Godrays) rechnen mit der Projektions-
    // matrix. Ist das Fenster gerade 0 Pixel breit (minimiert, versteckter Tab,
    // Resize-Rennen), wird camera.aspect zu 0/0 = NaN und die Matrix damit
    // unbrauchbar — die Shader würden dann Müll abtasten. In dem Fall lieber
    // ganz überspringen als ein kaputtes Bild zeigen.
    const projOk = Number.isFinite(this.camera.projectionMatrix.elements[0]);
    // AO nur in 'episch' und nur solange Luft ist — es ist der teuerste Pass
    // im Stack (12 Abtastungen plus Weichzeichner). Fällt vor dem Bloom weg,
    // weil es mehr kostet.
    const aoOn = this.quality === 'episch' && fpsEMA >= 52 && projOk;

    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.render(this.scene, this.camera);

    if (aoOn) {
      // Kameramatrizen jeden Frame nachziehen — projectionMatrixInverse hält
      // three selbst aktuell, muss aber hier hineingereicht werden, weil der
      // Quad-Pass mit einer eigenen Ortho-Kamera rendert.
      this.matSSAO.uniforms.uProj.value.copy(this.camera.projectionMatrix);
      this.matSSAO.uniforms.uInvProj.value.copy(this.camera.projectionMatrixInverse);
      this._pass(this.matSSAO, this.rtAO);
      this.matAOBlur.uniforms.tAO.value = this.rtAO.texture;
      this._pass(this.matAOBlur, this.rtAOBlur);
    }
    this.matCombine.uniforms.uAOStrength.value = aoOn ? 1 : 0;

    // ---------- Godrays ----------
    let godStrength = 0;
    if (this.quality === 'episch' && sunDir && fpsEMA >= 50 && projOk) {
      // Punkt weit in Sonnenrichtung auf den Bildschirm projizieren.
      this._sunWorld.copy(this.camera.position).addScaledVector(sunDir, 1000);
      this._sunNdc.copy(this._sunWorld).project(this.camera);
      // z > 1 heisst hinter der Kamera — dann gäbe es einen gespiegelten
      // Geisterstrahl auf der falschen Bildseite.
      if (this._sunNdc.z < 1) {
        const sx = this._sunNdc.x * 0.5 + 0.5, sy = this._sunNdc.y * 0.5 + 0.5;
        this.matGod.uniforms.uSun.value.set(sx, sy);
        // Ausblenden, je weiter die Sonne aus der Bildmitte wandert, sonst
        // würde sie beim Wegdrehen hart abreissen. Zusätzlich mit der
        // Tageshelligkeit koppeln — nachts gibt es keine Sonnenstrahlen.
        const dx = sx - 0.5, dy = sy - 0.5;
        const edge = 1 - Math.min(1, Math.hypot(dx, dy) / 0.85);
        godStrength = 0.6 * edge * Math.max(0, 1 - nightGlow * 1.6);
      }
      if (godStrength > 0.001) this._pass(this.matGod, this.rtGod);
    }
    this.matCombine.uniforms.uGodStrength.value = godStrength;

    // Kino-Grading nur in 'episch' (sonst exakt 0 = kein Unterschied).
    // uCA-Grössenordnung nachgerechnet statt geschätzt: der Versatz ist
    // |off| * r2 * uCA, am Bildrand also ~0.707 * 0.5 * uCA = 0.354 * uCA in
    // UV-Einheiten. Für die angepeilten ~2 Pixel auf 1280 Breite (2/1280 =
    // 0.00156 UV) folgt uCA ≈ 0.0044. Der erste Versuch mit 0.9 ergab 0.32 UV
    // = ein Drittel der Bildbreite — im Screenshot lag ein Regenbogenrand über
    // der halben Szene. Echte Objektiv-Aberration ist kaum wahrnehmbar.
    const cine = this.quality === 'episch';
    this.matFxaa.uniforms.uCA.value = cine ? 0.005 : 0;
    this.matFxaa.uniforms.uVignette.value = cine ? 0.32 : 0;

    if (bloomOn) {
      this.matBright.uniforms.tScene.value = this.rtScene.texture;
      this._pass(this.matBright, this.rtBright);
      this.matBlurH.uniforms.tInput.value = this.rtBright.texture;
      this._pass(this.matBlurH, this.rtBlurA);
      this.matBlurV.uniforms.tInput.value = this.rtBlurA.texture;
      this._pass(this.matBlurV, this.rtBlurB);
    }

    this.matCombine.uniforms.tScene.value = this.rtScene.texture;
    this.matCombine.uniforms.uBloomStrength.value = bloomOn ? 0.35 : 0;
    this.matCombine.uniforms.uNight.value = nightGlow;
    this._pass(this.matCombine, this.rtFinal);

    this.matFxaa.uniforms.tInput.value = this.rtFinal.texture;
    this._pass(this.matFxaa, null);
  }
}
