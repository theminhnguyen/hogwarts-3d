// Prozedurale Canvas-Texturen — kein einziges Asset nötig.
// Alle Texturen sind um Weiß herum aufgebaut (Mittelwert ~0.9), damit sie die
// Vertex-Farben nur mit DETAIL überlagern statt sie umzufärben.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Körnung über das ganze Bild
function speckle(ctx, size, rng, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = 200 + Math.floor(rng() * 55);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 2);
  }
}

// ---------- Mauerwerk (Quader mit Fugen) ----------
export function makeStoneTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(11);
  ctx.fillStyle = '#d9d5cd';
  ctx.fillRect(0, 0, S, S);

  const rowH = 32, blockW = 52;
  for (let row = 0; row < S / rowH; row++) {
    const offset = (row % 2) * blockW * 0.5;
    for (let bx = -1; bx < S / blockW + 1; bx++) {
      const x = bx * blockW + offset;
      const y = row * rowH;
      // Blockfläche mit leichtem Versatz im Ton
      const v = 205 + Math.floor(rng() * 38);
      const warm = rng() * 8;
      ctx.fillStyle = `rgb(${v},${v - warm * 0.4},${v - warm})`;
      ctx.fillRect(x + 1.5, y + 1.5, blockW - 3, rowH - 3);
      // obere Kante hell (gefaktes Relief), untere dunkel
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x + 1.5, y + 1.5, blockW - 3, 2);
      ctx.fillStyle = 'rgba(40,36,30,0.22)';
      ctx.fillRect(x + 1.5, y + rowH - 3.5, blockW - 3, 2);
      // gelegentliche Flecken
      if (rng() < 0.3) {
        ctx.fillStyle = `rgba(120,115,100,${0.05 + rng() * 0.1})`;
        ctx.beginPath();
        ctx.arc(x + rng() * blockW, y + rng() * rowH, 3 + rng() * 7, 0, 7);
        ctx.fill();
      }
    }
    // Fugenlinien
    ctx.fillStyle = 'rgba(70,64,56,0.55)';
    ctx.fillRect(0, row * rowH - 1, S, 2);
    for (let bx = -1; bx < S / blockW + 1; bx++) {
      ctx.fillRect(bx * blockW + offset - 1, row * rowH, 2, rowH);
    }
  }
  speckle(ctx, S, rng, 900, 0.10);
  return finish(c);
}

// ---------- Dachschindeln ----------
export function makeRoofTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(29);
  ctx.fillStyle = '#cfd3da';
  ctx.fillRect(0, 0, S, S);

  const rowH = 22, w = 34;
  for (let row = 0; row < S / rowH + 1; row++) {
    const offset = (row % 2) * w * 0.5;
    for (let bx = -1; bx < S / w + 1; bx++) {
      const x = bx * w + offset;
      const y = row * rowH;
      const v = 185 + Math.floor(rng() * 50);
      ctx.fillStyle = `rgb(${v - 6},${v - 2},${v + 6})`;
      // Schindel mit rundem unterem Ende
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - 2, y);
      ctx.lineTo(x + w - 2, y + rowH - 5);
      ctx.quadraticCurveTo(x + (w - 2) / 2, y + rowH + 5, x, y + rowH - 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,32,40,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(0, row * rowH, S, 2);
  }
  speckle(ctx, S, rng, 400, 0.06);
  return finish(c);
}

// ---------- Holzplanken ----------
export function makeWoodTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(43);
  ctx.fillStyle = '#d8c9b0';
  ctx.fillRect(0, 0, S, S);

  const plankW = 42;
  for (let p = 0; p < S / plankW + 1; p++) {
    const x = p * plankW;
    const v = 195 + Math.floor(rng() * 40);
    ctx.fillStyle = `rgb(${v},${v - 18},${v - 42})`;
    ctx.fillRect(x + 1, 0, plankW - 2, S);
    // Maserung
    for (let g = 0; g < 7; g++) {
      const gx = x + 4 + rng() * (plankW - 8);
      ctx.strokeStyle = `rgba(90,60,30,${0.10 + rng() * 0.15})`;
      ctx.lineWidth = 1 + rng();
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      for (let y = 0; y <= S; y += 16) {
        ctx.lineTo(gx + Math.sin(y * 0.05 + g) * 3, y);
      }
      ctx.stroke();
    }
    // Astloch
    if (rng() < 0.5) {
      const kx = x + plankW / 2, ky = rng() * S;
      ctx.fillStyle = 'rgba(80,50,25,0.5)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, 3.5, 5, 0, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(50,32,16,0.5)';
    ctx.fillRect(x - 1, 0, 2, S);
  }
  return finish(c);
}

// ---------- Gras / Boden-Detail ----------
export function makeGroundTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(57);
  ctx.fillStyle = '#d6d6cc';
  ctx.fillRect(0, 0, S, S);
  // fleckige Helligkeit (dezent, sonst wirkt die Wiese gescheckt)
  for (let i = 0; i < 260; i++) {
    const v = 200 + Math.floor(rng() * 45);
    ctx.fillStyle = `rgba(${v},${v},${v - 10},0.16)`;
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, 4 + rng() * 13, 0, 7);
    ctx.fill();
  }
  // Gras-Striche
  for (let i = 0; i < 900; i++) {
    const x = rng() * S, y = rng() * S;
    const l = 3 + rng() * 6;
    const bright = rng() < 0.5;
    ctx.strokeStyle = bright ? 'rgba(235,240,215,0.20)' : 'rgba(60,70,45,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 3, y - l);
    ctx.stroke();
  }
  speckle(ctx, S, rng, 700, 0.08);
  return finish(c);
}

