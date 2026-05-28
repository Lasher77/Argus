# Auftragsbuch – Projektkontext für Claude Code

Diese Datei beschreibt das komplette Projekt. Sie wird von Claude Code beim Start
automatisch gelesen und dient als verbindliche Spezifikation. Halte dich an dieses
Dokument; frag nach, wenn etwas unklar ist, statt zu raten.

---

## 1. Was wir bauen

Eine schlanke Web-Anwendung zur Auftragsverwaltung für einen kleinen
Handwerksbetrieb (3 Personen). Sie ersetzt Zettel und WhatsApp-Zuruf durch eine
gemeinsame Auftragsliste, auf der alle drei in ihrer jeweiligen Rolle arbeiten.

Die App wird **selbst gehostet auf einem eigenen Server** (Linux). Sie muss von
unterwegs (Smartphone der Monteure) und vom Büro (Laptop) erreichbar sein.

### Die drei Nutzer und ihre Rollen
- **Chef** – sieht alles, legt Aufträge an, weist sie zu, behält Gesamtüberblick
  und Kennzahlen. Arbeitet sowohl mobil als auch am Laptop. **Der Chef ist
  gleichzeitig auch Monteur** und arbeitet selbst beim Kunden. Er hat deshalb
  zwei klar getrennte Bereiche:
    1. **Dashboard (Geschäftsführung):** Gesamtüberblick über ALLE Aufträge
       aller Personen, Kennzahlen, Aufträge anlegen und zuweisen.
    2. **Meine Aufträge (Arbeitsansicht):** Die exakt gleiche mobile
       Arbeitsansicht wie beim Monteur, angewendet auf die dem Chef SELBST
       zugewiesenen Aufträge. Hier kann der Chef Arbeit starten, den Timer
       nutzen, Material erfassen, Fotos hochladen und Aufträge erledigen –
       genau wie ein Monteur, aber nur für seine eigenen zugewiesenen Aufträge.
- **Monteur** – sieht nur die ihm zugewiesenen Aufträge, primär am Smartphone.
  Braucht radikal einfache Bedienung: große Buttons, wenige Klicks.
- **Büro** (Ehefrau des Chefs) – verwaltet Kunden und Rechnungen am Laptop,
  verwandelt erledigte Aufträge in Rechnungen, verfolgt offen/bezahlt.

#### Verbindliche Regeln für Zuweisung und Arbeitsansicht
- Ein Auftrag kann **jeder Person mit Arbeits-Funktion** zugewiesen werden –
  sowohl einem Monteur als auch dem Chef (beide sind Einträge in `users`).
- Die **Arbeitsansicht** zeigt jeder Person nur die IHR SELBST zugewiesenen
  Aufträge (Status `geplant`/`arbeit`). Das gilt für Chef und Monteur gleich.
  Der Chef sieht in seiner Arbeitsansicht NICHT die Aufträge des Monteurs –
  sie bleibt schlank und aufgeräumt.
- Den Blick auf ALLE Aufträge bekommt der Chef ausschließlich über das
  Dashboard, nicht über die Arbeitsansicht.
- Ein Auftrag ist immer **genau EINER Person** zur Abarbeitung zugewiesen
  (`monteur_id`). Dadurch bleiben Stundenerfassung und Zuordnung eindeutig.
- Serverseitige Rechteprüfung bleibt streng: Arbeits-Aktionen (Timer, Material,
  Foto, erledigen) darf eine Person nur an Aufträgen ausführen, die ihr selbst
  zugewiesen sind. Der Chef bildet hier KEINE Ausnahme – auch er bearbeitet im
  Arbeitsmodus nur seine eigenen, nicht die des Monteurs.
- Dashboard-/Verwaltungs-Aktionen (anlegen, zuweisen, Rechnungen) bleiben dem
  Chef bzw. dem Büro vorbehalten.
