// Regressionstests für src/interact.js (Qualitätsplan Etappe A2).
// Die Datei trägt die zentrale "Taste E"-Logik für 40+ Registrierungen im
// Spiel, hatte aber bislang keine Tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InteractSystem } from '../src/interact.js';

function fakeHud() {
  return {
    calls: [],
    showInteractPrompt(text, locked) { this.calls.push({ type: 'show', text, locked: !!locked }); },
    hideInteractPrompt() { this.calls.push({ type: 'hide' }); },
  };
}

function player(x, z) {
  return { pos: { x, z } };
}

test('register(): Getter für x/z werden nicht eingefroren (bewegliche NPCs hängen daran)', () => {
  const sys = new InteractSystem(fakeHud());
  let liveX = 0;
  const entry = sys.register({
    get x() { return liveX; },
    z: 0,
    r: 5,
    prompt: 'Test',
    onInteract() {},
  });
  assert.equal(entry.x, 0);
  liveX = 10;
  assert.equal(entry.x, 10, 'Getter muss live bleiben statt beim register() als Zahl eingefroren zu werden');
});

test('register(): Defaults für r und enabled greifen, wenn nicht angegeben', () => {
  const sys = new InteractSystem(fakeHud());
  const entry = sys.register({ x: 0, z: 0, prompt: 'x', onInteract() {} });
  assert.equal(entry.r, 2.2);
  assert.equal(entry.enabled, true);
});

test('update(): enabled:false + lockedPrompt zeigt Hinweis, aber current bleibt null', () => {
  const hud = fakeHud();
  const sys = new InteractSystem(hud);
  let triggered = false;
  sys.register({
    x: 0, z: 0, r: 3,
    enabled: false,
    lockedPrompt: 'Gesperrt',
    prompt: 'Sollte nie erscheinen',
    onInteract() { triggered = true; },
  });
  sys.update(player(0, 0));
  assert.equal(sys.current, null, 'Taste E darf bei einem reinen Hinweis nichts auslösen können');
  assert.deepEqual(hud.calls.at(-1), { type: 'show', text: 'Gesperrt', locked: true });
  sys.trigger();
  assert.equal(triggered, false);
});

test('update(): enabled:false ohne lockedPrompt zeigt gar nichts an', () => {
  const hud = fakeHud();
  const sys = new InteractSystem(hud);
  sys.register({ x: 0, z: 0, r: 3, enabled: false, prompt: 'x', onInteract() {} });
  sys.update(player(0, 0));
  assert.equal(sys.current, null);
  assert.deepEqual(hud.calls.at(-1), { type: 'hide' });
});

test('update(): das nächste aktive Ziel in Reichweite gewinnt', () => {
  const hud = fakeHud();
  const sys = new InteractSystem(hud);
  sys.register({ x: 2, z: 0, r: 5, prompt: 'weit', onInteract() {} });
  const near = sys.register({ x: 1, z: 0, r: 5, prompt: 'nah', onInteract() {} });
  sys.update(player(0, 0));
  assert.equal(sys.current, near);
  assert.deepEqual(hud.calls.at(-1), { type: 'show', text: 'nah', locked: false });
});

test('update(): ein aktives Ziel gewinnt immer gegen ein gesperrtes, auch wenn näher', () => {
  const hud = fakeHud();
  const sys = new InteractSystem(hud);
  const active = sys.register({ x: 3, z: 0, r: 5, prompt: 'aktiv', onInteract() {} });
  sys.register({ x: 1, z: 0, r: 5, enabled: false, lockedPrompt: 'gesperrt, aber näher', onInteract() {} });
  sys.update(player(0, 0));
  assert.equal(sys.current, active);
  assert.deepEqual(hud.calls.at(-1), { type: 'show', text: 'aktiv', locked: false });
});

test('update(): Ziel außer Reichweite -> hideInteractPrompt()', () => {
  const hud = fakeHud();
  const sys = new InteractSystem(hud);
  sys.register({ x: 100, z: 100, r: 2, prompt: 'weit weg', onInteract() {} });
  sys.update(player(0, 0));
  assert.equal(sys.current, null);
  assert.deepEqual(hud.calls.at(-1), { type: 'hide' });
});

test('trigger(): löst onInteract genau einmal aus, wenn current gesetzt ist', () => {
  const hud = fakeHud();
  const sys = new InteractSystem(hud);
  let count = 0;
  sys.register({ x: 0, z: 0, r: 3, prompt: 'x', onInteract() { count++; } });
  sys.update(player(0, 0));
  sys.trigger();
  assert.equal(count, 1);
});

test('trigger(): tut ohne current gar nichts (kein Fehler, kein Aufruf)', () => {
  const sys = new InteractSystem(fakeHud());
  assert.doesNotThrow(() => sys.trigger());
});
