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
neu  →  geplant  →  arbeit  →  erledigt  →  berechnet
```

| Status      | Bedeutung                                    | Wer löst den Wechsel aus |
|-------------|----------------------------------------------|--------------------------|
| `neu`       | Angelegt, noch nicht eingeplant              | Chef / Büro              |
| `geplant`   | Einer Person + Termin zugewiesen             | Chef                     |
| `arbeit`    | Person arbeitet vor Ort                      | Monteur / Chef           |
| `erledigt`  | Arbeit fertig, Daten erfasst                 | Monteur / Chef           |
| `berechnet` | Rechnung zum Auftrag erstellt                | Büro (automatisch)       |

Statuswechsel dürfen nur vorwärts erfolgen (eine Stufe zurück ist erlaubt, um
Fehler zu korrigieren, aber kein freies Springen).

**Rechnung und Bezahlung sind eigene Objekte** (Tabelle `rechnungen`, siehe
§3) – nicht mehr Status des Auftrags. Ein Auftrag bekommt durch das Erstellen
einer Rechnung den Status `berechnet`; offen vs. bezahlt ist Status der
Rechnung, nicht des Auftrags. Freie Rechnungen ohne Auftrag (siehe §4 Büro)
existieren nur in `rechnungen`.

---

## 3. Datenmodell

Bewusst einfach gehalten.

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
| status         | text       | `neu`/`geplant`/`arbeit`/`erledigt`/`berechnet` |
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

### rechnungen
Eigenes Objekt; kann mit Auftrag verknüpft sein (auftragsbasierte Rechnung)
**oder** ohne Auftrag existieren (freie Rechnung, siehe §4 Büro).

| Feld           | Typ        | Hinweis                                        |
|----------------|------------|------------------------------------------------|
| id             | UUID, PK   |                                                |
| auftrag_id     | UUID, FK   | → auftraege.id, **nullable** (freie Rechnung) |
| kunde_id       | UUID, FK   | → kunden.id                                    |
| nummer         | text       | fortlaufend pro Jahr, z. B. `2026-0001`        |
| jahr           | int        | für Nummernkreis                               |
| laufende_nr    | int        | jahresweiser Zähler                            |
| datum          | date       | Rechnungsdatum                                 |
| leistungsdatum | date       | nullable                                       |
| status         | text       | `offen` \| `bezahlt`                            |
| bezahlt_am     | timestamp  | nullable                                       |
| objekt         | text       | nullable                                       |
| beschreibung   | text       | nullable                                       |
| firma_snapshot | jsonb      | Stammdaten zum Erstellungszeitpunkt            |
| kunde_snapshot | jsonb      | Kundenname/-adresse zum Erstellungszeitpunkt   |
| positionen     | jsonb      | erstellte Positionen mit Betrag                |
| netto          | numeric    |                                                |
| mwst_satz      | numeric    |                                                |
| mwst_betrag    | numeric    |                                                |
| brutto         | numeric    |                                                |
| pdf_pfad       | text       | gespeicherte PDF im Volume `/data/rechnungen`  |
| erstellt_am    | timestamp  |                                                |

Eine bereits erstellte Rechnung ist unveränderlich (Snapshot-Felder).
Nachträgliche Änderungen an Kunden- oder Firmen-Stammdaten wirken nicht
zurück. Korrekturen erfolgen über Storno + Neuausstellung (nicht Teil
dieser Version – siehe §7).

### firma_stammdaten (datiert)
Datierte Firmen-Stammdaten (z. B. Firmenname, Adresse, Bank, Mail-Vorlagen)
mit `gueltig_von`/`gueltig_bis`. Für eine Rechnung wird der zum
Rechnungsdatum gültige Wert herangezogen und als Snapshot mit der Rechnung
gespeichert.

### rechnung_zaehler
Transaktionssicherer Jahreszähler (`jahr` PK, `letzte_nr` int) für die
lückenlose, jahresweise Rechnungsnummer.

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
- Kennzahlen: Anzahl "bereit zum Berechnen", Summe offener Rechnungsbeträge
  (zählt aus der Tabelle `rechnungen`, nicht mehr aus Auftragsstatus).
- Liste "Erledigt – bereit für Rechnung": Aufträge im Status `erledigt`,
  **die noch keine Rechnung haben**. Button "Rechnung erstellen" generiert
  PDF und legt einen `rechnungen`-Eintrag mit Verweis auf den Auftrag an;
  der Auftrag wechselt anschließend in den Status `berechnet`.
- Button **"Neue Rechnung erstellen"**: zweiter Weg, ohne dass ein Auftrag
  dahinterstehen muss. Ablauf:
  1. Kunde aus Liste wählen ODER neu anlegen (E-Mail-Feld klar sichtbar).
  2. Positionen frei eintragen oder aus dem Material-Katalog antippen.
     Auch eine Position vom Typ "Arbeitszeit" (Stunden × Stundensatz) ist
     frei eintragbar.
  3. Objekt und Beschreibung optional.
  4. Vorschau und Erstellung wie bei der auftragsbasierten Rechnung;
     `auftrag_id` bleibt in `rechnungen` leer.
- Liste "Rechnungen": ALLE Rechnungen aus `rechnungen` (auftragsbasiert und
  frei), mit Status `offen`/`bezahlt`, filterbar nach Status. Pro Zeile:
  - **"PDF öffnen"** – PDF inline öffnen.
  - **"Als bezahlt markieren"** – Status `offen → bezahlt`, setzt `bezahlt_am`.
  - **"Per E-Mail versenden"** – halbautomatisch, siehe Abschnitt unten.
- Kundenverwaltung: Kunden anlegen, bearbeiten, suchen. E-Mail-Feld klar
  sichtbar und schnell pflegbar.
- Material-Katalog verwalten (Positionen + Standardpreise pflegen).
- Einstellungen: Standard-Stundensatz, datierte Firmen-Stammdaten für die
  Rechnung (Name, Adresse, Steuernummer, Bankverbindung, Logo optional)
  sowie **E-Mail-Vorlagen** (Betreff, Text, Hinweistext, siehe unten).

#### Rechnung per E-Mail versenden (halbautomatisch)
Browser können per `mailto:`-Link den Mail-Client öffnen und Empfänger/
Betreff/Text vorausfüllen – **aber keine Anhänge übergeben**. Das ist eine
Browser-Einschränkung und wird **nicht umgangen**. Stattdessen halbautomatisch:

- Klick auf "Per E-Mail versenden" macht parallel zwei Dinge:
  1. PDF der Rechnung herunterladen (regulärer Browser-Download).
  2. `mailto:`-Link öffnen mit:
     - **An:** Kunden-E-Mail (falls im Kunden hinterlegt, sonst leer).
     - **Betreff:** aus Vorlage in den Einstellungen, Standard:
       `Rechnung {rechnungsnummer}`.
     - **Text:** aus Vorlage in den Einstellungen, Standard freundlich
       ("Sehr geehrte Damen und Herren, anbei senden wir Ihnen die
       Rechnung {rechnungsnummer}. …").
- Platzhalter in den Vorlagen: `{rechnungsnummer}`, `{kundenname}`,
  `{betrag}`, `{firmenname}`.
- Direkt nach dem Klick zeigt die App einen kurzen Hinweis:
  > Die Rechnung wurde heruntergeladen und der Mail-Client geöffnet. Bitte
  > zieh die heruntergeladene PDF in die Mail, bevor du sie versendest.
  Hinweistext ist in den Einstellungen bearbeitbar und kann komplett
  ausgeblendet werden.

#### E-Mail-Vorlagen (Einstellungen)
Eigener Bereich in den Einstellungen:
- **Betreff-Vorlage** mit Platzhaltern.
- **Text-Vorlage** (mehrzeilig) mit Platzhaltern.
- **Hinweistext** nach dem Klick auf "Per E-Mail versenden" (oder leer = aus).
- **Live-Vorschau**: zeigt Betreff und Text befüllt mit einer Beispielrechnung.

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
- **Direktversand der Rechnungs-Mail per SMTP aus der App heraus.** Der
  Rechnungsversand ist bewusst halbautomatisch über `mailto:` gelöst –
  Browser können per `mailto:` keine Anhänge übergeben, das wird nicht
  umgangen. Direktversand kann später ergänzt werden, wenn die
  halbautomatische Lösung im Alltag bewertet ist.
- Storno-/Korrekturrechnungen (Gegenrechnung mit negativen Beträgen,
  korrigierte Neuausstellung) – möglich als spätere Erweiterung.

Wenn solche Wünsche aufkommen: erst die Basis fertigstellen, dann separat besprechen.

---

## 8. Qualität & Arbeitsweise

- Schreibe nachvollziehbaren, kommentierten Code.
- Lege ein gutes README an: Setup, Start (`docker compose up`), Backup/Restore,
  wie man den ersten Chef-Nutzer anlegt.
- Baue iterativ in der Reihenfolge aus ANLEITUNG.md. Nach jedem Schritt soll die
  App lauffähig/testbar sein, bevor der nächste beginnt.
- Frage nach, bevor du vom Stack oder Datenmodell abweichst.
