// Himmel & Tag/Nacht-Zyklus: Himmelskuppel (Shader), Sonne, Mond, Sterne,
// Licht-Rig (Hemisphäre + Sonne mit Schatten), Nebel — alles zeitgesteuert.

import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './noise.js';
import { makeCloudTexture, makeMoonTexture, makeGlowTexture } from './textures.js';

const DAY_LENGTH = 300; // Sekunden für einen vollen Tag

export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.timeOfDay = 0.34;      // 0 = Mitternacht, 0.5 = Mittag → Start: Vormittag
    this.paused = false;

    // aktueller Zustand (von anderen Systemen gelesen)
    this.state = {
      sunDir: new THREE.Vector3(0, 1, 0),
      sunColor: new THREE.Color(),
      skyHorizon: new THREE.Color(),
      daylight: 1,      // 0 = Nacht, 1 = Tag
      nightGlow: 0,     // 1 = Nacht (für Fenster, Fackeln, Glühwürmchen)
    };

    // --- Himmelskuppel ---
    this.skyUniforms = {
      uZenith: { value: new THREE.Color(0x2c66c4) },
      uHorizon: { value: new THREE.Color(0xaad4ee) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff3d0) },
      uSunAmount: { value: 1 },
    };
    const skyGeo = new THREE.SphereGeometry(1500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSunAmount;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = max(dir.y, 0.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
          float s = max(dot(dir, uSunDir), 0.0);
          // weicher Glow + Sonnenscheibe
          col += uSunColor * pow(s, 14.0) * 0.45 * uSunAmount;
          col += uSunColor * smoothstep(0.9993, 0.9997, s) * 2.2 * uSunAmount;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.frustumCulled = false;
    scene.add(this.skyMesh);

    // --- Sterne (zwei Schichten: viele feine + wenige helle) ---
    const makeStars = (n, size, seed) => {
      const rng = mulberry32(seed);
      const positions = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const y = 0.06 + rng() * 0.94;
        const r = Math.sqrt(1 - y * y);
        positions[i * 3] = Math.cos(a) * r * 1400;
        positions[i * 3 + 1] = y * 1400;
        positions[i * 3 + 2] = Math.sin(a) * r * 1400;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xcfd8ff, size, sizeAttenuation: false,
        transparent: true, opacity: 0, depthWrite: false, fog: false,
      });
      const points = new THREE.Points(g, mat);
      points.frustumCulled = false;
      scene.add(points);
      return { points, mat };
    };
    this.starsFine = makeStars(1100, 1.6, 99);
    this.starsBright = makeStars(140, 3.0, 101);

    // --- Mond (mit Kratern + Glow) ---
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(26, 20, 14),
      new THREE.MeshBasicMaterial({ map: makeMoonTexture(), fog: false })
    );
    scene.add(this.moon);
    const glowTex = makeGlowTexture();
    this.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xbfd0f5, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.moonGlow.scale.set(150, 150, 1);
    scene.add(this.moonGlow);

    // --- Sonnen-Glow (gefaktes Bloom) ---
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffe9b0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sunGlow.scale.set(420, 420, 1);
    scene.add(this.sunGlow);

    // --- Wolken (weiche Billboards, driften langsam) ---
    this.clouds = [];
    {
      const rng = mulberry32(55);
      const texes = [makeCloudTexture(1), makeCloudTexture(2), makeCloudTexture(3)];
      for (let i = 0; i < 16; i++) {
        const mat = new THREE.SpriteMaterial({
          map: texes[i % 3], transparent: true, opacity: 0.55 + rng() * 0.25,
          depthWrite: false, fog: false,
        });
        const s = new THREE.Sprite(mat);
        const scale = 120 + rng() * 160;
        s.scale.set(scale, scale * 0.42, 1);
        s.position.set(
          (rng() * 2 - 1) * 900,
          150 + rng() * 130,
          (rng() * 2 - 1) * 900
        );
        s.userData = { speed: 2 + rng() * 3, baseOpacity: mat.opacity };
        scene.add(s);
        this.clouds.push(s);
      }
      this._cloudColor = new THREE.Color();
    }

    // --- Lichter ---
    this.hemi = new THREE.HemisphereLight(0xbdd8f0, 0x3e4a33, 0.9);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75;
    sc.near = 20; sc.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.7;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // --- Nebel ---
    scene.fog = new THREE.Fog(0xaad4ee, 80, 750);

    // Farb-Paletten (Nacht / Dämmerung / Tag)
    this.pal = {
      zenith: { night: new THREE.Color(0x070b1d), dusk: new THREE.Color(0x2a2a55), day: new THREE.Color(0x3272cf) },
      horizon: { night: new THREE.Color(0x18203a), dusk: new THREE.Color(0xe08050), day: new THREE.Color(0xaad4ee) },
      sun: { night: new THREE.Color(0x8899cc), dusk: new THREE.Color(0xffa060), day: new THREE.Color(0xfff2d0) },
      fog: { night: new THREE.Color(0x141c33), dusk: new THREE.Color(0x9a6a58), day: new THREE.Color(0xa8cde8) },
      hemiSky: { night: new THREE.Color(0x2a3550), dusk: new THREE.Color(0x8a7a90), day: new THREE.Color(0xbdd8f0) },
    };
    this._c1 = new THREE.Color();
  }

  // 3-fach-Mix: Nacht ↔ Dämmerung ↔ Tag
  _mix(target, set, daylight, duskAmount) {
    target.copy(set.night).lerp(set.day, daylight);
    target.lerp(set.dusk, duskAmount);
    return target;
  }

  advance(hours = 3) {
    this.timeOfDay = (this.timeOfDay + hours / 24) % 1;
  }

  get clockText() {
    const h = Math.floor(this.timeOfDay * 24);
    const m = Math.floor((this.timeOfDay * 24 - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} Uhr`;
  }

  update(dt, playerPos) {
    if (!this.paused) this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH) % 1;
    const t = this.timeOfDay;

    const e = (t - 0.25) * Math.PI * 2;    // t=0.25 Sonnenaufgang, 0.75 Untergang
    const elev = Math.sin(e);              // -1..1 Sonnenhöhe
    const sunDir = this.state.sunDir.set(Math.cos(e), elev, -0.35).normalize();

    const daylight = clamp((elev + 0.12) / 0.35, 0, 1);
    const duskAmount = clamp(1 - Math.abs(elev) / 0.22, 0, 1) * 0.8;
    this.state.daylight = daylight;
    this.state.nightGlow = 1 - daylight;

    // Himmel
    this._mix(this.skyUniforms.uZenith.value, this.pal.zenith, daylight, duskAmount * 0.5);
    this._mix(this.skyUniforms.uHorizon.value, this.pal.horizon, daylight, duskAmount);
    this._mix(this.skyUniforms.uSunColor.value, this.pal.sun, daylight, duskAmount);
    this.skyUniforms.uSunDir.value.copy(sunDir);
    this.skyUniforms.uSunAmount.value = elev > -0.1 ? 1 : 0;
    this.state.skyHorizon.copy(this.skyUniforms.uHorizon.value);
    this.state.sunColor.copy(this.skyUniforms.uSunColor.value);

    // Sterne (mit leichtem Funkeln) & Mond & Glows
    const starBase = clamp(1 - daylight * 1.6, 0, 1);
    const tw = performance.now() * 0.001;
    this.starsFine.mat.opacity = starBase * (0.75 + Math.sin(tw * 2.1) * 0.08);
    this.starsBright.mat.opacity = starBase * (0.9 + Math.sin(tw * 3.7 + 1.3) * 0.1);
    const moonDir = this._moonDir || (this._moonDir = new THREE.Vector3());
    moonDir.copy(sunDir).multiplyScalar(-1);
    this.moon.position.copy(playerPos).addScaledVector(moonDir, 1350);
    this.moon.visible = moonDir.y > -0.05;
    this.moonGlow.position.copy(this.moon.position);
    this.moonGlow.material.opacity = this.moon.visible ? starBase * 0.5 : 0;
    this.sunGlow.position.copy(playerPos).addScaledVector(sunDir, 1300);
    this.sunGlow.material.opacity = clamp(elev * 3.5, 0, 1) * 0.55;
    this.sunGlow.material.color.copy(this.skyUniforms.uSunColor.value);

    // Wolken: driften + Färbung nach Tageszeit (weiß → Abendrot → Nachtgrau)
    this._cloudColor.setRGB(
      0.25 + daylight * 0.75,
      0.25 + daylight * 0.72,
      0.32 + daylight * 0.68
    );
    this._cloudColor.lerp(this._duskCloud || (this._duskCloud = new THREE.Color(1.0, 0.62, 0.42)), duskAmount * 0.7);
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 1000) c.position.x = -1000;
      c.material.color.copy(this._cloudColor);
      c.material.opacity = c.userData.baseOpacity * (0.45 + daylight * 0.55);
    }

    // Licht: tagsüber Sonne, nachts Mond
    const lightDir = elev > -0.06 ? sunDir : moonDir;
    this.sun.position.copy(playerPos).addScaledVector(lightDir, 180);
    this.sun.target.position.copy(playerPos);
    this.sun.target.updateMatrixWorld();
    if (elev > -0.06) {
      this._mix(this._c1, this.pal.sun, daylight, duskAmount);
      this.sun.color.copy(this._c1);
      this.sun.intensity = 0.5 + daylight * 1.9;
    } else {
      this.sun.color.set(0x8fa0d8);
      this.sun.intensity = 0.8;
    }
    this._mix(this.hemi.color, this.pal.hemiSky, daylight, duskAmount * 0.4);
    this.hemi.intensity = 0.58 + daylight * 0.85;

    // Nebel
    this._mix(this.scene.fog.color, this.pal.fog, daylight, duskAmount);
    this.scene.fog.far = 420 + daylight * 340;

    // Kuppel & Sterne folgen dem Spieler
    this.skyMesh.position.copy(playerPos);
    for (const layer of [this.starsFine, this.starsBright]) {
      layer.points.position.copy(playerPos);
      layer.points.rotation.y = t * Math.PI * 2 * 0.5;
    }
  }
}
