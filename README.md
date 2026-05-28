# Auftragsbuch

Schlanke, selbst-gehostete Web-App zur Auftragsverwaltung für einen kleinen
Handwerksbetrieb. Die vollständige Spezifikation steht in [CLAUDE.md](CLAUDE.md),
der Bauplan in [ANLEITUNG.md](ANLEITUNG.md).

> **Stand:** Etappe 1 – Projektgerüst. Es gibt noch keine Fachfunktionen,
> nur ein lauffähiges Gerüst mit einer „Hallo Welt"-Seite.

## Technik-Stack

- **Backend:** Node.js + TypeScript, [Fastify](https://fastify.dev/)
- **Frontend:** React + [Vite](https://vitejs.dev/)
- **Datenbank:** PostgreSQL
- **Reverse Proxy / HTTPS:** [Caddy](https://caddyserver.com/)
- **Betrieb:** Docker Compose (drei Dienste: `app`, `db`, `caddy`)

## Projektstruktur

```
.
├── backend/            Fastify-Backend (TypeScript)
├── frontend/           React-Frontend (Vite)
├── Dockerfile          baut Frontend + Backend in einen App-Container
├── docker-compose.yml  App, PostgreSQL und Caddy
├── Caddyfile           Reverse-Proxy-Konfiguration (lokal http://localhost)
├── .env.example        Vorlage für Umgebungsvariablen/Geheimnisse
└── CLAUDE.md           vollständige Spezifikation
```

## Schnellstart (lokal)

Voraussetzung: Docker + Docker Compose.

1. Umgebungsvariablen anlegen:

   ```bash
   cp .env.example .env
   ```

   Danach in `.env` die Platzhalter ausfüllen (mindestens `POSTGRES_PASSWORD`,
   `SESSION_SECRET` und die passende `DATABASE_URL`).

2. App starten:

   ```bash
   docker compose up --build
   ```

3. Im Browser öffnen: <http://localhost>

   Es erscheint eine „Hallo Welt"-Seite, die zusätzlich den Backend-Status
   über `/api/health` anzeigt.

Stoppen mit `Strg+C`, vollständiges Aufräumen mit `docker compose down`.

## Datenbank & Beispieldaten

Das Schema (Tabellen `users`, `kunden`, `auftraege`, `auftrag_material`,
`material_katalog`, `fotos`, `mwst_saetze`) wird mit **Drizzle** verwaltet.
Die Migrationen liegen in `backend/drizzle/` und werden beim App-Start
**automatisch** angewendet – du musst nichts manuell migrieren.

Beispieldaten zum Testen einspielen (einmalig, idempotent):

```bash
docker compose exec app node dist/db/seed.js
```

Damit werden angelegt:

| Rolle   | Login                   | Passwort |
|---------|-------------------------|----------|
| Chef    | `sirke@wits-berlin.org` | `Hampel` |
| Monteur | `tom@wits-berlin.org`   | `monteur`|
| Büro    | `buero@wits-berlin.org` | `buero`  |

Außerdem drei Beispielkunden, fünf Material-Katalog-Einträge und der
MwSt-Satz 19 %. Die Test-Passwörter bitte vor dem Produktivbetrieb ändern.

> Schema ändern: Felder in `backend/src/db/schema.ts` anpassen, dann
> `cd backend && npm run db:generate` ausführen – Drizzle erzeugt eine neue
> Migrationsdatei, die beim nächsten App-Start automatisch greift.

## Lokale Entwicklung (ohne Docker, optional)

Für schnelle Iteration mit Hot-Reload lassen sich Backend und Frontend auch
direkt starten (eine laufende PostgreSQL-Instanz vorausgesetzt):

```bash
# Terminal 1 – Backend
cd backend && npm install && npm run dev

# Terminal 2 – Frontend (Vite proxyt /api ans Backend)
cd frontend && npm install && npm run dev
```

Das Frontend läuft dann auf <http://localhost:5173>.

## Produktion / HTTPS

Caddy übernimmt TLS automatisch. Welche Adresse er bedient, steuert die
Umgebungsvariable `APP_DOMAIN` in der `.env`:

| Szenario       | `APP_DOMAIN`-Wert            | Verhalten                                      |
|----------------|------------------------------|------------------------------------------------|
| Lokal (Default)| `http://localhost`           | http auf Port 80, kein TLS, kein Let's Encrypt |
| Produktion     | z. B. `argus.wits-berlin.org`| Caddy holt Let's-Encrypt-Zertifikat und erneuert es automatisch |

So gehst du in Produktion:

1. DNS-Eintrag (A/AAAA) der Domain auf die IP des Servers zeigen lassen.
2. Auf dem Server die Ports **80** und **443** aus dem Internet erreichbar
   machen (Firewall/Router); beide sind in der `docker-compose.yml` bereits
   freigegeben.
3. In der `.env`:
   ```env
   APP_DOMAIN=argus.wits-berlin.org
   SESSION_COOKIE_SECURE=true        # Cookie nur über HTTPS senden
   ```
4. Optional: für Let's-Encrypt-Benachrichtigungen das [Caddyfile](Caddyfile)
   um einen globalen Block ergänzen:
   ```caddy
   {
     email du@beispiel.de
   }
   ```
5. `docker compose up -d --build`. Beim ersten Start fordert Caddy das
   Zertifikat an; danach lädt die App über `https://APP_DOMAIN`.

Eingehende `http://`-Anfragen leitet Caddy automatisch auf `https://` um. Zur
Fehlersuche bei Zertifikaten: `docker compose logs caddy`.

## Backups & Restore

Ein eigener `backup`-Sidecar-Container erstellt **täglich** einen Dump der
Postgres-Datenbank per `pg_dump`, komprimiert ihn mit gzip und legt ihn unter
`./backups/auftragsbuch-YYYYMMDD-HHMMSS.sql.gz` ab. Aufbewahrung und Intervall
sind in der `.env` einstellbar:

```env
BACKUP_KEEP_DAYS=14            # Dumps älter als X Tage werden gelöscht
BACKUP_INTERVAL_SECONDS=86400  # Abstand zwischen zwei Dumps (Default: 24 h)
```

Das Verzeichnis `./backups` liegt direkt auf dem Host (Bind-Mount) und ist
über `.gitignore` ausgeschlossen. Es eignet sich zur Mitnahme auf externe
Datenträger oder zur Spiegelung in einen Cloud-Speicher.

### Sofortiges Backup erzwingen
```bash
docker compose exec backup sh -c 'pg_dump --no-owner --clean --if-exists | gzip -9 > /backups/manuell-$(date +%Y%m%d-%H%M%S).sql.gz'
```

### Backup zurückspielen
```bash
# 1. App stoppen, aber DB laufen lassen
docker compose stop app

# 2. Aktive Verbindungen kappen und Schema leeren, dann Dump einspielen
gunzip -c ./backups/auftragsbuch-20260101-030000.sql.gz | \
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# 3. App wieder starten
docker compose start app
```

Der Parameter `--clean --if-exists` im pg_dump sorgt dafür, dass der Dump
vorhandene Objekte beim Restore zuerst entfernt – die Wiederherstellung
funktioniert also auch in eine schon migrierte Datenbank hinein.

## Geheimnisse

Alle Geheimnisse (DB-Passwort, Session-Secret, ACME-E-Mail) stehen in `.env`.
Diese Datei ist über `.gitignore` vom Versionskontrollsystem ausgeschlossen
und darf nicht eingecheckt werden. Im Repo liegt nur `.env.example` mit
Platzhaltern.

Empfehlungen:

- Vor dem Produktivbetrieb `POSTGRES_PASSWORD` und `SESSION_SECRET` durch
  starke Zufallswerte ersetzen (z. B. `openssl rand -hex 32`).
- Die Seed-Passwörter (`Hampel`, `monteur`, `buero`) im Tab **Einstellungen**
  bzw. über die Nutzerverwaltung ändern.
- Schnellprüfung, dass keine Geheimnisse im Repo gelandet sind:
  ```bash
  git ls-files | xargs grep -nE 'PASSWORD|SECRET|API.?KEY|BEGIN .* PRIVATE KEY' 2>/dev/null
  ```
  Es darf nichts außer Variablen-Namen (`POSTGRES_PASSWORD: …` in der Compose-
  Datei) oder Doku-Erwähnungen auftauchen.
