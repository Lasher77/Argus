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

Lokal ist die App über `http://localhost` erreichbar. Für den Server:
im [Caddyfile](Caddyfile) den vorbereiteten Block für `argus.wits-berlin.org`
aktivieren – Caddy holt und erneuert das TLS-Zertifikat dann automatisch.
Details folgen in einer späteren Etappe (Server-Betrieb absichern).

## Geheimnisse

Alle Geheimnisse (DB-Passwort, Session-Secret) stehen in `.env`. Diese Datei
ist über `.gitignore` vom Versionskontrollsystem ausgeschlossen und darf nicht
eingecheckt werden. Im Repo liegt nur `.env.example` mit Platzhaltern.
