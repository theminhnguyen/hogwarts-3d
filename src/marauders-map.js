// Karte des Rumtreibers (Sonnet-5-Polish, Meilenstein B1+B2): reines UI-/
// Progress-System. Baut KEINE Three.js-Szene und KEINE Spielwelt — nur ein
// Vollbild-Overlay (Markup/CSS in index.html) mit CSS-gezeichneter
// Weltübersicht, gespeist vom Objective Resolver (progress.js) und dem
// Entdeckungs-Fortschritt in save.map.discovered.
import { resolveProgress } from './progress.js';

// Welt-Koordinaten manuell aus terrain.js/structures.js/collectibles.js
// gespiegelt (siehe dortige Kommentare) — bewusst NICHT importiert, damit
// dieses Modul unabhängig vom Three.js-Weltaufbau bleibt. Bei einer
// Verschiebung dieser Zonen müssen die Koordinaten hier von Hand nachgezogen
// werden. `radius`: "moderater Radius" fürs Entdecken (Plan B2) — grob an
// die jeweilige Zonengröße angelehnt, keine exakte Meterangabe nötig.
export const LANDMARKS = [
  { id: 'schloss', name: 'Schloss / Innenhof', x: 4.5, z: 16, radius: 55, alwaysVisible: true },
  // Liegt nur ~36 Einheiten von 'schloss' entfernt (beide innerhalb der
  // Ringmauer) — labelDy schiebt das Label nach unten, sonst überlappen sich
  // die beiden Beschriftungen auf der kleinen Kartenfläche.
  { id: 'saal', name: 'Großer Saal', x: -31.5, z: 20, radius: 40, alwaysVisible: true, labelDy: 12 },
  { id: 'see', name: 'See / Bootshaus', x: -112, z: 158, radius: 60, alwaysVisible: false },
  { id: 'quidditch', name: 'Quidditch-Feld', x: -195, z: 10, radius: 60, alwaysVisible: false },
  { id: 'eulenbruecke', name: 'Eulenbrück', x: -70, z: -230, radius: 55, alwaysVisible: false },
  { id: 'steinkreis', name: 'Steinkreis', x: 150, z: -95, radius: 45, alwaysVisible: false },
  { id: 'astronomieturm', name: 'Astronomieturm', x: 0, z: -80, radius: 40, alwaysVisible: false },
  { id: 'nebelmoor', name: 'Nebelmoor', x: 240, z: -175, radius: 65, alwaysVisible: false },
  { id: 'kate', name: 'Wispernde Kate', x: 230, z: 140, radius: 35, alwaysVisible: false },
];

// Skalierung fürs CSS-Panel: Weltkoordinaten auf 0..100%. WORLD_BOUND aus
// terrain.js (die unpassierbare Bergkette) ist die sichere obere Grenze für
// jede Landmarken-Koordinate — hier als Zahl gespiegelt, nicht importiert
// (gleicher Grund wie oben). PLAN-EPISCHE-WELT.md E0: mit WORLD_BOUND
// 430->660 nachgezogen, sonst liefe der Spieler-Punkt außerhalb des Panels,
// sobald man in den jetzt begehbaren äußeren Ring läuft.
const MAP_EXTENT = 660;
function toPercent(v) { return ((v + MAP_EXTENT) / (MAP_EXTENT * 2)) * 100; }

export function buildMarauderMap(hud, save) {
  const overlay = document.getElementById('marauders-map');
  const chapterEl = document.getElementById('mm-chapter');
  const primaryTitle = document.getElementById('mm-primary-title');
  const primaryDesc = document.getElementById('mm-primary-desc');
  const secondaryList = document.getElementById('mm-secondary-list');
  const nextHintEl = document.getElementById('mm-next-hint');
  const worldEl = document.getElementById('mm-world');

  let isOpen = false;
  let lastPos = null;
  const dotById = {};

  const playerDot = document.createElement('div');
  playerDot.className = 'mm-player-dot';
  worldEl.appendChild(playerDot);

  function isDiscovered(lm) {
    return lm.alwaysVisible || save.map.discovered.includes(lm.id);
  }

  // Nicht entdeckte Landmarken bekommen KEINEN Punkt (Plan B2: "keine
  // Spoilerkarte") — Punkte werden erst beim ersten Entdecken angelegt und
  // danach nie wieder entfernt (Entdeckung ist dauerhaft).
  function render(progress) {
    chapterEl.textContent = progress.chapter;
    primaryTitle.textContent = progress.primary.title;
    primaryDesc.textContent = progress.primary.description;

    secondaryList.replaceChildren();
    for (const s of progress.secondary) {
      const li = document.createElement('li');
      li.textContent = `${s.title} — ${s.description}`;
      secondaryList.appendChild(li);
    }
    nextHintEl.textContent = progress.nextHint;

    for (const lm of LANDMARKS) {
      if (!isDiscovered(lm)) continue;
      let entry = dotById[lm.id];
      if (!entry) {
        const dot = document.createElement('div');
        dot.className = 'mm-dot';
        dot.style.left = `${toPercent(lm.x)}%`;
        dot.style.top = `${toPercent(lm.z)}%`;
        const label = document.createElement('span');
        label.className = 'mm-dot-label';
        label.textContent = lm.name;
        if (lm.labelDy) label.style.top = `${-6 + lm.labelDy}px`;
        dot.appendChild(label);
        worldEl.appendChild(dot);
        entry = { dot };
        dotById[lm.id] = entry;
      }
      entry.dot.classList.toggle('mm-dot-target', progress.primary.landmarkId === lm.id);
    }

    if (lastPos) {
      playerDot.style.left = `${toPercent(lastPos.x)}%`;
      playerDot.style.top = `${toPercent(lastPos.z)}%`;
    }
  }

  function open_() {
    if (isOpen) return;
    isOpen = true;
    overlay.classList.remove('hidden');
    render(resolveProgress(save));
  }
  function close_() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.add('hidden');
  }

  return {
    get isOpen() { return isOpen; },
    open: open_,
    close: close_,
    toggle() { if (isOpen) close_(); else open_(); },
    // Reset-Handler: save.map.discovered wird dort geleert (Object.assign),
    // aber bereits angelegte Punkt-DOM-Elemente bleiben ohne diesen Aufruf
    // stehen (render() legt Punkte nur an, entfernt sie sonst nie).
    restore() {
      for (const id in dotById) { dotById[id].dot.remove(); delete dotById[id]; }
      if (isOpen) render(resolveProgress(save));
    },
    // Jeden Frame aufgerufen (auch bei geschlossener Karte): Entdeckung
    // passiert beiläufig beim Herumlaufen, nicht nur während die Karte
    // offen ist. Rendering (DOM-Schreibzugriffe) nur, solange offen.
    tick(playerPos) {
      lastPos = playerPos;
      if (playerPos) {
        for (const lm of LANDMARKS) {
          if (lm.alwaysVisible || save.map.discovered.includes(lm.id)) continue;
          const dx = playerPos.x - lm.x, dz = playerPos.z - lm.z;
          if (dx * dx + dz * dz <= lm.radius * lm.radius) {
            save.map.discovered.push(lm.id);
            hud?.showToast(`🗺️ Entdeckt: ${lm.name}`, 3);
          }
        }
      }
      if (isOpen) render(resolveProgress(save));
    },
  };
}
