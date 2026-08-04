// i18n (Nutzerwunsch 2026-08-04: "wie schnell können wir einen Button mit
// Englisch hinzufügen?" — Antwort: nicht schnell, ~500 fest einprogrammierte
// deutsche Texte über 30 Dateien, kein bestehendes System. Hier beginnt die
// Komplettübersetzung, bewusst in Etappen (siehe Kommentar unten). Diese
// erste Etappe deckt die feste Menü-/HUD-/Karten-Hülle ab — alles, was der
// Spieler sieht, BEVOR überhaupt eine der ~30 Gameplay-Dateien (Dialoge,
// Quests, Toasts) zu Wort kommt.
//
// Eigener localStorage-Schlüssel, NICHT Teil von save.js: die Sprache ist
// eine Anzeige-Präferenz, kein Spielfortschritt — sie soll beim Umschalten
// nie eine Save-Migration auslösen und beim "Fortschritt zurücksetzen"
// unangetastet bleiben.
const STORAGE_KEY = 'hogwarts3d-lang';

let lang = localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'de';

// Etappenplan (wird mit jeder weiteren Etappe hier fortgeschrieben):
//  Etappe 1 (diese): Startmenü, Steuerungs-Grid, Karte des Rumtreibers
//    (Kopfzeilen/Legende/Almanach-Rahmen), Bestätigungsdialog.
//  Etappe 2+: HUD-Laufzeittexte (Toasts, Dialoge), dann Inhalt (NPCs,
//    Quests, Rätsel) — datei- oder systemweise, wie der Rest des Projekts.
const DICT = {
  de: {
    'menu.subtitle': 'Ein begehbares 3D-Schloss · Fan-Projekt',
    'menu.loading': 'Die Welt wird erschaffen …',
    'menu.errorBuild': 'Beim Erschaffen der Welt ist etwas schiefgelaufen.',
    'menu.reload': 'Neu laden',
    'ctrl.move': 'Bewegen',
    'ctrl.mouseKey': 'Maus',
    'ctrl.look': 'Umsehen',
    'ctrl.mouseBtnKey': 'Maustaste',
    'ctrl.cast': 'Zaubern',
    'ctrl.interact': 'Interagieren',
    'menu.mapHintHtml': '🗺️ Nach dem Start öffnet <b>J</b> die Karte des Rumtreibers mit deinen Aufgaben.',
    'menu.moreControls': 'Weitere Steuerung',
    'ctrl.sprint': 'Rennen (beim Schwimmen: abtauchen)',
    'ctrl.spaceKey': 'Leertaste',
    'ctrl.jump': 'Springen',
    'ctrl.broom': 'Besen auf-/absteigen',
    'ctrl.mount': 'Hippogreif/Thestral/Einhorn rufen/aufsitzen/absitzen',
    'ctrl.companion': 'Begleiter rufen/wegschicken (Musch/Piniva/Grabbel)',
    'ctrl.map': 'Karte des Rumtreibers & Aufgaben öffnen/schließen',
    'ctrl.cloak': 'Umhang der Unsichtbarkeit an/aus (nach dem Diebstahl, auch per Mausrad wählbar)',
    'ctrl.doubleSpaceKey': '2× Leertaste',
    'ctrl.takeoff': 'Beritten abheben (Hippogreif/Thestral)',
    'ctrl.wheelKey': 'Rad / 1-9',
    'ctrl.spellwheel': 'Zauber wählen — alle freigeschalteten Sprüche und Heiligtümer, danach Linksklick zum Wirken',
    'ctrl.patronus': 'Expecto Patronum wählen (nach dem Hauspokal)',
    'ctrl.darkspells': 'Avada Kedavra / Crucio / Imperio / Dunkles Mal wählen (nach dem Aschenen Grimoire, nur dunkler Pfad)',
    'ctrl.hallowsKey': '· (nur Rad)',
    'ctrl.hallows': 'Elderstab / Stein der Wiederkehr — erscheinen automatisch im Spruchrad, sobald gefunden (rein passive Boni)',
    'ctrl.iceblitz': 'Eisblitz wählen (nach dem Eisaltar in den Frostzinnen), danach Linksklick zum Wirken',
    'ctrl.animagus': 'Animagus-Verwandlung an/aus (nach dem Ritual im Sturm am Steinkreis); als Wolf: V-Doppeldruck = Biss',
    'ctrl.time': 'Tageszeit vorspulen',
    'ctrl.lumos': 'Lumos (Lichtzauber)',
    'ctrl.sound': 'Ton an / aus',
    'ctrl.fps': 'FPS anzeigen',
    'ctrl.escKey': 'Esc',
    'ctrl.escape': 'Menü',
    'menu.start': 'Spiel starten',
    'menu.continue': 'Weiterspielen',
    'menu.btnSound': 'Ton: {state}',
    'menu.btnMusic': 'Musik: {state}',
    'menu.btnPeaceful': 'Kreaturen: {state}',
    'menu.btnGrafik': 'Grafik: {state}',
    'menu.btnAnimagusForm': 'Tierform: {state}',
    'menu.btnLang': 'Sprache: {name}',
    'menu.btnMap': 'Karte & Aufgaben',
    'menu.btnExport': 'Spielstand exportieren',
    'menu.btnImport': 'Spielstand importieren',
    'menu.btnRestoreBackup': 'Letzte Sicherung wiederherstellen',
    'menu.btnReset': 'Fortschritt zurücksetzen',
    'menu.footnote': 'Inoffizielles, nicht-kommerzielles Fan-Projekt · komplett prozedural erzeugt · läuft lokal im Browser',
    'state.on': 'an',
    'state.off': 'aus',
    'state.tame': 'zahm',
    'state.wild': 'wild',
    'grafik.schnell': 'Schnell',
    'grafik.schoen': 'Schön',
    'grafik.episch': 'Episch',
    'form.rabe': 'Rabe',
    'form.katze': 'Katze',
    'form.wolf': 'Wolf',
    'lang.de': 'Deutsch',
    'lang.en': 'English',
    'confirm.yes': 'Ja, fortfahren',
    'confirm.no': 'Abbrechen',
    'mm.title': 'Karte des Rumtreibers',
    'mm.mainTask': 'Hauptaufgabe',
    'mm.sideTasks': 'Nebenaufgaben',
    'mm.legend': 'Legende',
    'mm.legendDiscovered': 'Entdeckter Ort',
    'mm.legendTarget': 'Aktuelles Ziel',
    'mm.legendYou': 'Du',
    'mm.next': 'Als Nächstes',
    'mm.titlesHeading': 'Titel',
    'mm.almanachHeading': 'Almanach',
    'mm.almanachSub': 'Alles, was die Welt sonst noch zu bieten hat.',
    'mm.footer': 'J / Esc — Karte schließen',
  },
  en: {
    'menu.subtitle': 'A walkable 3D castle · fan project',
    'menu.loading': 'Building the world …',
    'menu.errorBuild': 'Something went wrong while building the world.',
    'menu.reload': 'Reload',
    'ctrl.move': 'Move',
    'ctrl.mouseKey': 'Mouse',
    'ctrl.look': 'Look around',
    'ctrl.mouseBtnKey': 'Mouse button',
    'ctrl.cast': 'Cast',
    'ctrl.interact': 'Interact',
    'menu.mapHintHtml': "🗺️ After starting, <b>J</b> opens the Marauder's Map with your objectives.",
    'menu.moreControls': 'More controls',
    'ctrl.sprint': 'Sprint (while swimming: dive)',
    'ctrl.spaceKey': 'Space',
    'ctrl.jump': 'Jump',
    'ctrl.broom': 'Mount/dismount broom',
    'ctrl.mount': 'Call/mount/dismount Hippogriff, Thestral, or Unicorn',
    'ctrl.companion': 'Call/dismiss companion (Musch, Piniva, Grabbel)',
    'ctrl.map': "Open/close the Marauder's Map & objectives",
    'ctrl.cloak': 'Toggle the Invisibility Cloak (after obtaining it — also selectable via the mouse wheel)',
    'ctrl.doubleSpaceKey': '2× Space',
    'ctrl.takeoff': 'Take off while mounted (Hippogriff/Thestral)',
    'ctrl.wheelKey': 'Wheel / 1-9',
    'ctrl.spellwheel': 'Select a spell — all unlocked spells and Hallows, then left-click to cast',
    'ctrl.patronus': 'Select Expecto Patronum (after winning the House Cup)',
    'ctrl.darkspells': 'Select Avada Kedavra / Crucio / Imperio / Dark Mark (after the Ashen Grimoire, dark path only)',
    'ctrl.hallowsKey': '· (wheel only)',
    'ctrl.hallows': 'Elder Wand / Resurrection Stone — appear automatically on the spell wheel once found (passive bonuses only)',
    'ctrl.iceblitz': 'Select Ice Blitz (after the ice altar in the Frostspires), then left-click to cast',
    'ctrl.animagus': 'Toggle Animagus form (after the ritual in the storm at the stone circle); as a wolf: double-tap V = bite',
    'ctrl.time': 'Fast-forward time of day',
    'ctrl.lumos': 'Lumos (light spell)',
    'ctrl.sound': 'Sound on/off',
    'ctrl.fps': 'Show FPS',
    'ctrl.escKey': 'Esc',
    'ctrl.escape': 'Menu',
    'menu.start': 'Start Game',
    'menu.continue': 'Continue',
    'menu.btnSound': 'Sound: {state}',
    'menu.btnMusic': 'Music: {state}',
    'menu.btnPeaceful': 'Creatures: {state}',
    'menu.btnGrafik': 'Graphics: {state}',
    'menu.btnAnimagusForm': 'Animal form: {state}',
    'menu.btnLang': 'Language: {name}',
    'menu.btnMap': 'Map & Objectives',
    'menu.btnExport': 'Export save',
    'menu.btnImport': 'Import save',
    'menu.btnRestoreBackup': 'Restore last backup',
    'menu.btnReset': 'Reset progress',
    'menu.footnote': 'Unofficial, non-commercial fan project · fully procedurally generated · runs locally in the browser',
    'state.on': 'on',
    'state.off': 'off',
    'state.tame': 'tame',
    'state.wild': 'wild',
    'grafik.schnell': 'Fast',
    'grafik.schoen': 'Nice',
    'grafik.episch': 'Epic',
    'form.rabe': 'Raven',
    'form.katze': 'Cat',
    'form.wolf': 'Wolf',
    'lang.de': 'Deutsch',
    'lang.en': 'English',
    'confirm.yes': 'Yes, continue',
    'confirm.no': 'Cancel',
    'mm.title': "Marauder's Map",
    'mm.mainTask': 'Main objective',
    'mm.sideTasks': 'Side objectives',
    'mm.legend': 'Legend',
    'mm.legendDiscovered': 'Discovered location',
    'mm.legendTarget': 'Current target',
    'mm.legendYou': 'You',
    'mm.next': 'Up next',
    'mm.titlesHeading': 'Titles',
    'mm.almanachHeading': 'Almanac',
    'mm.almanachSub': 'Everything else the world has to offer.',
    'mm.footer': 'J / Esc — close map',
  },
};

export function t(key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.de[key] ?? key;
  if (vars) for (const k in vars) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

export function getLang() { return lang; }

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'de';
  localStorage.setItem(STORAGE_KEY, lang);
  applyStaticI18n();
}

export function cycleLang() {
  setLang(lang === 'de' ? 'en' : 'de');
  return lang;
}

// Läuft über jedes Element mit data-i18n/data-i18n-html — reine Textknoten
// bzw. die Handvoll Stellen mit eingebettetem <b> (z.B. "<b>J</b> öffnet …").
// innerHTML ist hier unbedenklich: der Text kommt ausschließlich aus DICT
// oben, nie aus Nutzereingabe.
export function applyStaticI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
}
