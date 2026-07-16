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

const COMBINE_FRAG = /* glsl */`
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uBloomStrength;
  uniform float uSaturation;
  uniform float uNight;
  varying vec2 vUv;
  void main() {
    vec3 scene = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 col = scene + bloom * uBloomStrength;
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
      tScene: { value: null }, tBloom: { value: null },
      uBloomStrength: { value: 0.35 }, uSaturation: { value: 1.08 }, uNight: { value: 0 },
    });
    this.matFxaa = makeQuadMaterial(FXAA_FRAG, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });

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

    this._disposeRT(this.rtScene); this._disposeRT(this.rtBright);
    this._disposeRT(this.rtBlurA); this._disposeRT(this.rtBlurB); this._disposeRT(this.rtFinal);

    const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
    this.rtBright = new THREE.WebGLRenderTarget(bw, bh, opts);
    this.rtBlurA = new THREE.WebGLRenderTarget(bw, bh, opts);
    this.rtBlurB = new THREE.WebGLRenderTarget(bw, bh, opts);
    this.rtFinal = new THREE.WebGLRenderTarget(w, h, opts);

    this.matBlurH.uniforms.uDir.value.set(1 / bw, 0);
    this.matBlurV.uniforms.uDir.value.set(0, 1 / bh);
    this.matFxaa.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.matCombine.uniforms.tBloom.value = this.rtBlurB.texture; // gültig auch bei ausgeschaltetem Bloom (Strength=0 nullt den Beitrag)
  }

  resize() { this._allocate(); }
  setQuality(q) { this.quality = q; }

  _pass(mat, target) {
    this.quadMesh.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(nightGlow, fpsEMA) {
    if (this.quality !== 'schoen') {
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

    this.renderer.setRenderTarget(this.rtScene);
    this.renderer.render(this.scene, this.camera);

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
