# Hogwarts 3D 🏰✨

Ein **begehbares 3D-Schloss im Browser** — komplett prozedural erzeugt, ohne ein
einziges externes Asset. Erkunde das Schloss mit Großem Saal, Astronomieturm,
Viadukt, See mit Bootshaus, Verbotenem Wald, Quidditch-Feld, Steinkreis, dem
nebelverhangenen Moor und einer ganzen zweiten Landschaft dahinter — der
Wildmark mit Dorf, Wilderer-Lagern, einer eigenen Kate und wilder Fauna.

Halte durchgehend einen Zauberstab in der Hand und wirke bis zu neun Sprüche
(inklusive dreier verbotener, sobald du dem dunklen Pfad folgst), löse vier
Rätsel und gewinne den Hauspokal, vertreibe Dementoren mit Expecto Patronum,
zähme Hippogreif und Thestral, handle mit dem Wanderhändler Fero, sammle die
drei Heiligtümer des Todes im Duell gegen den Bleichen König, per Diebstahl
und durch Tauchen im See — und werde am Ende sogar selbst zum Animagus:
verwandle dich per Ritual in Rabe, Katze oder Wolf.

> Inoffizielles, nicht-kommerzielles Fan-Projekt. Steht in keiner Verbindung zu
> Warner Bros., J.K. Rowling oder Wizarding World. Alle 3D-Inhalte sind
> eigenständig prozedural generiert.

## Spielen