// ---------- Wolke (weicher Fleck mit ausgefransten Rändern) ----------
export function makeCloudTexture(seed = 1) {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(60 + seed);
  ctx.clearRect(0, 0, S, S);
  // mehrere überlappende weiche Blobs
  for (let i = 0; i < 14; i++) {
    const x = S * 0.5 + (rng() - 0.5) * S * 0.55;
    const y = S * 0.55 + (rng() - 0.5) * S * 0.3;
    const r = S * (0.10 + rng() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  const tex = finish(c, { repeat: false });
  return tex;
}

// ---------- Weiche runde Glow-Textur (Flammen, Glühwürmchen, Kerzen, Sonne) ----------
export function makeGlowTexture() {
  const S = 64;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return finish(c, { repeat: false });
}

// ---------- Spinnennetz (radiale Speichen + Spiralfäden, transparent) ----------
export function makeWebTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(97);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2, maxR = S * 0.48;
  const spokes = 9;
  ctx.strokeStyle = 'rgba(235,238,242,0.55)';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + rng() * 0.05;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
    ctx.stroke();
  }
  // Spiralfäden zwischen den Speichen
  const rings = 7;
  ctx.strokeStyle = 'rgba(230,234,240,0.4)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= rings; ring++) {
    const r = (ring / rings) * maxR;
    ctx.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const jr = r + (rng() - 0.5) * 4;
      const x = cx + Math.cos(a) * jr, y = cy + Math.sin(a) * jr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // ein paar eingesponnene Fasern/Risse fürs unheimliche Detail
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = `rgba(220,224,230,${0.15 + rng() * 0.2})`;
    ctx.lineWidth = 0.8;
    const a = rng() * Math.PI * 2, r0 = rng() * maxR * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * (r0 + 10 + rng() * 20), cy + Math.sin(a) * (r0 + 10 + rng() * 20));
    ctx.stroke();
  }
  return finish(c, { repeat: false });
}

// ---------- Fell/Federn (kurze gerichtete Strähnen) ----------
// PLAN-EPISCHE-WELT.md (E1): Fauna-Grafik-Upgrade. Wie die anderen Texturen
// um Weiß herum aufgebaut (Mittelwert ~0.9) — moduliert nur die Vertex-Farbe
// mit Strähnen-Detail, färbt sie nicht um. `seed` hält Fuchs/Reh/Hase optisch
// unterscheidbar, ohne die Funktion zu duplizieren.
export function makeFurTexture(seed = 1) {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(200 + seed);
  ctx.fillStyle = '#dcdcdc';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const x = rng() * S, y = rng() * S;
    const len = 2.5 + rng() * 4;
    const drift = (rng() - 0.5) * 1.5;
    const bright = rng() < 0.55;
    ctx.strokeStyle = bright ? 'rgba(255,255,255,0.22)' : 'rgba(40,35,30,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + drift, y - len); // Strähnen wachsen "nach oben" (Fellrichtung Kopf->Schwanz beim Auftragen)
    ctx.stroke();
  }
  speckle(ctx, S, rng, 200, 0.06);
  return finish(c);
}

// ---------- Mond mit Kratern ----------
export function makeMoonTexture() {
  const S = 128;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(88);
  ctx.fillStyle = '#e8ecf2';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rng() * S, y = rng() * S, r = 3 + rng() * 12;
    ctx.fillStyle = `rgba(150,158,175,${0.15 + rng() * 0.25})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, 7);
    ctx.fill();
  }
  return finish(c, { repeat: false });
}

// ---------- Ferne Drachen-Silhouette (E9, PLAN-EPISCHE-WELT.md 6.6) ----------
// Reine Deko-Textur für einen Horizont-Sprite bei der Aschenklamm — Body/
// Flügel/Schwanz als einfache dunkle Formen, keine Details nötig (wird nur
// aus großer Distanz gesehen).
export function makeDragonSilhouetteTexture() {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(20,10,10,0.88)';
  // Flügel (2 große Dreiecke, leicht nach hinten gepfeilt)
  ctx.beginPath();
  ctx.moveTo(S * 0.42, S * 0.5);
  ctx.lineTo(S * 0.1, S * 0.18);
  ctx.lineTo(S * 0.5, S * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(S * 0.5, S * 0.5);
  ctx.lineTo(S * 0.62, S * 0.14);
  ctx.lineTo(S * 0.58, S * 0.44);
  ctx.closePath();
  ctx.fill();
  // Rumpf (Ellipse) + Hals/Kopf + Schwanz
  ctx.beginPath();
  ctx.ellipse(S * 0.48, S * 0.56, S * 0.16, S * 0.07, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(S * 0.6, S * 0.52);
  ctx.lineTo(S * 0.78, S * 0.4);
  ctx.lineTo(S * 0.74, S * 0.5);
  ctx.lineTo(S * 0.6, S * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(S * 0.34, S * 0.58);
  ctx.lineTo(S * 0.14, S * 0.72);
  ctx.lineTo(S * 0.2, S * 0.6);
  ctx.lineTo(S * 0.36, S * 0.54);
  ctx.closePath();
  ctx.fill();
  return finish(c, { repeat: false });
}