- **Bewusst nicht in dieser Version:** Gemeinsames Arbeiten mehrerer Personen
  am selben Auftrag (z. B. Chef und Monteur gleichzeitig mit getrennter
  Stundenerfassung). Falls später benötigt, wird das als eigene Erweiterung
  modelliert – nicht durch Aufweichen der „ein Auftrag, eine zugewiesene
  Person"-Regel.

---

## 2. Kernidee: Der Auftrags-Lebenszyklus

Jeder Auftrag durchläuft feste Status. Der Statuswechsel ist das Herzstück der App –
so fließt die Information automatisch vom Monteur (unterwegs) ins Büro.

```
neu  →  geplant  →  arbeit  →  erledigt  →  rechnung  →  bezahlt
```

| Status     | Bedeutung                          | Wer löst den Wechsel aus |
|------------|------------------------------------|--------------------------|
| `neu`      | Angelegt, noch nicht eingeplant    | Chef / Büro              |
| `geplant`  | Einem Monteur + Termin zugewiesen  | Chef                     |
| `arbeit`   | Monteur arbeitet vor Ort           | Monteur                  |
| `erledigt` | Arbeit fertig, Daten erfasst       | Monteur                  |
| `rechnung` | Rechnung erstellt                  | Büro                     |
| `bezahlt`  | Zahlung eingegangen                | Büro                     |

Statuswechsel dürfen nur vorwärts erfolgen (eine Stufe zurück ist erlaubt, um
Fehler zu korrigieren, aber kein freies Springen).

---

## 3. Datenmodell

Vier Tabellen. Bewusst einfach gehalten.

### users
| Feld         | Typ        | Hinweis                                  |
|--------------|------------|------------------------------------------|
| id           | UUID, PK   |                                          |
| name         | text       | z. B. "Tom"                              |
| email        | text       | für Login                                |
| passwort_hash| text       | gehasht (bcrypt o. ä.), niemals Klartext |
| rolle        | text       | `chef` \| `monteur` \| `buero`           |

### kunden
| Feld     | Typ      | Hinweis            |
|----------|----------|--------------------|
| id       | UUID, PK |                    |
| name     | text     | Kunden- oder Firmenname |
| adresse  | text     |                    |
| telefon  | text     | optional           |
| email    | text     | optional           |
| notiz    | text     | optional           |

### auftraege
| Feld           | Typ        | Hinweis                                       |
|----------------|------------|-----------------------------------------------|
| id             | UUID, PK   |                                               |
| kunde_id       | UUID, FK   | → kunden.id                                   |
| titel          | text       | kurze Bezeichnung, z. B. "Heizung warten"     |
| beschreibung   | text       | optional, Details                             |
| status         | text       | siehe Lebenszyklus                            |
| monteur_id     | UUID, FK   | → users.id, nullable (bis zugewiesen)         |
| termin         | timestamp  | nullable, geplanter Termin                    |
| stundensatz    | numeric    | €/h, Standardwert aus Einstellung übernehmen  |
| stunden        | numeric    | erfasste Arbeitszeit                          |
| erstellt_am    | timestamp  |                                               |
| erledigt_am    | timestamp  | nullable                                      |

### auftrag_material (Positionen je Auftrag)
| Feld         | Typ      | Hinweis                          |
|--------------|----------|----------------------------------|
| id           | UUID, PK |                                  |
| auftrag_id   | UUID, FK | → auftraege.id                   |
| bezeichnung  | text     | z. B. "Kupferrohr 1m"            |
| einzelpreis  | numeric  | €                                |
| menge        | numeric  |                                  |

### material_katalog (wiederverwendbare Materialliste)
| Feld         | Typ      | Hinweis                                      |
|--------------|----------|----------------------------------------------|
| id           | UUID, PK |                                              |
| bezeichnung  | text     | einmal anlegen, beim Auftrag antippen        |
| einzelpreis  | numeric  | Standardpreis (im Auftrag überschreibbar)    |

