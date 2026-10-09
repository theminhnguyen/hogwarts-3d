// Regressionstests für die Bildraten-Begrenzung (src/frame-pacer.js,
// Perf-Runde 2026-10-09). Simuliert rAF-Zeitstempel verschiedener Bildschirme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFramePacer } from '../src/frame-pacer.js';

// Zählt, wie viele Bilder in `seconds` Sekunden gezeichnet werden.
function renderedPerSecond(hz, cap, { seconds = 5, jitterMs = 0, seed = 1 } = {}) {
  const pacer = createFramePacer();
  let rnd = seed;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  let now = 1000, rendered = 0;
  const frames = Math.round(hz * seconds);
  for (let i = 0; i < frames; i++) {
    now += 1000 / hz + (rand() * 2 - 1) * jitterMs;
    if (pacer.shouldRender(now, cap)) rendered++;
  }
  return rendered / seconds;
}

test('frame-pacer: 60-Hz-Bildschirm mit 60er-Begrenzung zeichnet jedes Bild, auch mit Zittern', () => {
  assert.equal(renderedPerSecond(60, 60), 60);
  assert.ok(renderedPerSecond(60, 60, { jitterMs: 1.2 }) >= 59.8);
});

test('frame-pacer: 120 Hz mit 60er-Begrenzung zeichnet jedes zweite Bild', () => {
  const r = renderedPerSecond(120, 60);
  assert.ok(Math.abs(r - 60) <= 0.4, `gezeichnet: ${r}/s`);
});

test('frame-pacer: 144 Hz mit 60er-Begrenzung landet nahe 60 statt bei 48', () => {
  // Leicht über 60 ist Absicht: die Zitter-Toleranz (FRAME_SLACK_MS) verzeiht
  // knappe Abstände, damit 60-Hz-Bildschirme nie ein Bild auslassen.
  const r = renderedPerSecond(144, 60);
  assert.ok(r >= 55 && r <= 63, `gezeichnet: ${r}/s`);
});

test('frame-pacer: ohne Begrenzung (0) wird jedes Bild gezeichnet', () => {
  assert.equal(renderedPerSecond(120, 0), 120);
});

test('frame-pacer: Menü-Takt 15 auf 60 Hz', () => {
  const r = renderedPerSecond(60, 15);
  assert.ok(Math.abs(r - 15) <= 0.4, `gezeichnet: ${r}/s`);
});

test('frame-pacer: erster Aufruf zeichnet sofort, ungültige Zeitstempel brechen nichts', () => {
  const pacer = createFramePacer();
  assert.equal(pacer.shouldRender(undefined, 60), true);
  // Danach muss die Begrenzung trotzdem greifen (Regression: NaN-Budget hätte sie abgeschaltet).
  let rendered = 0;
  for (let i = 1; i <= 240; i++) if (pacer.shouldRender(1000 + i * (1000 / 120), 60)) rendered++;
  assert.ok(rendered >= 118 && rendered <= 122, `gezeichnet: ${rendered} von 240`);
});

test('frame-pacer: nach langer Pause (Tab-Wechsel) kein Nachhol-Schwall', () => {
  const pacer = createFramePacer();
  let now = 0;
  for (let i = 0; i < 60; i++) { now += 1000 / 120; pacer.shouldRender(now, 60); }
  now += 5000; // 5 s weg
  let burst = 0;
  for (let i = 0; i < 6; i++) { now += 1000 / 120; if (pacer.shouldRender(now, 60)) burst++; }
  assert.ok(burst <= 4, `direkt danach gezeichnet: ${burst} von 6`);
});
