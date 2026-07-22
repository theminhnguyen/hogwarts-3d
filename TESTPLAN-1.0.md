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

## Automatisierte Tests

- [ ] `npm test` läuft vollständig grün (Save-Normalisierung, Export/Import,
      Objective Resolver).
