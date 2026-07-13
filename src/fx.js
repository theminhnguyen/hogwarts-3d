// Partikel-Pool (Funken, Einschläge, Explosionen) + Screen-Shake.
// Ein gemeinsamer Points-Mesh mit custom Shader (Größe & Farbe pro Partikel,
// CPU-simuliert wie die Glühwürmchen in props.js), 700 Slots im Ring-Puffer.

import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const MAX_PARTICLES = 700;

// Eigenes Farb-Attribut heißt bewusst NICHT "color": three.js deklariert das
// reservierte "color"-Attribut in ShaderMaterial nur automatisch, wenn
// vertexColors:true gesetzt ist — mit eigenem Namen ist alles explizit und
// unabhängig von dieser internen Sonderbehandlung.
const VERT = /* glsl */`
  attribute float size;
  attribute vec3 pColor;
  varying vec3 vColor;
  uniform float uPixelScale;
  void main() {
    vColor = pColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (uPixelScale / max(-mv.z, 0.001));
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D map;
  varying vec3 vColor;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vColor, 1.0) * tex;
  }
`;

export class FxSystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.glowTex = makeGlowTexture();

    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const sizes = new Float32Array(MAX_PARTICLES);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('pColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    this.uniforms = {
      map: { value: this.glowTex },
      uPixelScale: { value: (renderer.domElement.height || 800) * 0.5 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.geo = geo;
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.gravity = new Float32Array(MAX_PARTICLES);
    this.baseSize = new Float32Array(MAX_PARTICLES);
    this.baseColor = new Float32Array(MAX_PARTICLES * 3);
    this._next = 0;

    this.shakeStrength = 0;
    this._shakeVec = new THREE.Vector3();
    this._zero = new THREE.Vector3();
    this._color = new THREE.Color();
  }

  // Bei Fenstergrößenänderung neu aufrufen (Partikelgröße bleibt bildschirmtreu)
  onResize() {
    this.uniforms.uPixelScale.value = this.renderer.domElement.height * 0.5;
  }

  _alloc() {
    const i = this._next;
    this._next = (this._next + 1) % MAX_PARTICLES;
    return i;
  }

  // Explosion aus `count` Partikeln in alle Richtungen (Einschläge, Kreaturen-Tod)
  burst(pos, colorHex, count = 16, speed = 6, { gravity = -4, life = 0.7, size = 0.5 } = {}) {
    this._color.set(colorHex);
    const posArr = this.geo.attributes.position.array;
    for (let k = 0; k < count; k++) {
      const i = this._alloc();
      const a = Math.random() * Math.PI * 2;
      const el = Math.random() * Math.PI - Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.vel[i * 3 + 0] = Math.cos(a) * Math.cos(el) * s;
      this.vel[i * 3 + 1] = Math.sin(el) * s + speed * 0.3;
      this.vel[i * 3 + 2] = Math.sin(a) * Math.cos(el) * s;
      this.life[i] = this.maxLife[i] = life * (0.7 + Math.random() * 0.6);
      this.gravity[i] = gravity;
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.baseColor[i * 3 + 0] = this._color.r;
      this.baseColor[i * 3 + 1] = this._color.g;
      this.baseColor[i * 3 + 2] = this._color.b;
      posArr[i * 3 + 0] = pos.x;
      posArr[i * 3 + 1] = pos.y;
      posArr[i * 3 + 2] = pos.z;
    }
  }

  // Ein einzelner kurzlebiger Funke (Bolzen-Schweif, Leviosa-Glitzer)
  trail(pos, colorHex) {
    this._color.set(colorHex);
    const i = this._alloc();
    this.vel[i * 3 + 0] = (Math.random() - 0.5) * 0.6;
    this.vel[i * 3 + 1] = (Math.random() - 0.5) * 0.6;
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    this.life[i] = this.maxLife[i] = 0.18 + Math.random() * 0.08;
    this.gravity[i] = -1;
    this.baseSize[i] = 0.16 + Math.random() * 0.08;
    this.baseColor[i * 3 + 0] = this._color.r;
    this.baseColor[i * 3 + 1] = this._color.g;
    this.baseColor[i * 3 + 2] = this._color.b;
    const posArr = this.geo.attributes.position.array;
    posArr[i * 3 + 0] = pos.x;
    posArr[i * 3 + 1] = pos.y;
    posArr[i * 3 + 2] = pos.z;
  }

  // Feuerwerksrakete + Explosion (Finale). pos bleibt fix, Rakete steigt von
  // dort auf; nach `rise` Sekunden knallt sie in `colorHex`.
  firework(pos, colorHex = 0xffffff) {
    this._fireworks = this._fireworks || [];
    this._fireworks.push({ pos: pos.clone(), color: colorHex, t: 0, rise: 1.0 + Math.random() * 0.3, exploded: false });
  }

  _updateFireworks(dt) {
    if (!this._fireworks) return;
    for (let i = this._fireworks.length - 1; i >= 0; i--) {
      const fw = this._fireworks[i];
      fw.t += dt;
      if (!fw.exploded) {
        if (Math.random() < 0.6) {
          this.trail({ x: fw.pos.x, y: fw.pos.y + fw.t * 22, z: fw.pos.z }, 0xfff2c0);
        }
        if (fw.t >= fw.rise) {
          fw.exploded = true;
          this.burst({ x: fw.pos.x, y: fw.pos.y + fw.rise * 22, z: fw.pos.z }, fw.color, 60, 9, { gravity: -4, life: 1.3, size: 0.6 });
        }
      } else if (fw.t >= fw.rise + 1.4) {
        this._fireworks.splice(i, 1);
      }
    }
  }

  // Abklingender Kamera-Wackler; nie mehr als 0.5 stapeln
  shake(strength) {
    this.shakeStrength = Math.min(0.5, this.shakeStrength + strength);
  }

  get shakeOffset() {
    if (this.shakeStrength <= 0.001) return this._zero;
    const s = this.shakeStrength;
    this._shakeVec.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    return this._shakeVec;
  }

  update(dt) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.pColor.array;
    const siz = this.geo.attributes.size.array;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        siz[i] = 0;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      this.vel[i * 3 + 1] += this.gravity[i] * dt;
      pos[i * 3 + 0] += this.vel[i * 3 + 0] * dt;
      pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      siz[i] = this.baseSize[i] * t;
      col[i * 3 + 0] = this.baseColor[i * 3 + 0] * t;
      col[i * 3 + 1] = this.baseColor[i * 3 + 1] * t;
      col[i * 3 + 2] = this.baseColor[i * 3 + 2] * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pColor.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;

    this.shakeStrength *= Math.exp(-8 * dt);
    if (this.shakeStrength < 0.001) this.shakeStrength = 0;

    this._updateFireworks(dt);
  }
}
