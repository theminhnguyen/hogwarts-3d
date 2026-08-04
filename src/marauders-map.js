// Karte des Rumtreibers (Sonnet-5-Polish, Meilenstein B1+B2): reines UI-/
// Progress-System. Baut KEINE Three.js-Szene und KEINE Spielwelt — nur ein
// Vollbild-Overlay (Markup/CSS in index.html) mit CSS-gezeichneter
// Weltübersicht, gespeist vom Objective Resolver (progress.js) und dem
// Entdeckungs-Fortschritt in save.map.discovered.
//
// i18n (2026-08-04, Etappe 2): dieses Modul ist reines Browser-UI (DOM,
// hud.showToast) — anders als progress.js darf es i18n.js bedenkenlos
// importieren, node --test rührt es nie an.
import { resolveProgress } from './progress.js';
import { t } from './i18n.js';

// Welt-Koordinaten manuell aus terrain.js/structures.js/collectibles.js
// gespiegelt (siehe dortige Kommentare) — bewusst NICHT importiert, damit
// dieses Modul unabhängig vom Three.js-Weltaufbau bleibt. Bei einer
// Verschiebung dieser Zonen müssen die Koordinaten hier von Hand nachgezogen
// werden. `radius`: "moderater Radius" fürs Entdecken (Plan B2) — grob an
// die jeweilige Zonengröße angelehnt, keine exakte Meterangabe nötig.
export const LANDMARKS = [
  { id: 'schloss', nameKey: 'mm.landmark.schloss', x: 4.5, z: 16, radius: 55, alwaysVisible: true },
  // Liegt nur ~36 Einheiten von 'schloss' entfernt (beide innerhalb der
  // Ringmauer) — labelDy schiebt das Label nach unten, sonst überlappen sich
  // die beiden Beschriftungen auf der kleinen Kartenfläche.
  { id: 'saal', nameKey: 'mm.landmark.saal', x: -31.5, z: 20, radius: 40, alwaysVisible: true, labelDy: 12 },
  { id: 'see', nameKey: 'mm.landmark.see', x: -112, z: 158, radius: 60, alwaysVisible: false },
  { id: 'quidditch', nameKey: 'mm.landmark.quidditch', x: -195, z: 10, radius: 60, alwaysVisible: false },
  { id: 'eulenbruecke', nameKey: 'mm.landmark.eulenbruecke', x: -70, z: -230, radius: 55, alwaysVisible: false },
  { id: 'steinkreis', nameKey: 'mm.landmark.steinkreis', x: 150, z: -95, radius: 45, alwaysVisible: false },
  { id: 'astronomieturm', nameKey: 'mm.landmark.astronomieturm', x: 0, z: -80, radius: 40, alwaysVisible: false },
  { id: 'nebelmoor', nameKey: 'mm.landmark.nebelmoor', x: 240, z: -175, radius: 65, alwaysVisible: false },
  { id: 'kate', nameKey: 'mm.landmark.kate', x: 230, z: 140, radius: 35, alwaysVisible: false },
  // E11 (Plan-Abschnitt 5): die 4 neuen Boss-Regionen aus E4-E7 — Koordinaten
  // 1:1 aus terrain.js gespiegelt (ASCHENKLAMM/FROSTZINNEN/SILBERHAIN/
  // SCHWARZWASSER), radius = Kernradius + 15 (Muster: atmosphere.registerZone
  // in main.js nutzt exakt denselben Puffer für diese 4 Zonen).
  { id: 'aschenklamm', nameKey: 'mm.landmark.aschenklamm', x: 395, z: 110, radius: 60, alwaysVisible: false },
  { id: 'frostzinnen', nameKey: 'mm.landmark.frostzinnen', x: 0, z: -410, radius: 60, alwaysVisible: false },
  { id: 'silberhain', nameKey: 'mm.landmark.silberhain', x: -90, z: 410, radius: 60, alwaysVisible: false },
  { id: 'schwarzwasser', nameKey: 'mm.landmark.schwarzwasser', x: -405, z: -40, radius: 55, alwaysVisible: false },
  // V6 (PLAN-DER-DUNKLE-LORD.md): Koordinaten 1:1 aus terrain.js SCHATTENFESTE
  // gespiegelt (x:250, z:-350, r:45), radius = Kernradius + 15 — exakt dasselbe
  // Muster wie die 4 E11-Boss-Regionen direkt darüber.
  { id: 'schattenfeste', nameKey: 'mm.landmark.schattenfeste', x: 250, z: -350, radius: 60, alwaysVisible: false },
];

