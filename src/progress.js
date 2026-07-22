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
      id: 'katze', title: 'Die verlorene Katze',
      description: 'Musch ist gefunden — bring sie zurück zu Lena.', landmarkId: null,
    });
  }
  if (quests.kraeuterStarted === 1 && quests.kraeuterDone !== 1) {
    secondary.push({
      id: 'kraeuter', title: 'Kräuter für den Kessel',
      description: `Leuchtkraut für Barnaby sammeln (${quests.kraeuter || 0}/${KRAEUTER_TOTAL}).`, landmarkId: null,
    });
  }
  if (kateOwned && !animagusLearned && secondary.length < 2) {
    secondary.push({
      id: 'animagus', title: 'Trank der zweiten Gestalt',
      description: 'Zutaten brauen und im Sturm am Steinkreis das Ritual wagen.', landmarkId: 'steinkreis',
    });
  }

  if (!hauspokalWon) {
    const missing = [];
    if (collected < SCHNATZ_TOTAL) missing.push(`${SCHNATZ_TOTAL - collected} Schnätze`);
    if (art < ARTIFACT_TOTAL) missing.push(`${ARTIFACT_TOTAL - art} Artefakte`);
    if (raetselDone < 4) missing.push(`${4 - raetselDone} Rätsel`);
    let nextHint = 'Erkunde das Schlossgelände und sammle goldene Schnätze.';
    let landmarkId = null;
    if (!pz.lied) { nextHint = 'Löse das Lied der Steine im Steinkreis.'; landmarkId = 'steinkreis'; }
    else if (!pz.sterne) { nextHint = 'Beobachte nachts den Sternenhimmel am Astronomieturm.'; landmarkId = 'astronomieturm'; }
    else if (art < ARTIFACT_TOTAL) { nextHint = 'Suche nach den verborgenen Artefakten.'; }
    return {
      chapter: 'Der Hauspokal',
      primary: {
        id: 'hauspokal', title: 'Den Hauspokal gewinnen',
        description: missing.length ? `Noch offen: ${missing.join(', ')}.` : 'Alles gesammelt — der Hauspokal ist nah.',
        landmarkId, completed: false,
      },
      secondary, nextHint,
    };
  }

  if (!laterneWon) {
    return {
      chapter: 'Das Nebelmoor',
      primary: {
        id: 'nebelmoor', title: 'Die Seelenlaterne bergen',
        description: `Seelenlichter zur Krypta bringen (${lichterCount}/${LICHTER_TOTAL}).`,
        landmarkId: 'nebelmoor', completed: false,
      },
      secondary, nextHint: 'Suche die Seelenlichter im Nebelmoor und bring sie zur Krypta.',
    };
  }

  if (hallowsUnlocked && hallowsCount < 3) {
    return {
      chapter: 'Die Heiligtümer des Todes',
      primary: {
        id: 'heiligtuemer', title: 'Meister des Todes werden',
        description: `Heiligtümer gefunden (${hallowsCount}/3).`,
        landmarkId: null, completed: false,
      },
      secondary, nextHint: 'Die Heiligtümer des Todes warten irgendwo im Schlossgelände.',
    };
  }

  return {
    chapter: hallowsUnlocked ? 'Meister des Todes' : 'Nach dem Hauspokal',
    primary: {
      id: 'erkundung', title: hallowsUnlocked ? 'Alle drei Heiligtümer vereint' : 'Weiter erkunden',
      description: hallowsUnlocked
        ? 'Hauspokal, Seelenlaterne und alle drei Heiligtümer sind dein.'
        : 'Hauspokal und Seelenlaterne sind dein — erkunde den Rest der Welt.',
      landmarkId: null, completed: true,
    },
    secondary,
    nextHint: secondary.length ? 'Es gibt noch offene Nebenaufgaben in der Welt.' : 'Genieße die freie Erkundung von Hogwarts.',
  };
}
