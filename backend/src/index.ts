import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { runMigrations } from './db/migrate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = Fastify({ logger: true })

// Datenbankschema beim Start auf den aktuellen Stand bringen (idempotent).
await runMigrations()
app.log.info('Datenbank-Migrationen ausgeführt.')

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
