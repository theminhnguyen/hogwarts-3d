// Objective Resolver (Sonnet-5-Polish, Meilenstein B3): eine reine
// Fortschrittsfunktion — liest nur den normalisierten Save, ändert nichts,
// schreibt nichts ins DOM. Einzige Quelle der Wahrheit für "Was ist die
// aktuelle Aufgabe?", genutzt von der Karte (marauders-map.js) UND von
// künftigen Kontext-Hinweisen (tutorial.js).
//
// Bewusst OHNE Import aus puzzles.js/collectibles.js/moor.js: diese Module
// hängen an Three.js/Browser und würden `node --test` unmöglich machen. Die
// festen Gesamtzahlen unten sind daher manuell aus dem jeweiligen Modul
// gespiegelt (siehe Kommentare) und müssen bei einer echten Inhaltsänderung
// dort manuell nachgezogen werden.
//
// i18n (2026-08-04): dieses Modul liefert bewusst KEINE fertigen Texte mehr,
// sondern nur Übersetzungs-SCHLÜSSEL + Variablen (chapterKey/titleKey/
// descKey/descVars/nextHintKey/...). Grund: src/i18n.js braucht echtes
// `localStorage` (Node 25 hat zwar ein globales `localStorage`-Objekt, aber
// `getItem`/`setItem` fehlen ohne `--localstorage-file` und werfen sofort —
// ein Import von i18n.js hier würde also `node --test` crashen lassen,
// genau der Grund, aus dem dieses Modul schon immer ohne Browser-Module
// auskommt (siehe Kommentar oben). Die eigentliche Übersetzung passiert erst
// in marauders-map.js/tutorial.js (beides reine Browser-Module).
const SCHNATZ_TOTAL = 12;   // collectibles.js: SPOTS.length
const ARTIFACT_TOTAL = 4;   // puzzles.js: ARTIFACT_ORDER.length
const LICHTER_TOTAL = 5;    // moor.js: 5 Seelenlichter
const KRAEUTER_TOTAL = 3;   // npc.js: Q2 "Kräuter für den Kessel"

