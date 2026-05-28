import type { FastifyInstance } from 'fastify'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { kunden, users } from '../db/schema.js'
import { requireRole } from '../auth.js'

// Kundenliste und Kunde anlegen (für das Auftragsformular des Chefs).
// Die vollständige Kundenverwaltung folgt im Büro-Bereich (Etappe 6).
export async function stammdatenRoutes(app: FastifyInstance) {
  app.get(
    '/api/kunden',
    { preHandler: requireRole('chef') },
    async () =>
      db
        .select({
          id: kunden.id,
          name: kunden.name,
          adresse: kunden.adresse,
          telefon: kunden.telefon,
          email: kunden.email,
        })
        .from(kunden)
        .orderBy(asc(kunden.name)),
  )

  app.post(
    '/api/kunden',
    { preHandler: requireRole('chef') },
    async (req, reply) => {
      const body = (req.body ?? {}) as {
        name?: string
        adresse?: string
        telefon?: string
        email?: string
        notiz?: string
      }
      const name = body.name?.trim()
      if (!name) {
        return reply.code(400).send({ error: 'Name ist erforderlich' })
      }
      const [neu] = await db
        .insert(kunden)
        .values({
          name,
          adresse: body.adresse?.trim() || null,
          telefon: body.telefon?.trim() || null,
          email: body.email?.trim() || null,
          notiz: body.notiz?.trim() || null,
        })
        .returning({ id: kunden.id, name: kunden.name })
      return reply.code(201).send(neu)
    },
  )

  // Zuweisbare Personen für einen Auftrag: Monteure UND der Chef
  // (der Chef arbeitet laut Rollenmodell auch selbst, siehe CLAUDE.md §1).
  app.get(
    '/api/zuweisbare',
    { preHandler: requireRole('chef') },
    async () =>
      db
        .select({ id: users.id, name: users.name, rolle: users.rolle })
        .from(users)
        .where(inArray(users.rolle, ['chef', 'monteur']))
        .orderBy(asc(users.name)),
  )
}