### fotos
| Feld        | Typ      | Hinweis                                        |
|-------------|----------|------------------------------------------------|
| id          | UUID, PK |                                                |
| auftrag_id  | UUID, FK | → auftraege.id                                 |
| pfad        | text     | Speicherort auf dem Server (Dateisystem)       |
| hochgeladen_am | timestamp |                                             |

> Hinweis: Rechnungen werden NICHT als separate Tabelle modelliert. Eine "Rechnung"
> ist ein Auftrag im Status `rechnung`/`bezahlt`. Die Rechnung wird als PDF aus den
> Auftragsdaten generiert (Stunden × Stundensatz + Materialpositionen). Das hält
> das Modell einfach. (Rechtssichere/GoBD-konforme Archivierung ist NICHT Teil
> dieser Version – der Steuerberater übernimmt das. Siehe Abschnitt 7.)

---

## 4. Funktionen je Rolle

### Chef-Ansicht (Dashboard)
- Kennzahlen oben: Anzahl offene Aufträge, Summe "noch zu berechnen"
  (alle im Status `erledigt`), Umsatz des laufenden Monats.
- Liste aller Aufträge mit Status-Badge, zugewiesenem Monteur, Stunden,
  Materialanzahl, Fotoanzahl, errechneter Summe.
- Button "Neuer Auftrag" → Formular (Kunde wählen/anlegen, Titel, Beschreibung).
- Auftrag einem Monteur zuweisen + Termin setzen (Status → `geplant`).
- Filter nach Status und nach Monteur.

### Monteur-Ansicht (mobil optimiert)
- Zeigt nur Aufträge des eingeloggten Monteurs im Status `geplant` oder `arbeit`.
- Pro Auftrag: Kunde, Adresse (als anklickbarer Link zu Karten-App), Titel.
- Button "Arbeit starten" (Status `geplant` → `arbeit`).
- Stunden-Erfassung: Start/Stopp-Timer ODER manuelle Eingabe. Timer zählt die
  Zeit, beim Stopp wird sie auf `stunden` addiert.
- Material hinzufügen: Liste aus `material_katalog` antippen → Position wird mit
  Standardpreis angelegt, Menge anpassbar. Auch freie Eingabe möglich.
- Foto aufnehmen/hochladen (Smartphone-Kamera via `<input type="file" capture>`).
- Button "Auftrag erledigt" (Status `arbeit` → `erledigt`, setzt `erledigt_am`).
- Bedienung: große Touch-Flächen (min. 44px hoch), wenig Text, klare Icons.

### Büro-Ansicht (Laptop)
- Kennzahlen: Anzahl "bereit zum Berechnen", Summe offener Rechnungsbeträge.
- Liste "Erledigt – bereit für Rechnung" (Status `erledigt`): pro Auftrag die
  errechnete Summe + Button "Rechnung erstellen" → generiert PDF, Status → `rechnung`.
- Liste "Rechnungen" (Status `rechnung`/`bezahlt`): mit Button "Als bezahlt markieren".
- Kundenverwaltung: Kunden anlegen, bearbeiten, Liste ansehen.
- Material-Katalog verwalten (Positionen + Standardpreise pflegen).
- Einstellungen: Standard-Stundensatz, Firmendaten für die Rechnung
  (Name, Adresse, Steuernummer, Bankverbindung, Logo optional).

### Rechnungs-PDF
- Generiere ein sauberes PDF aus den Auftragsdaten: Firmenkopf, Kunde,
  Rechnungsnummer (fortlaufend), Datum, Positionen (Arbeitszeit als Position +
  Materialpositionen), Zwischensumme, MwSt., Gesamtsumme, Zahlungshinweis.
- Rechnungsnummer fortlaufend und eindeutig (z. B. JAHR-laufendeNr).
- PDF zum Download UND auf dem Server gespeichert ablegen.

---

## 5. Technik-Stack (Vorgabe)

