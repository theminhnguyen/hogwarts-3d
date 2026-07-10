# Hogwarts 3D 🏰✨

Ein **begehbares 3D-Schloss im Browser** — komplett prozedural erzeugt, ohne ein
einziges externes Asset. Erkunde das Schloss mit Großem Saal, Astronomieturm,
Viadukt, See mit Bootshaus, Verbotenem Wald, Quidditch-Feld und Steinkreis.
Finde die 12 goldenen Schnätze!

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
- ✨ 12 goldene Schnätze mit HUD-Kompass, Fortschritt wird gespeichert
- 🔊 Prozeduraler Sound: Wind, Schritte, Vogelgezwitscher, Grillen, Glockenspiel
- 🏊 Schwimmen im See, Springen, Rennen, Kollisionen, Glühwürmchen, Vögel
- ⚡ Performance: gemergte Meshes, Instancing mit Regionen-Culling,
  automatische Auflösungs-Anpassung — läuft flüssig ohne Build-Tools

## Technik

- [Three.js](https://threejs.org/) (lokal eingebunden, keine CDN-Abhängigkeit)
- Reines ES-Module-JavaScript, kein Build-Schritt
- Alle Texturen als Canvas generiert (Mauerwerk, Schindeln, Holz, Gras, Wolken, Mond)
- Welt-Projektion der Texturen (triplanar) statt UV-Mapping
- Gelände aus deterministischem Value-Noise (fBm), Sound über WebAudio

Erstellt mit [Claude Code](https://claude.com/claude-code).