// Titel-Übersicht (Opus-5-Audit-Fix): ursprünglich nur die 6 Titel, die im
// Code als eigener hud.showToast('… Titel „X" errungen!') formuliert sind
// (aschenklamm.js/frostzinnen.js/schwarzwasser.js/unicorn.js/npc.js Fero-
// Quest/finale.js). Auf Nachfrage ("sind da wirklich ALLE Achievements
// dabei, auch Heiligtümer/dunkler Pfad?") um alle weiteren echten
// Meilensteine ergänzt, die bisher NIE als Titel formuliert waren, sondern
// nur als Status-Zeile im Startmenü (main.js refreshStatusLines) oder gar
// nicht sichtbar — der dunkle PFAD selbst bleibt bewusst ausgeschlossen
// (dunkel.pfad ist über die Läuterung umkehrbar, also kein einmaliger
// Erfolg), aber das GRIMOIRE-LESEN (dunkel.buch) ist ein permanenter Fakt,
// der auch nach einer Läuterung bestehen bleibt (dark.js setzt buch nie
// zurück) und damit doch ein echtes Achievement ist.
// `earned` liest ausschließlich bereits bestehende save.*-Felder, kein
// neues Speicherformat nötig.
const TITLES = [
  { id: 'hauspokal', icon: '🏆', nameKey: 'title.hauspokal.name', descKey: 'title.hauspokal.desc', earned: (s) => s.pz?.hauspokal === 1 },
  { id: 'seelenwaechter', icon: '🏮', nameKey: 'title.seelenwaechter.name', descKey: 'title.seelenwaechter.desc', earned: (s) => s.moor.laterne === 1 },
  { id: 'meisterDesTodes', icon: '☠️', nameKey: 'title.meisterDesTodes.name', descKey: 'title.meisterDesTodes.desc', earned: (s) => s.hallows.stab === 1 && s.hallows.umhang === 1 && s.hallows.stein === 1 },
  { id: 'drache', icon: '🐲', nameKey: 'title.drache.name', descKey: 'title.drache.desc', earned: (s) => s.siegel.drache === 1 },
  { id: 'frost', icon: '🧊', nameKey: 'title.frost.name', descKey: 'title.frost.desc', earned: (s) => s.siegel.frost === 1 },
  { id: 'hain', icon: '🦄', nameKey: 'title.hain.name', descKey: 'title.hain.desc', earned: (s) => s.siegel.hain === 1 },
  { id: 'tiefe', icon: '🔱', nameKey: 'title.tiefe.name', descKey: 'title.tiefe.desc', earned: (s) => s.siegel.tiefe === 1 },
  { id: 'weltensammler', icon: '🌍', nameKey: 'title.weltensammler.name', descKey: 'title.weltensammler.desc', earned: (s) => s.quests.feroSammler === 1 },
  { id: 'vierReiche', icon: '🌟', nameKey: 'title.vierReiche.name', descKey: 'title.vierReiche.desc', earned: (s) => s.siegel.finaleWon === 1 },
  { id: 'animagus', icon: '🐾', nameKey: 'title.animagus.name', descKey: 'title.animagus.desc', earned: (s) => s.animagus.gelernt === 1 },
  { id: 'grimoire', icon: '📖', nameKey: 'title.grimoire.name', descKey: 'title.grimoire.desc', earned: (s) => s.dunkel.buch === 1 },
  { id: 'quidditchAss', icon: '🧹', nameKey: 'title.quidditchAss.name', descKey: 'title.quidditchAss.desc', earned: (s) => s.ace === 1 },
  // V6 (PLAN-DER-DUNKLE-LORD.md): 13. Titel, größter Einzelerfolg des Spiels.
  { id: 'dunklerLord', icon: '⚡', nameKey: 'title.dunklerLord.name', descKey: 'title.dunklerLord.desc', earned: (s) => s.lord.besiegt === 1 },
];

