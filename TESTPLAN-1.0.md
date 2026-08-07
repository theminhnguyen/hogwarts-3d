# Manueller Testplan — Hogwarts 3D 1.0-Polish

Kurzer, ausführbarer Testplan für den manuellen Release-Check (Sonnet-5-Polish,
Meilenstein D3). Vor jedem Punkt `node dev-server.mjs` starten und
http://localhost:8123 öffnen, sofern nicht anders angegeben.

## 1. Neuer Spielstand

- [ ] `localStorage` leeren (oder privates Fenster) und die Seite laden.
- [ ] Startmenü zeigt nur die vier Grundaktionen (`WASD`, Maus, Maustaste, `E`)
      plus den dezenten `J`-Hinweis — **keine** lange Steuerungsliste, keine
      Fortschritts-Banner.
- [ ] „Weitere Steuerung" aufklappen zeigt die vollständige Tastenliste inkl. `J`.
- [ ] „Spiel starten" klicken → Toast „Sieh dich um und folge dem goldenen
      Hinweis." erscheint einmalig.
- [ ] Zu einem NPC oder Objekt mit Interact-Prompt laufen → einmaliger Hinweis
      „Drücke E, um zu interagieren."
- [ ] In die Nähe einer Kreatur (z. B. Wichtel) laufen → einmaliger Hinweis zum
      Zaubern (Mausrad/1-9 + Linksklick).
- [ ] Ersten Schnatz einsammeln → einmaliger Hinweis auf `J`/Karte.
- [ ] `J` drücken → Karte öffnet sich, zeigt Kapitel „Der Hauspokal" und
      mindestens Schloss + Großer Saal auf der Kartenfläche. `J` erneut (oder
      `Esc`) schließt sie wieder, ohne dass das Pausenmenü aufgeht.

## 2. Alt-/Midgame-Save

- [ ] Einen älteren Save (vor Save-Schema v6, ohne `tutorial`/`map`/`ui`-Felder)
      laden oder einen bestehenden Fortschritts-Save aus einer früheren Version
      einspielen.
- [ ] Seite lädt ohne Konsolenfehler; Menü zeigt den vorhandenen
      Fortschrittsstatus (Pfad/Mounts/Heiligtümer, falls zutreffend).
- [ ] Karte (`J`) öffnet sich fehlerfrei; nur tatsächlich schon besuchte Orte
      sind sichtbar — keine Orte, die vorher nie betreten wurden.
- [ ] Vorhandene Queststände (z. B. laufende Katze-/Kräuter-Quest) erscheinen
      korrekt als Nebenaufgaben auf der Karte.

## 3. Endgame-Save

- [ ] Save mit gewonnenem Hauspokal, geborgener Seelenlaterne, allen drei
      Heiligtümern, gezähmten Mounts, freigeschaltetem Animagus und aktivem
      Begleiter laden.
- [ ] Alle Sprüche (inkl. Expecto Patronum, dunkler Pfad falls zutreffend,
      Elderstab/Stein passiv im Spruchrad) weiterhin wirkbar.
- [ ] Mounts rufen/reiten (`R`), Begleiter rufen (`G`), Animagus-Verwandlung
      (`V`) funktionieren unverändert — keine neuen Sperren.
- [ ] Karte zeigt Kapitel „Meister des Todes" (bzw. passendes Abschlusskapitel)
      ohne Fehler.

## 4. Export → Import

- [ ] Im Pausenmenü „Spielstand exportieren" klicken, Datei speichern.
- [ ] `localStorage` leeren bzw. in einem frischen Browserprofil/-fenster neu
      laden (frischer Spielstand).
- [ ] „Spielstand importieren" klicken, exportierte Datei wählen, Bestätigung
      annehmen → Seite lädt neu.
- [ ] Repräsentative Werte (Gold, gesammelte Schnätze, Hauspokal-/Laterne-
      Status, Heiligtümer, Animagus-Form) stimmen exakt mit dem Originalstand
      überein.

## 5. Fehlerpfade verändern nichts

- [ ] Eine ungültige Datei (z. B. eine `.txt`-Datei oder eine über 250 KB
      große Datei) importieren → klare Fehlermeldung als Toast, Spielstand
      unverändert, keine Weiterleitung/Reload.
- [ ] „Fortschritt zurücksetzen" klicken, im Bestätigungsdialog „Abbrechen"
      wählen → Spielstand komplett unverändert (Konsole/`localStorage`
      geprüft).

## 6. Layout-Größen

- [ ] Browserfenster auf 1280×720 stellen: Startmenü, Karte des Rumtreibers
      und HUD (Herzen, Zähler, Spellbar) überlappen sich nicht und sind
      vollständig lesbar.
- [ ] Dasselbe bei 1920×1080 wiederholen.

