import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifySecureSession from '@fastify/secure-session'
import fastifyMultipart from '@fastify/multipart'
import { runMigrations } from './db/migrate.js'
import { authRoutes } from './routes/auth.js'
import { bereichRoutes } from './routes/bereiche.js'
import { auftragRoutes } from './routes/auftraege.js'
import { stammdatenRoutes } from './routes/stammdaten.js'
import { monteurRoutes } from './routes/monteur.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = Fastify({ logger: true })

// Datenbankschema beim Start auf den aktuellen Stand bringen (idempotent).
await runMigrations()
app.log.info('Datenbank-Migrationen ausgeführt.')

const sessionSecret = process.env.SESSION_SECRET
if (!sessionSecret) {
  throw new Error('SESSION_SECRET ist nicht gesetzt')
}

// Verschlüsseltes, serverseitig nur als HTTP-only-Cookie sichtbares Session-
// Cookie. Der 32-Byte-Schlüssel wird deterministisch aus SESSION_SECRET
// abgeleitet, damit Sessions einen Neustart überleben.
await app.register(fastifySecureSession, {
  key: crypto.createHash('sha256').update(sessionSecret).digest(),
  cookieName: 'auftragsbuch_session',
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // Nur über HTTPS senden, wenn ausdrücklich aktiviert. Lokal (http://localhost)
    // muss das aus bleiben, sonst verwerfen Browser wie Safari das Cookie.
    // In Produktion hinter Caddy/HTTPS in der .env auf "true" setzen.
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
  },
})

// Datei-Uploads (Fotos), Größe begrenzt.
await app.register(fastifyMultipart, {
  limits: { fileSize: 15 * 1024 * 1024 },
})

await app.register(authRoutes)
await app.register(bereichRoutes)
await app.register(auftragRoutes)
await app.register(stammdatenRoutes)
await app.register(monteurRoutes)

// Einfacher Health-/API-Endpunkt – wird in Etappe 1 vom Frontend abgefragt.
app.get('/api/health', async () => ({
  status: 'ok',
  message: 'Auftragsbuch-Backend läuft',
}))

// Im Produktions-Image liegt das gebaute Frontend unter ../public und wird
// direkt von Fastify ausgeliefert (ein einziger App-Container).
const publicDir = path.join(__dirname, '..', 'public')
await app.register(fastifyStatic, {
  root: publicDir,
})

const port = Number(process.env.PORT ?? 3000)

try {
  await app.listen({ port, host: '0.0.0.0' })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