// Almanach (Nutzerwunsch 2026-08-04: "ich weiß nicht, was es noch alles
// gibt"). Anders als TITLES oben (das sind ERRUNGENSCHAFTEN — Name+Zustand,
// aber kein "wo starte ich das") ist das hier eine Liste der SYSTEME selbst,
// mit Fundort/Auslöser. Bewusst NICHT deckungsgleich mit TITLES: die vier
// Elementar-Siegel und die Heiligtümer haben dort schon je einen eigenen
// Titel — hier stehen sie nur einmal gebündelt, mit dem Hinweis, WO man
// anfängt (das fehlt bei TITLES komplett).
// `status(save)` liefert 'offen' (verfügbar, noch nicht erledigt), 'fertig'
// (abgeschlossen) oder 'gesperrt' (Bedingung noch nicht erfüllt). Kein
// eigenes Speicherfeld nötig — liest ausschließlich vorhandene save.*-Werte,
// exakt wie TITLES. `hint(save)` liefert seit i18n-Etappe 2 {key,vars} statt
// eines fertigen Strings — render() übersetzt.
const ALMANAC = [
  {
    id: 'fliegen', icon: '🧹', nameKey: 'almanac.fliegen.name',
    status: (s) => (s.besen ? 'fertig' : 'offen'),
    hint: (s) => (s.besen ? { key: 'almanac.fliegen.done' } : { key: 'almanac.fliegen.todo' }),
  },
  {
    id: 'hippogreif', icon: '🦅', nameKey: 'almanac.hippogreif.name',
    status: (s) => (s.mounts.hippo ? 'fertig' : 'offen'),
    hint: (s) => (s.mounts.hippo ? { key: 'almanac.hippogreif.done' } : { key: 'almanac.hippogreif.todo' }),
  },
  {
    id: 'thestral', icon: '💀', nameKey: 'almanac.thestral.name',
    status: (s) => (s.mounts.thestral ? 'fertig' : (s.seenDeath ? 'offen' : 'gesperrt')),
    hint: (s) => (s.mounts.thestral
      ? { key: 'almanac.thestral.done' }
      : s.seenDeath ? { key: 'almanac.thestral.visible' } : { key: 'almanac.thestral.locked' }),
  },
  {
    id: 'einhorn', icon: '🦄', nameKey: 'almanac.einhorn.name',
    status: (s) => (s.mounts.einhorn ? 'fertig' : 'offen'),
    hint: (s) => (s.mounts.einhorn ? { key: 'almanac.einhorn.done' } : { key: 'almanac.einhorn.todo' }),
  },
  {
    id: 'begleiter', icon: '🐾', nameKey: 'almanac.begleiter.name',
    status: (s) => (s.begleiter.frei.length >= 3 ? 'fertig' : 'offen'),
    hint: (s) => ({ key: 'almanac.begleiter.hint', vars: { n: s.begleiter.frei.length } }),
  },
  {
    id: 'fero', icon: '💰', nameKey: 'almanac.fero.name',
    status: (s) => (s.quests.feroSammler ? 'fertig' : 'offen'),
    hint: (s) => (s.quests.feroSammler ? { key: 'almanac.fero.done' } : { key: 'almanac.fero.todo' }),
  },
  {
    id: 'wilderer', icon: '🏕️', nameKey: 'almanac.wilderer.name',
    status: () => 'offen',
    hint: (s) => ({ key: 'almanac.wilderer.hint', vars: { n: s.wild.befreit || 0 } }),
  },
  {
    id: 'duell', icon: '⚔️', nameKey: 'almanac.duell.name',
    status: () => 'offen',
    hint: () => ({ key: 'almanac.duell.hint' }),
  },
  {
    id: 'regionen', icon: '🌋', nameKey: 'almanac.regionen.name',
    status: (s) => {
      const n = [s.siegel.drache, s.siegel.frost, s.siegel.hain, s.siegel.tiefe].filter((v) => v === 1).length;
      return n === 4 ? 'fertig' : 'offen';
    },
    hint: (s) => {
      const n = [s.siegel.drache, s.siegel.frost, s.siegel.hain, s.siegel.tiefe].filter((v) => v === 1).length;
      return { key: 'almanac.regionen.hint', vars: { n } };
    },
  },
  {
    id: 'heiligtuemer', icon: '☠️', nameKey: 'almanac.heiligtuemer.name',
    status: (s) => {
      const n = [s.hallows.stab, s.hallows.umhang, s.hallows.stein].filter((v) => v === 1).length;
      return n === 3 ? 'fertig' : 'offen';
    },
    hint: (s) => {
      const n = [s.hallows.stab, s.hallows.umhang, s.hallows.stein].filter((v) => v === 1).length;
      return { key: 'almanac.heiligtuemer.hint', vars: { n } };
    },
  },
  {
    id: 'animagus', icon: '🐦', nameKey: 'almanac.animagus.name',
    status: (s) => (s.animagus.gelernt ? 'fertig' : (s.heim.kate ? 'offen' : 'gesperrt')),
    hint: (s) => (s.animagus.gelernt
      ? { key: 'almanac.animagus.done', vars: { form: t(`form.${s.animagus.form}`) } }
      : s.heim.kate ? { key: 'almanac.animagus.todo' } : { key: 'almanac.animagus.locked' }),
  },
  {
    id: 'dunklerPfad', icon: '🌑', nameKey: 'almanac.dunklerPfad.name',
    status: (s) => (s.dunkel.buch ? 'fertig' : 'offen'),
    hint: (s) => (s.dunkel.buch
      ? { key: 'almanac.dunklerPfad.done', vars: { pfad: t(s.dunkel.pfad === 'dunkel' ? 'path.dark' : 'path.light') } }
      : { key: 'almanac.dunklerPfad.todo' }),
  },
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
  const titlesList = document.getElementById('mm-titles-list');
  const almanacList = document.getElementById('mm-almanac-list');

  let isOpen = false;
  let lastPos = null;
  const dotById = {};

  const playerDot = document.createElement('div');
  playerDot.className = 'mm-player-dot';
  worldEl.appendChild(playerDot);

  function isDiscovered(lm) {
    return lm.alwaysVisible || save.map.discovered.includes(lm.id);
  }

  // "Noch offen: 9 Schnätze, 3 Artefakte, 2 Rätsel." — die einzelnen
  // Fragmente kommen aus progress.js bereits als {key,vars}-Liste (siehe
  // dortiger Kommentar), hier nur noch übersetzen + verbinden.
  function joinMissing(list) {
    return list.map((m) => t(m.key, m.vars)).join(', ');
  }

  // Nicht entdeckte Landmarken bekommen KEINEN Punkt (Plan B2: "keine
  // Spoilerkarte") — Punkte werden erst beim ersten Entdecken angelegt und
  // danach nie wieder entfernt (Entdeckung ist dauerhaft).
  function render(progress) {
    chapterEl.textContent = t(progress.chapterKey);
    primaryTitle.textContent = t(progress.primary.titleKey);
    const descVars = progress.primary.descKey === 'progress.primary.hauspokal.missing'
      ? { missing: joinMissing(progress.primary.descVars.missing) }
      : progress.primary.descVars;
    primaryDesc.textContent = t(progress.primary.descKey, descVars);

    secondaryList.replaceChildren();
    for (const s of progress.secondary) {
      const li = document.createElement('li');
      li.textContent = `${t(s.titleKey)} — ${t(s.descKey, s.descVars)}`;
      secondaryList.appendChild(li);
    }
    nextHintEl.textContent = t(progress.nextHintKey);

    titlesList.replaceChildren();
    for (const ti of TITLES) {
      const earned = ti.earned(save);
      const badge = document.createElement('div');
      badge.className = earned ? 'mm-title-badge' : 'mm-title-badge mm-title-locked';
      const icon = document.createElement('span');
      icon.className = 'mm-title-icon';
      icon.textContent = earned ? ti.icon : '🔒';
      const text = document.createElement('div');
      text.className = 'mm-title-text';
      const name = document.createElement('div');
      name.className = 'mm-title-name';
      name.textContent = t(ti.nameKey);
      const desc = document.createElement('div');
      desc.className = 'mm-title-desc';
      desc.textContent = t(ti.descKey);
      text.append(name, desc);
      badge.append(icon, text);
      titlesList.appendChild(badge);
    }

    almanacList.replaceChildren();
    for (const a of ALMANAC) {
      const st = a.status(save);
      const badge = document.createElement('div');
      badge.className = 'mm-title-badge mm-alm-badge'
        + (st === 'gesperrt' ? ' mm-title-locked' : '')
        + (st === 'fertig' ? ' mm-alm-done' : '');
      const icon = document.createElement('span');
      icon.className = 'mm-title-icon';
      icon.textContent = st === 'gesperrt' ? '🔒' : a.icon;
      const text = document.createElement('div');
      text.className = 'mm-title-text';
      const name = document.createElement('div');
      name.className = 'mm-title-name';
      name.textContent = st === 'fertig' ? `${t(a.nameKey)} ✓` : t(a.nameKey);
      const desc = document.createElement('div');
      desc.className = 'mm-title-desc';
      const h = a.hint(save);
      desc.textContent = t(h.key, h.vars);
      text.append(name, desc);
      badge.append(icon, text);
      almanacList.appendChild(badge);
    }

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
        if (lm.labelDy) label.style.top = `${-6 + lm.labelDy}px`;
        dot.appendChild(label);
        worldEl.appendChild(dot);
        entry = { dot, label };
        dotById[lm.id] = entry;
      }
      // Bugfix (i18n-Etappe 2): label.textContent wurde bisher nur beim
      // ERSTEN Rendern gesetzt — ein 'alwaysVisible'-Punkt (z.B. Schloss)
      // entsteht schon vor jedem Sprachwechsel und blieb dann für immer auf
      // der ursprünglichen Sprache stehen, weil render() ihn nie erneut
      // anfasste. Jetzt bei jedem Aufruf neu übersetzt, wie alle anderen
      // Texte hier auch.
      entry.label.textContent = t(lm.nameKey);
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
            hud?.showToast(t('mm.discovered', { name: t(lm.nameKey) }), 3);
          }
        }
      }
      if (isOpen) render(resolveProgress(save));
    },
  };
}