## 7. Konsole

- [ ] Beim Laden (frischer Save), beim Öffnen/Schließen der Karte, bei
      Export/Import und beim Zurücksetzen: keine neuen Fehler in der
      Browser-Konsole (Warnungen aus Drittanbieter-Code ausgenommen — hier
      gibt es keine).

## 8. Die vier neuen Regionen jenseits des Bergrings (PLAN-EPISCHE-WELT.md E4-E11)

- [ ] Alle vier Regionen (Aschenklamm, Frostzinnen, Silberhain, Schwarzwasser)
      sind zu Fuß UND im Flug erreichbar; jede blendet beim Betreten ihre
      eigene Atmosphäre (Himmelsfarbe/Nebel/Sound) über ~4s sanft ein.
- [ ] Aschenklamm: Ei aus dem Nest stehlen weckt Aschenschwinge; Stupor
      unterbricht seinen Feuerspeier während des Telegraphs, Incendio bleibt
      wirkungslos; Sieg gibt Herz-Upgrade, 3× Drachenschuppe, Titel
      „Drachenbezwinger"; danach ist der Feuerschutztrank am Kessel braubar.
- [ ] Frostzinnen: Eisaltar-Rätsel schaltet Eisblitz (Taste `I`, auch per
      Mausrad/Spellbar) frei; Rimefell besiegbar; Sieg gibt Herz-Upgrade,
      3× Frostkristall, Titel „Frostbezwinger"; Eisatem-Trank danach braubar.
- [ ] Silberhain: Feenlicht-Pilzring-Rätsel (Lumos + Näherung) lösbar; Einhorn
      lässt sich zähmen und wie Hippogreif/Thestral rufen/reiten (`R`); auf
      dem dunklen Pfad flieht es, außer der Feenlichttrank wirkt; Truhe gibt
      3× Mondsilber, Zähmung den Titel „Einhornfreund".
- [ ] Schwarzwasser: Hebel-Tauchrätsel in der versunkenen Ruine lösbar;
      Grindylows greifen unter Wasser an; Sieg/Abschluss gibt Herz-Upgrade,
      3× Tiefenperle, Titel „Tiefenbezwinger"; Tiefenatem-Trank danach braubar.
- [ ] Jede Region ist allein mit den bis zu ihrem Meilenstein verfügbaren
      Sprüchen lösbar — kein Fortschritt in einer anderen Region ist
      Voraussetzung (Region-Verzahnungen sind nur erleichternde Boni).
- [ ] „Die vier Siegel": Nebenaufgabe erscheint auf der Karte erst ab dem
      ersten Siegel, zeigt den korrekten Zähler (n/4), verschwindet wieder
      nach dem Sternentor.
- [ ] Sternentor beim Schloss bleibt unsichtbar/kein Interact-Prompt, bis
      alle 4 Siegel vorliegen; danach Interakt löst Feuerwerk + Gold/Ruf +
      Titel „Hüter der vier Reiche" genau einmal aus (kein Doppel-Reward bei
      erneutem Betreten); Zustand übersteht Neuladen.
- [ ] Weltensammler: Fero bietet den Tausch erst an, wenn alle 4 seltenen
      Zutaten (Schuppe/Frostkristall/Mondsilber/Tiefenperle) gleichzeitig
      vorhanden sind; Tausch verbraucht je 1, gibt Gold/Ruf/Titel „Weltensammler"
      genau einmal; danach fester Wiederholungs-Dialog.
- [ ] Karte des Rumtreibers: die 4 neuen Regionen erscheinen als Landmarken
      erst nach dem ersten Betreten (keine Spoilerkarte vorher).
- [ ] Alle 4 fernen Horizont-Silhouetten (Drache, Eisgipfel, Silberbaum,
      Leuchtturm-Leuchtfeuer) sind aus großer Entfernung sichtbar und
      verschwinden nie hinter dem Bergring.
- [ ] „Fortschritt zurücksetzen" setzt auch `siegel.*`, alle 4 Region-Flags
      und die Fero-Sammlerquest zurück — Karte/Statuszeile zeigen danach
      wieder den Ausgangszustand.
- [ ] Ein Save von vor Schema v7 (ohne Region-/Siegel-Felder) lädt fehlerfrei
      und bekommt alle neuen Felder mit sicheren Defaults (siehe
      `tests/save.test.mjs`).

## 9. Der Dunkle Lord — die Schattenfeste (PLAN-DER-DUNKLE-LORD.md V1-V8)

- [ ] Solange das harte Gate (Hauspokal + Seelenlaterne + alle 3 Heiligtümer
      + Sternentor) nicht vollständig erfüllt ist, bleibt die Ward-Barriere
      vor der Schattenfeste geschlossen; der Prüfstein nennt in seinem
      Dialog, was noch fehlt.
