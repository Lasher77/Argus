# Anleitung: Auftragsbuch mit Claude Code bauen

Diese Anleitung führt dich Schritt für Schritt durch den Bau. Die `CLAUDE.md`
(im selben Ordner) enthält die vollständige Spezifikation – Claude Code liest sie
automatisch. Du gibst hier einfach die Schritte der Reihe nach als Prompts ein.

Die Idee: in kleinen, testbaren Etappen bauen. Nach jeder Etappe läuft die App und
du kannst etwas ausprobieren, bevor es weitergeht. Das verhindert, dass am Ende ein
großer, undurchschaubarer Berg Code entsteht.

---

## Vorbereitung (einmalig)

1. **Claude Code installieren** (falls noch nicht geschehen) – Anleitung auf
   docs.claude.com. Du brauchst Node.js auf deinem Rechner.
2. Lege einen leeren Projektordner an, z. B. `auftragsbuch/`.
3. Kopiere `CLAUDE.md` und diese `ANLEITUNG.md` in diesen Ordner.
4. Starte Claude Code in diesem Ordner (`claude` im Terminal).
5. Erster Prompt zum Warmwerden:

   > Lies die CLAUDE.md in diesem Ordner und fasse in 5 Sätzen zusammen, was wir
   > bauen, welchen Technik-Stack wir nutzen und wie der Auftrags-Lebenszyklus
   > aussieht. Stelle mir danach alle offenen Verständnisfragen, BEVOR wir
   > anfangen zu bauen.

   So stellst du sicher, dass Claude Code den Plan verstanden hat.

---

## Etappe 1 – Projektgerüst & Docker

> Erstelle das Projektgerüst gemäß CLAUDE.md: Node.js + TypeScript Backend
> (Express oder Fastify), React-Frontend mit Vite, und eine docker-compose.yml mit
> drei Diensten: App, PostgreSQL und Caddy als Reverse Proxy. Lege außerdem
> .env.example und eine README mit Start-Anleitung an. Noch keine Funktionen –
> nur ein lauffähiges Gerüst, das mit `docker compose up` startet und eine
> "Hallo Welt"-Seite zeigt.

**Test:** `docker compose up`, Seite im Browser aufrufen.

---

## Etappe 2 – Datenbank & Modelle

> Lege das Datenbankschema gemäß CLAUDE.md an (Tabellen users, kunden, auftraege,
> auftrag_material, material_katalog, fotos) inklusive Migrations. Erstelle ein
> Seed-Skript, das einen Chef-Nutzer, einen Monteur, ein paar Beispielkunden und
> ein paar Material-Katalog-Einträge anlegt, damit ich beim Testen Daten habe.

**Test:** Migration läuft durch, Seed-Daten sind in der DB sichtbar.

---

## Etappe 3 – Login & Rollen

> Baue die Authentifizierung: E-Mail + Passwort, serverseitig mit bcrypt gehasht,
> Session über HTTP-only-Cookie. Drei Rollen (chef, monteur, buero), serverseitig
> geprüft. Eine einfache Login-Seite im Frontend. Nach dem Login wird je nach
> Rolle die passende Ansicht geladen (vorerst nur Platzhalter pro Rolle).

**Test:** Mit dem Seed-Chef einloggen, mit dem Monteur einloggen – jeweils
unterschiedliche Platzhalterseite. Falsches Passwort wird abgelehnt.

---

## Etappe 4 – Aufträge: Anlegen & Liste (Chef)

> Baue die Chef-Ansicht: Liste aller Aufträge mit Status-Badge, Monteur, Stunden,
> Materialanzahl, errechneter Summe. Formular "Neuer Auftrag" (Kunde wählen oder
> neu anlegen, Titel, Beschreibung). Funktion, einen Auftrag einem Monteur
> zuzuweisen und einen Termin zu setzen (Status neu → geplant). Kennzahlen oben
> gemäß CLAUDE.md.

**Test:** Auftrag anlegen, einem Monteur zuweisen, in der Liste prüfen.

---

## Etappe 5 – Monteur-Ansicht (mobil)

> Baue die mobil optimierte Monteur-Ansicht gemäß CLAUDE.md: nur eigene Aufträge
> (geplant/arbeit), große Touch-Buttons. "Arbeit starten" (geplant → arbeit),
> Stunden per Start/Stopp-Timer und manueller Eingabe, Material aus dem Katalog
> antippen mit Mengenanpassung, Foto-Upload über die Handykamera, "Auftrag
> erledigt" (arbeit → erledigt). Adresse als Link zur Karten-App.

**Test:** Am Handy (oder schmalem Browserfenster) als Monteur einloggen, einen
Auftrag durchspielen: starten, Stunden erfassen, Material + Foto, erledigen.

---

## Etappe 6 – Büro-Ansicht & Rechnung

> Baue die Büro-Ansicht: Liste "bereit zum Berechnen" (Status erledigt) mit
> errechneter Summe, Button "Rechnung erstellen" der ein sauberes Rechnungs-PDF
> generiert (Firmenkopf, Kunde, fortlaufende Rechnungsnummer, Positionen für
> Arbeitszeit und Material, MwSt., Gesamtsumme) und den Status auf rechnung setzt.
> Liste "Rechnungen" mit "Als bezahlt markieren". Kundenverwaltung,
> Material-Katalog-Pflege und Einstellungen (Stundensatz, Firmendaten) ebenfalls hier.

**Test:** Erledigten Auftrag in Rechnung verwandeln, PDF prüfen, auf bezahlt setzen.

---

## Etappe 7 – Server-Betrieb absichern

> Ergänze: tägliches automatisches PostgreSQL-Backup per pg_dump in einen
> separaten Ordner (mit kurzer Doku im README, wie man ein Backup zurückspielt).
> Stelle sicher, dass Caddy HTTPS automatisch bereitstellt und dokumentiere im
> README, wie ich die Domain/feste Adresse eintrage. Prüfe, dass keine Geheimnisse
> im Code oder Git landen.

**Test:** Backup-Datei wird erzeugt; App ist über https erreichbar.

---

## Etappe 8 – Feinschliff

Jetzt erst die Politur. Beispiel-Prompts nach Bedarf:

> Mach die Monteur-Ansicht noch fingerfreundlicher und teste sie auf einem
> schmalen Bildschirm.

> Füge einen Filter nach Status und Monteur in die Chef-Liste ein.

> Baue eine einfache Such-/Filterfunktion in die Kundenliste.

---

## Tipps für die Zusammenarbeit mit Claude Code

- **Eine Etappe nach der anderen.** Nicht alles auf einmal verlangen.
- **Nach jeder Etappe testen**, bevor es weitergeht. Fehler früh fangen ist leichter.
- Wenn etwas nicht passt: genau beschreiben, was du erwartet hast und was
  passiert ist. Claude Code kann dann gezielt nachbessern.
- Bei Unsicherheit ruhig sagen: *"Erkläre mir kurz, was dieser Schritt macht,
  bevor du ihn ausführst."*
- **Sichere deinen Fortschritt** mit Git (Claude Code kann das für dich einrichten:
  *"Richte Git ein und committe nach jeder Etappe."*).

---

## Wenn du später erweitern willst

Halte dich an die Scope-Grenze in CLAUDE.md, Abschnitt 7. Erst die Basis stabil
und im echten Einsatz bewährt – dann neue Wünsche EINZELN ergänzen, jeweils mit
einem klaren Prompt und einem Test danach.