// Priorität folgt der bestehenden Progression (Plan-Abschnitt B3):
// 1. Hauspokal (Schnätze/Artefakte/Rätsel gebündelt)
// 2. Nebelmoor/Seelenlaterne (erst danach inhaltlich relevant)
// 3. Heiligtümer des Todes — NUR wenn hallows.js' echte Freischaltbedingung
//    (Hauspokal gewonnen UND Laterne geborgen, siehe hallows.js
//    hallowsUnlocked()) im Save erfüllt ist.
// 4. Laufende NPC-Nebenquests (Q1 Katze, Q2 Kräuter) sowie Animagus, sobald
//    ihr Status zuverlässig aus dem Save ableitbar ist.
export function resolveProgress(save) {
  const collected = save.collected?.length || 0;
  const art = save.art?.length || 0;
  const pz = save.pz || {};
  const raetselDone = [pz.feuer, pz.garten, pz.lied, pz.sterne].filter(Boolean).length;
  const hauspokalWon = pz.hauspokal === 1;
  const moor = save.moor || {};
  const laterneWon = moor.laterne === 1;
  const lichterCount = moor.lichter?.length || 0;
  const hallows = save.hallows || {};
  const hallowsCount = [hallows.stab, hallows.umhang, hallows.stein].filter((v) => v === 1).length;
  // Gespiegelt aus hallows.js: hallowsUnlocked() = puzzles.finaleWon && moor.laterneCollected.
  const hallowsUnlocked = hauspokalWon && laterneWon;
  const animagusLearned = save.animagus?.gelernt === 1;
  const kateOwned = save.heim?.kate === 1;
  const quests = save.quests || {};

  // Nebenaufgaben: unabhängig vom Hauptkapitel, maximal zwei gleichzeitig
  // (Plan B1: "optional darunter bis zu zwei Nebenaufgaben").
  const secondary = [];
  if (quests.katze === 1) {
    secondary.push({
      id: 'katze', titleKey: 'progress.secondary.katze.title',
      descKey: 'progress.secondary.katze.desc', descVars: {}, landmarkId: null,
    });
  }
  if (quests.kraeuterStarted === 1 && quests.kraeuterDone !== 1) {
    secondary.push({
      id: 'kraeuter', titleKey: 'progress.secondary.kraeuter.title',
      descKey: 'progress.secondary.kraeuter.desc',
      descVars: { n: quests.kraeuter || 0, total: KRAEUTER_TOTAL }, landmarkId: null,
    });
  }
  if (kateOwned && !animagusLearned && secondary.length < 2) {
    secondary.push({
      id: 'animagus', titleKey: 'progress.secondary.animagus.title',
      descKey: 'progress.secondary.animagus.desc', descVars: {}, landmarkId: 'steinkreis',
    });
  }
  // "Die vier Siegel" (E10, Plan 6.7): Meta-Strang über alle 4 neuen Regionen
  // (E4-E7) — erscheint erst, sobald mindestens 1 Siegel errungen ist (vorher
  // wäre der Hinweis nur Spoiler ohne Handlungsmöglichkeit), verschwindet
  // wieder, sobald das Sternentor betreten wurde (finaleWon).
  const siegel = save.siegel || {};
  const siegelCount = [siegel.drache, siegel.frost, siegel.hain, siegel.tiefe].filter((v) => v === 1).length;
  if (siegelCount > 0 && siegel.finaleWon !== 1 && secondary.length < 2) {
    secondary.push({
      id: 'viersiegel', titleKey: 'progress.secondary.viersiegel.title',
      descKey: siegelCount === 4 ? 'progress.secondary.viersiegel.descDone' : 'progress.secondary.viersiegel.descPartial',
      descVars: { n: siegelCount }, landmarkId: null,
    });
  }

  if (!hauspokalWon) {
    // Jeder Eintrag ist selbst schon ein {key,vars}-Paar (z.B. "9 Schnätze")
    // — der Render-Layer übersetzt und verbindet sie (join(', ')), das
    // Trennzeichen selbst ist sprachneutral genug, um hier fest zu bleiben.
    const missing = [];
    if (collected < SCHNATZ_TOTAL) missing.push({ key: 'progress.missing.schnaetze', vars: { n: SCHNATZ_TOTAL - collected } });
    if (art < ARTIFACT_TOTAL) missing.push({ key: 'progress.missing.artefakte', vars: { n: ARTIFACT_TOTAL - art } });
    if (raetselDone < 4) missing.push({ key: 'progress.missing.raetsel', vars: { n: 4 - raetselDone } });
    let nextHintKey = 'progress.nextHint.default';
    let landmarkId = null;
    if (!pz.lied) { nextHintKey = 'progress.nextHint.lied'; landmarkId = 'steinkreis'; }
    else if (!pz.sterne) { nextHintKey = 'progress.nextHint.sterne'; landmarkId = 'astronomieturm'; }
    else if (art < ARTIFACT_TOTAL) { nextHintKey = 'progress.nextHint.artefakte'; }
    return {
      chapterKey: 'progress.chapter.hauspokal',
      primary: {
        id: 'hauspokal', titleKey: 'progress.primary.hauspokal.title',
        descKey: missing.length ? 'progress.primary.hauspokal.missing' : 'progress.primary.hauspokal.done',
        descVars: { missing }, // Liste von {key,vars} — Render-Layer übersetzt+verbindet
        landmarkId, completed: false,
      },
      secondary, nextHintKey,
    };
  }

  if (!laterneWon) {
    return {
      chapterKey: 'progress.chapter.nebelmoor',
      primary: {
        id: 'nebelmoor', titleKey: 'progress.primary.nebelmoor.title',
        descKey: 'progress.primary.nebelmoor.desc', descVars: { n: lichterCount, total: LICHTER_TOTAL },
        landmarkId: 'nebelmoor', completed: false,
      },
      secondary, nextHintKey: 'progress.nextHint.nebelmoor',
    };
  }

  if (hallowsUnlocked && hallowsCount < 3) {
    return {
      chapterKey: 'progress.chapter.heiligtuemer',
      primary: {
        id: 'heiligtuemer', titleKey: 'progress.primary.heiligtuemer.title',
        descKey: 'progress.primary.heiligtuemer.desc', descVars: { n: hallowsCount },
        landmarkId: null, completed: false,
      },
      secondary, nextHintKey: 'progress.nextHint.heiligtuemer',
    };
  }

  // Der Dunkle Lord (V6, Plan-Abschnitt 6): höchste Priorität, sobald das
  // harte Fortschritts-Gate erfüllt ist. Gespiegelt aus schattenfeste.js'
  // hardGateMet() (bewusst dupliziert statt importiert — gleicher Grund wie
  // die anderen Totals oben: schattenfeste.js hängt an Three.js). Da das Gate
  // bereits alle 3 Heiligtümer voraussetzt, kann dieser Zweig den
  // Heiligtümer-Zweig oben strukturell nie überholen — er greift erst danach.
  const lord = save.lord || {};
  const lordGateMet = hauspokalWon && laterneWon && hallowsCount === 3 && siegel.finaleWon === 1;
  if (lordGateMet && lord.besiegt !== 1) {
    let descKey, descVars;
    if (lord.torOffen === 1) {
      if (lord.phaseMax > 0) { descKey = 'progress.primary.dunklerlord.torOffenPhase'; descVars = { phase: lord.phaseMax }; }
      else { descKey = 'progress.primary.dunklerlord.torOffen'; descVars = {}; }
    } else { descKey = 'progress.primary.dunklerlord.torZu'; descVars = {}; }
    return {
      chapterKey: 'progress.chapter.dunklerLord',
      primary: {
        id: 'dunklerlord', titleKey: 'progress.primary.dunklerlord.title',
        descKey, descVars,
        landmarkId: 'schattenfeste', completed: false,
      },
      secondary, nextHintKey: 'progress.nextHint.dunklerlord',
    };
  }

  return {
    chapterKey: hallowsUnlocked ? 'progress.chapter.meisterDesTodes' : 'progress.chapter.nachHauspokal',
    primary: {
      id: 'erkundung', titleKey: hallowsUnlocked ? 'progress.primary.erkundung.titleHallows' : 'progress.primary.erkundung.titleDefault',
      descKey: hallowsUnlocked ? 'progress.primary.erkundung.descHallows' : 'progress.primary.erkundung.descDefault',
      descVars: {}, landmarkId: null, completed: true,
    },
    secondary,
    nextHintKey: secondary.length ? 'progress.nextHint.secondaryOpen' : 'progress.nextHint.freeRoam',
  };
}