**[▶ Direkt im Browser spielen](https://theminhnguyen.github.io/hogwarts-3d/)**

Oder lokal: Ordner klonen und `node dev-server.mjs` starten → http://localhost:8123

## Steuerung

| Taste | Aktion |
|---|---|
| `W A S D` | Bewegen |
| Maus | Umsehen |
| `Shift` | Rennen (beim Schwimmen: abtauchen) |
| `Leertaste` | Springen |
| Maustaste | Zaubern (bei Leviosa: gedrückt halten zum Tragen, loslassen zum Fallenlassen) |
| `E` | Interagieren (mit NPCs sprechen, Gegenstände nehmen, Kessel bedienen) |
| `B` | Besen auf-/absteigen (erst nach dem Besen-Fund) |
| `R` | Hippogreif/Thestral rufen, aufsitzen, absitzen |
| `G` | Begleiter rufen/wegschicken (Musch, Eule Piniva oder Niffler Grabbel) |
| `U` | Umhang der Unsichtbarkeit an/aus (nach dem Diebstahl beim Wilderer-Anführer) |
| `J` | Karte des Rumtreibers & Aufgaben öffnen/schließen |
| 2× `Leertaste` | Beritten abheben (Hippogreif/Thestral im Flug) |
| Mausrad / `1`–`9` | Zauber wählen — alle freigeschalteten Sprüche und Heiligtümer, danach Linksklick zum Wirken |
| `5` | Expecto Patronum wählen (erst nach dem Hauspokal) |
| `6` / `7` / `8` / `9` | Avada Kedavra / Crucio / Imperio / Dunkles Mal wählen (nur nach dem Aschenen Grimoire, nur auf dem dunklen Pfad) |
| `V` | Animagus-Verwandlung Mensch ↔ Tier (nach dem Sturm-Ritual); als Wolf: Doppeldruck = Biss |
| `T` | Tageszeit vorspulen |
| `L` | Lumos (Lichtzauber) |
| `M` | Ton an/aus |
| `F` | FPS anzeigen |
| `Esc` | Menü |

Elderstab und Stein der Wiederkehr haben keine eigene Taste (reine
Dauer-Boni) — sie erscheinen automatisch im Spruchrad, sobald gefunden.

## Orientierung

Taste `J` öffnet die **Karte des Rumtreibers**: dein aktuelles Hauptziel,
bis zu zwei laufende Nebenaufgaben, ein stilisierter Kartenausschnitt mit
den Orten, die du bereits besucht hast (unentdeckte Orte fehlen bewusst —
keine Spoilerkarte), und ein kurzer Hinweis, was als Nächstes sinnvoll ist.
`J` oder `Esc` schließt die Karte wieder; während sie offen ist, pausiert
nur deine Steuerung — die Welt läuft im Hintergrund weiter.

Zusätzlich gibt es im Spiel gelegentliche, einmalige Kontext-Hinweise (z. B.
zur ersten Interaktion oder zum ersten Zauberziel) sowie einen kompakten
Fortschrittsstatus im Pausenmenü für bereits laufende Spielstände.

## Spielstand sichern

Dein Fortschritt liegt ausschließlich lokal im Browser (`localStorage`) —
er ist an dieses Gerät und diesen Browser gebunden und geht z. B. beim
Leeren der Browserdaten verloren. Über die Menü-Buttons **„Spielstand
exportieren"** und **„Spielstand importieren"** lässt er sich als JSON-Datei
sichern und auf einem anderen Gerät/Browser wiederherstellen. Import und
Zurücksetzen fragen vorher immer nach Bestätigung und legen automatisch
eine lokale Sicherung an, bevor sie den aktuellen Stand ersetzen.

## Features

- 🏰 Prozedurales Schloss: Großer Saal (begehbar, mit verzauberter Decke und
  schwebenden Kerzen), Bergfried mit Uhr, Astronomieturm mit Bogenbrücke,
  Torhaus mit Fallgitter, Kreuzgang, Viadukt über die Schlucht
- 🌍 Offene Welt: See mit Bootshaus und Steg, Hütte mit Kürbisbeet,
  Quidditch-Feld, Steinkreis, Wälder, Bergpanorama
- 🌗 Voller Tag/Nacht-Zyklus: Sonne, Mond mit Kratern, funkelnde Sterne,
  Wolken, Abendrot, nachts glühende Fenster und Fackeln
- 🪄 Zauberstab in Ego-Perspektive mit vier Sprüchen von Anfang an:
  **Stupor** (Betäubungs-Bolzen), **Incendio** (Feuerball mit Bogenflug,
  entzündet auch Hagrids Kürbisse zu Jack-o'-Laternen), **Wingardium
  Leviosa** (Objekte greifen, tragen und ablegen) und **Lumos**
  (Lichtzauber, vertreibt nachts die Schattengeister) — ein fünfter,
  **Expecto Patronum**, kommt nach dem Hauspokal hinzu
- 🧚 Kreaturen: freche Wichtel, die tagsüber und nachts Schnätze klauen
  (und sie dir wieder abjagen lassen), unheimliche Schattengeister, die nur
  nachts erwachen und vor Lumos fliehen — mit Herz-System, Regeneration und
  heilendem Brunnen im Innenhof (friedlicher Modus für sanfteres Spiel)
- 🧌 Bonus-Miniboss: ein Troll patrouilliert die Schlucht, greift mit
  telegraphiertem Keulenschlag an (Stupor unterbricht ihn), und bewacht
  eine Truhe mit Herz-Upgrade (5 → 6 maximale Herzen)
- 🧩 Vier Rätsel mit eigenen Artefakten: die Feuerprobe am Viadukt, der
  schwebende Garten im Nordgarten, das Lied der Steine am Steinkreis
  (Simon-Says mit Stupor) und das Sternbild des Hirschen am Astronomieturm
  (nur nachts) — jedes mit eigener Truhe und Belohnung
- 🏆 Hauspokal-Finale bei 12/12 Schnätzen und 4/4 Artefakten: Fanfare,
  40 Sekunden Feuerwerk über dem Schloss und ein Patronus-Hirsch, der
  fortan nachts über die Ländereien galoppiert
- 🌫️ Das Nebelmoor: eine dauerhaft trübe Gefahrenzone jenseits des
  Steinkreises mit kahlen Bäumen, Gräbern und driftendem Bodennebel.
  Fünf **Dementoren** schweben dort — immun gegen Stupor und Incendio,
  mit einer Frost-Aura, die Herzen kostet und verlangsamt (Sprinten bleibt
  aber immer schneller als sie). Ihre Leine ans Moor ist absolut: sie
  verlassen es nie
- 🦌 **Expecto Patronum**, der 5. Spruch — freigeschaltet direkt nach dem
  Hauspokal: ein silberner Hirsch galoppiert 26 Meter durch die
  Blickrichtung und vertreibt jeden Dementor in seiner Nähe für 30 Sekunden
- 🏮 Die Seelenlichter-Quest: fünf Irrlichter im Moor einsammeln (sie
  kreisen sichtbar um dich, während du sie trägst — je mehr auf einmal,
  desto aufmerksamer werden die Dementoren) und in der Krypta abgeben.
  Bei allen fünf öffnet sich das Tor zu einer Truhe mit der **Silbernen
  Seelenlaterne** — sie hellt das Moor dauerhaft auf und halbiert die
  Dementoren-Gefahr
- ✨ 12 goldene Schnätze mit HUD-Kompass, kompletter Fortschritt
  (Schnätze, Artefakte, Rätselzustände, Nebelmoor-Fortschritt) wird gespeichert
- 🌦️ Lebendiges Wetter: vier Zustände (klar, bewölkt, Regen, Sturm) mit
  15 Sekunden sanftem Übergang, 700 Regentropfen, Blitz+Donner im Sturm
  (Licht vor Schall), fallende Blätter im Wind — Gras und Bäume schwanken
  spürbar mit der Windstärke
- 🎨 Grafik-Modus „Schön"/„Schnell" (Menü-Button): handgerollter
  Bloom+Farbkorrektur+Kantenglättung-Stack, mit automatischer
  Qualitätsabsenkung bei niedriger Bildrate
- 🏘️ Dorf **Eulenbrück** mit Gasthaus „Zum Singenden Kessel" (begehbar,
  Kamin heilt alle 60 Sekunden), Brunnen, Laternen und Marktständen — dazu
  eine Dampfeisenbahn mit echtem Fahrplan (4 Minuten Umlauf, 2 Tunnel
  durch den Bergring) und ein Wanderhändler, der nur während des
  Bahnhof-Halts dort steht
- 🪴 Gewächshaus mit wippenden Fantasie-Pflanzen und Leuchtkräutern, sowie
  eine Eulerei: ein runder Turm mit vier Eulen, die tagsüber auf ihren
  Sitzstangen dösen und nachts mit glühenden Augen um den Turm kreisen
- 🌳 Die Peitschende Weide auf ihrem Hügel: schlägt bei Annäherung
  telegraphiert zu (sichtbar rechtzeitig ausweichbar) und bewacht eine
  Truhe, die alle Herzen komplett auffrischt
- 🗣️ NPCs mit Dialogen (Taste `E`): vier wandernde Schüler (verschwinden
  nachts), Lena und Wirt Barnaby als Questgeber, ein Schlossgeist mit
  Hinweisen, die sich live nach deinem Spielstand richten, und die Katze
  Musch, die dir folgt, wenn du sie findest. Zwei Nebenquests: *Die
  verlorene Katze* (volle Herzen) und *Kräuter für den Kessel*
  (dauerhafter Frostschutz, verstärkt sich mit der Seelenlaterne)
- 🕷️ Das Spinnennest im Ostwald: vier Riesenspinnen lauern lautlos an
  dichten dunklen Bäumen und jagen bei Annäherung, fünf Spinnennetze
  versperren die Lichtung (drei brennen per Incendio weg) — dahinter eine
  Truhe mit einem weiteren Herz-Upgrade
- 🧹 Ein Rennbesen (Schuppen am Quidditch-Feld) macht dich flugfähig:
  volle Blickrichtungssteuerung, Höhenlimit, automatische Landung über
  Wasser. Ein 12-Ringe-Parcours ums Feld, über die Tribünen und Richtung
  Seeufer belohnt eine Bestzeit unter 75 Sekunden mit dem Titel
  „Quidditch-Ass" und einem goldenen Flug-Schweif
- 🗺️ Die Wildmark: eine ganze zweite Landschaft jenseits des Bergrings —
  Silberauen (weites Grasland), der dunkle Hain Fahlholz, ein
  geheimnisvolles Hügelgrab und die verlassene Wispernde Kate, dazu
  wilde Fauna: Rehe, Hasen, jagende Füchse, buddelnde Niffler,
  Bowtruckles, wilde Hippogreife und zwei wandernde Hexer
- 💰 Gold & Ruf: Wanderhändler Fero steht am Bahnhof während der
  Zug-Haltephase und handelt mit Zutaten/Frischfisch; dein Ruf (−100
  bis +100) färbt Preise und die Reaktion der Schüler, sperrt aber
  nie Inhalte
- 🏹 Wilderer-Lager in der Wildmark: 3 Lager rotieren im Tageszyklus,
  ein Käfig lässt sich befreien (heller Pfad, Gold+Ruf) oder ernten
  (dunkler Pfad, dunkle Essenz) — dazu ein Duellring in Eulenbrück mit
  Fechtmeisterin Ondra
- 🦅 Reittiere: der Hippogreif lässt sich zähmen (langsame Annäherung,
  Verbeugung, Frischfisch von Fero) und trägt dich am Boden UND
  fliegend (2× Leertaste zum Abheben); der Thestral bleibt unsichtbar
  und nur hörbar, bis du selbst dem Tod begegnet bist — danach jederzeit
  zähmbar und der wendigste Flieger im Spiel
- 🏚️ Die Wispernde Kate: eigener Unterschlupf (kaufbar für Gold oder
  geschenkt ab Ruf 30) mit Bett (Zeitsprung + Vollheilung), Braukessel
  mit 5 Rezepten (Flinktrank, Herztrank, Frostbann, Dunkler Sud, Trank
  der zweiten Gestalt) und Trophäenregal — dazu seltene Meteor-Nächte,
  die Sternsplitter in der Wildmark liegen lassen
- 🖤 Der dunkle Pfad: das Aschene Grimoire im Spinnennest schaltet drei
  verbotene Sprüche frei — **Avada Kedavra** (One-Shot), **Crucio**
  (Kanal-Schaden) und **Imperio** (macht Gegner zu Verbündeten) — sowie
  das **Dunkles Mal**, das Dementoren anlockt. Der Pfad ist jederzeit
  umkehrbar: Läuterung am Brunnen im Innenhof macht dich wieder hell.
  Dementoren und viele NPCs reagieren auf deinen Pfad
- 🐾 Begleiter: Katze Musch, Eule Piniva und Niffler Grabbel lassen sich
  rufen (Taste `G`) und beschützen dich unverwundbar im Kampf — Grabbel
  bringt zusätzlich mehr Glitzerstaub von wilden Nifflern mit
- ☠️ Die Heiligtümer des Todes: der **Elderstab** wartet auf ein
  Mitternachts-Duell gegen den Bleichen König am Hügelgrab (Schaden ×2,
  Cooldown ×0.6), der **Umhang der Unsichtbarkeit** muss einem
  Wilderer-Anführer gestohlen werden (Stealth, kein Kampf), und der
  **Stein der Wiederkehr** liegt am tiefsten Grund des Sees (1× pro Tag
  Wiederbelebung bei 0 Herzen). Besitzt du alle drei ausgerüstet, wirst
  du **Meister des Todes**: +1 Herz, Dementoren verneigen sich statt
  anzugreifen, Thestrale werden immer sichtbar
- 🐦‍⬛ Animagus: brau den Trank der zweiten Gestalt und vollziehe das
  Ritual in einer Sturmnacht am Steinkreis, um dich fortan (Taste `V`)
  in Rabe (fliegt), Katze (Kamera bodennah, schleicht an Feinden vorbei)
  oder Wolf (schnell, Nachtsicht, Biss per Doppeldruck) zu verwandeln —
  als Tier kein Zaubern, kein Reiten, Wasser erzwingt die Rückverwandlung
- 🗣️ Gerüchte: Schüler, Lena und Barnaby erzählen bei erneutem Ansprechen
  zufällige Gerüchte, die auf deinen tatsächlichen Spielstand reagieren
  (befreite Lager, dein Pfad, gezähmte Reittiere, Heiligtümer, deine
  Tierform …)
- 🔊 Prozeduraler Sound: Wind, Schritte, Vogelgezwitscher, Grillen,
  Zauber-Sounds, Kreaturen-Geräusche, Feuerwerk, Regen/Donner, Zug- und
  Kaminklänge — alles über WebAudio
- 🎵 Optionale Ambient-Musik (Menü-Button, Standard: aus): zwei sanft
  ineinander überblendende Akkordflächen aus reinen Sinustönen
- 🏊 Schwimmen im See mit echtem Tauchen (Shift abtaucht, Luftanzeige,
  Schaden bei leerer Lunge), Springen, Rennen, Kollisionen,
  Glühwürmchen, Vögel
- ⚡ Performance: gemergte Meshes, Instancing mit Regionen-Culling,
  Objekt-Pools für Zauber/Partikel/Kreaturen, automatische
  Auflösungs-Anpassung — läuft flüssig ohne Build-Tools

## Entwicklung

- Lokaler Server: `node dev-server.mjs` → http://localhost:8123
- Tests (Save-Logik + Objective Resolver, ohne neue Abhängigkeit):
  `npm test` (führt `node --test` aus)

## Technik

- [Three.js](https://threejs.org/) (lokal eingebunden, keine CDN-Abhängigkeit)
- Reines ES-Module-JavaScript, kein Build-Schritt
- Alle Texturen als Canvas generiert (Mauerwerk, Schindeln, Holz, Gras, Wolken, Mond)
- Welt-Projektion der Texturen (triplanar) statt UV-Mapping
- Gelände aus deterministischem Value-Noise (fBm), Sound über WebAudio
- Eigene Kollisions-/Blocker-Registry, Objekt-Pools für Zauber-Projektile,
  Partikel und Kreaturen, generisches Ziel-Registry-System als Bindeglied
  zwischen Zaubern und Rätseln

Erstellt mit [Claude Code](https://claude.com/claude-code).
