import type { FastifyInstance } from 'fastify'
import { asc, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { requireRole } from '../auth.js'

export async function stammdatenRoutes(app: FastifyInstance) {
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