- [ ] Sobald das Gate erfüllt ist: Ward-Barriere zerfällt sichtbar (Toast +
      Partikel-Effekt), der Prüfstein zeigt die weiche Buff-Checkliste
      (Eisblitz, Expecto Patronum, Umhang/Stein/Elderstab angelegt, volle
      Herzen), der Schlossgeist warnt ab sofort mit höchster Priorität
      namentlich vor dem Dunklen Lord und listet exakt die noch fehlenden
      Buffs.
- [ ] Die 5. ferne Horizont-Silhouette (schwarzer, gezackter Turm über der
      Schattenfeste) ist von Spielbeginn an sichtbar — auch lange bevor das
      Gate erfüllt ist.
- [ ] Betreten der Arena bei offenem Tor löst `rise()` aus; Phase 1 (Schild
      aus schwarzem Feuer) lässt sich nur mit Eisblitz durchbrechen — jeder
      andere Spruch prallt wirkungslos ab.
- [ ] Phase 2 (Woge aus 5 Dementoren) ist nur per Expecto Patronum lösbar;
      Stupor/Incendio bleiben wirkungslos gegen die Dementoren selbst.
- [ ] Phase 3: ein Treffer von VORN ohne angelegten Umhang reflektiert
      Schaden auf den Spieler statt den Lord zu treffen; ein Treffer von
      HINTEN (>100° Winkelabweichung) zählt immer, unabhängig vom Umhang.
- [ ] Phase 4: Avada-Kedavra-Telegraph (2,5s) ist deutlich länger als bei
      jedem anderen Boss; ohne angelegten Stein der Wiederkehr endet der
      Fluch tödlich (echter Respawn); mit angelegtem Stein überlebt der
      Spieler einmalig (steinCd-Warnung beachten, falls Stein am selben Tag
      schon verbraucht wurde).
- [ ] Phase 5: HP sinkt spürbar schneller als sie regeneriert NUR mit
      angelegtem Elderstab; ohne Elderstab bleibt die HP-Leiste bei
      realistischer Spielweise praktisch stehen (siehe Balancing-Rechnung in
      PLAN-DER-DUNKLE-LORD.md Abschnitt 8, im V8-Commit real nachgemessen).
- [ ] Verbannungs-Sicherheitsnetz: 90 Sekunden ohne Phasenfortschritt in
      Phase 1/2/3 lösen eine Weißblende + Teleport zurück ins Schloss aus,
      kein Fortschrittsverlust.
- [ ] Sieg (Phase 5, HP auf 0): Toast, +200 Gold, +40 Ruf, Titel „Der wahre
      Meister des Todes" schaltet sich in der Karte des Rumtreibers frei —
      alles genau einmal, kein Doppel-Reward bei erneutem Betreten.
- [ ] Nach dem Sieg zeigt die Karte des Rumtreibers wieder das normale
      Abschluss-Kapitel (kein „Der Dunkle Lord"-Kapitel mehr); Schlossgeist-
      Warnung verschwindet ebenfalls.
- [ ] Ein Save von vor Schema v12 (ohne `lord`-Feld) lädt fehlerfrei mit
      sicheren Defaults (siehe `tests/save.test.mjs`).
- [ ] „Fortschritt zurücksetzen" setzt auch `save.lord` (torOffen/phaseMax/
      besiegt/versuche) zurück — Ward-Barriere ist danach wieder geschlossen.
- [ ] Performance: Turm außen, Arena (auch während Phase 2 mit 5 Dementoren)
      und Turmspitze im Flug bleiben bei ≥55 fps.

## Automatisierte Tests

- [ ] `npm test` läuft vollständig grün — 69 Tests über 7 Dateien
      (Qualitätsplan-Stand):
      - `save.test.mjs`: Save-Normalisierung, Migration, Export/Import,
        rekursive Reset-Vollständigkeit (DEFAULT_SAVE vs. normalizeSave({})).
      - `health.test.mjs`: Herz-Upgrade.
      - `progress.test.mjs`: Objective Resolver.
      - `i18n.test.mjs`: DE/EN-Schlüsselparität, Platzhalter-Konsistenz,
        Umlaut-Heuristik für vergessene Übersetzungen.
      - `interact.test.mjs`: Interakt-Registry (lockedPrompt-Verhalten,
        Reichweiten-Priorität, live Getter für bewegliche NPCs).
      - `marauders-map.test.mjs`: Karten-Datenlogik (ALMANAC/TITLES erreichen
        'fertig', landmarkTrackerInfo(), progress.js-Landmarken existieren).
      - `mirrored-constants.test.mjs`: SCHNATZ_/ARTIFACT_/LICHTER_/
        KRAEUTER_TOTAL aus progress.js gegen ihre echten Quellen geprüft.
