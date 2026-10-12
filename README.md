# LernBau

Lern-App (PWA) für die Bautechniker-Schule: Karteikarten mit Spaced Repetition (FSRS), Quiz mit Probeprüfung und Note, Streak und Statistik. Läuft auf iPhone, iPad und Mac im Browser und lässt sich zum Home-Bildschirm hinzufügen. Funktioniert offline.

**App:** https://z474jrfgfj-dot.github.io/lernbau/

## Aufbau

- `index.html`, `styles.css`, `js/` – die App (reines HTML/CSS/JavaScript, kein Build-Schritt)
- `sw.js`, `manifest.webmanifest`, `icons/` – PWA (Offline, Home-Bildschirm)
- `data/subjects.json` – Fächer (Name, Farbe, Icon)
- `data/units/*.json` – Lerninhalte je Einheit (Quelle)
- `data/content.json` – zusammengeführte Inhalte, die die App lädt

## Inhalte aktualisieren

```bash
python3 tools/build_content.py
```

Prüft alle Einheiten und schreibt `data/content.json` neu. Der Lernfortschritt bleibt erhalten, solange die IDs der Karten gleich bleiben.

## Lokal starten

```bash
python3 -m http.server 8642
```

Dann http://localhost:8642 öffnen.
