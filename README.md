# Hogwarts 3D 🏰✨

Ein **begehbares 3D-Schloss im Browser** — komplett prozedural erzeugt, ohne ein
einziges externes Asset. Erkunde das Schloss mit Großem Saal, Astronomieturm,
Viadukt, See mit Bootshaus, Verbotenem Wald, Quidditch-Feld, Steinkreis und dem
nebelverhangenen Moor jenseits davon. Halte durchgehend einen Zauberstab in der
Hand, wirke vier Sprüche, verteidige dich gegen Wichtel und Schattengeister,
löse vier Rätsel und gewinne am Ende den Hauspokal — mit Feuerwerk und einem
galoppierenden Patronus. Danach beherrschst du **Expecto Patronum** selbst und
kannst dich ins Nebelmoor wagen: dort schweben Dementoren, denen nur der
Patronus etwas anhaben kann, und fünf verlorene Seelenlichter warten darauf,
in die versiegelte Krypta zurückgebracht zu werden.

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
| `Shift` | Rennen |
| `Leertaste` | Springen |
| Maustaste | Zaubern (bei Leviosa: gedrückt halten zum Tragen, loslassen zum Fallenlassen) |
| Mausrad / `1`–`4` | Zauber wechseln |
| `5` | Expecto Patronum (erst nach dem Hauspokal) |
| `T` | Tageszeit vorspulen |
| `L` | Lumos (Lichtzauber) |
| `M` | Ton an/aus |
| `F` | FPS anzeigen |
| `Esc` | Menü |

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
- 🔊 Prozeduraler Sound: Wind, Schritte, Vogelgezwitscher, Grillen,
  Zauber-Sounds, Kreaturen-Geräusche, Feuerwerk — alles über WebAudio
- 🏊 Schwimmen im See, Springen, Rennen, Kollisionen, Glühwürmchen, Vögel
- ⚡ Performance: gemergte Meshes, Instancing mit Regionen-Culling,
  Objekt-Pools für Zauber/Partikel/Kreaturen, automatische
  Auflösungs-Anpassung — läuft flüssig ohne Build-Tools

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