Bewusst pragmatisch gewählt für "selbst gehostet" + "Entwickler mit etwas Erfahrung".
Wenn du (Claude Code) einen begründeten besseren Vorschlag hast, nenne ihn, aber
weiche nicht ohne Rücksprache ab.

- **Sprache/Runtime:** Node.js (LTS) + TypeScript.
- **Backend:** Ein einfaches Framework wie Express oder Fastify. REST-API.
- **Datenbank:** PostgreSQL (läuft mit auf dem Server, via Docker).
- **Frontend:** React mit Vite. Responsive, "mobile first" für die Monteur-Ansicht.
  Kein schweres UI-Framework nötig; schlichte, klare Komponenten.
- **Auth:** E-Mail + Passwort, serverseitig gehasht (bcrypt). Session via
  HTTP-only-Cookie. Drei Rollen, serverseitig geprüft (nie nur im Frontend!).
- **Foto-Speicher:** Dateisystem des Servers in einem Volume (z. B. `/data/fotos`),
  Pfad in der DB. Keine externen Cloud-Dienste.
- **PDF:** serverseitig generieren (z. B. mit einer Bibliothek wie pdfkit oder
  via HTML-Template + Headless-Rendering).
- **Deployment:** Alles in **Docker Compose** (App, Postgres, Reverse Proxy).
- **Reverse Proxy / HTTPS:** **Caddy** – holt und erneuert TLS-Zertifikate
  automatisch. So ist die App über `https://...` sicher von unterwegs erreichbar.

### Wichtige Server-Themen (NICHT vergessen)
- **Backups:** Tägliches automatisches Backup der PostgreSQL-DB (z. B. Cron +
  `pg_dump`) in einen separaten Ordner. Im README dokumentieren, wie man ein
  Backup zurückspielt.
- **Umgebungsvariablen:** Alle Geheimnisse (DB-Passwort, Session-Secret) in einer
  `.env`-Datei, die NICHT ins Git kommt. Eine `.env.example` mit Platzhaltern anlegen.
- **HTTPS ist Pflicht**, sobald die App über das Internet erreichbar ist –
  Passwörter und Auftragsdaten dürfen nie unverschlüsselt übertragen werden.

---

## 6. Designprinzipien

- Schlicht, flach, klar. Keine überladenen Oberflächen.
- Status immer als farbiges Badge sichtbar.
- Monteur-Ansicht: groß, touch-freundlich, minimaler Text.
- Geldbeträge immer im deutschen Format (1.234,56 €).
- Deutsche Beschriftungen durchgehend (die Nutzer sind deutschsprachige Handwerker).
- Datumsformat TT.MM.JJJJ.

---

## 7. Bewusst NICHT in dieser Version (Scope-Grenze)

Damit das Projekt schlank bleibt und tatsächlich fertig wird, gehören folgende
Dinge ausdrücklich NICHT dazu:
- GoBD-konforme, revisionssichere Rechnungsarchivierung (macht der Steuerberater).
- Buchhaltung, Mahnwesen, Steuer-Export (DATEV o. ä.).
- Angebots-/Kostenvoranschlagswesen.
- Mehrmandantenfähigkeit (es ist genau EIN Betrieb).
- Mobile native Apps (die Web-App ist responsive, das genügt).

Wenn solche Wünsche aufkommen: erst die Basis fertigstellen, dann separat besprechen.

---

## 8. Qualität & Arbeitsweise

- Schreibe nachvollziehbaren, kommentierten Code.
- Lege ein gutes README an: Setup, Start (`docker compose up`), Backup/Restore,
  wie man den ersten Chef-Nutzer anlegt.
- Baue iterativ in der Reihenfolge aus ANLEITUNG.md. Nach jedem Schritt soll die
  App lauffähig/testbar sein, bevor der nächste beginnt.
- Frage nach, bevor du vom Stack oder Datenmodell abweichst.
