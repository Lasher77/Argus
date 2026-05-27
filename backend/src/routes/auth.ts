import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema.js'
import { requireAuth } from '../auth.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string; passwort?: string }
    const email = body.email?.trim().toLowerCase()
    const passwort = body.passwort

    if (!email || !passwort) {
      return reply.code(400).send({ error: 'E-Mail und Passwort erforderlich' })
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    // Bewusst dieselbe Meldung, egal ob Nutzer unbekannt oder Passwort falsch.
    // Das Passwort wird nur als Hash verglichen, nie geloggt oder gespeichert.
    if (!user || !(await bcrypt.compare(passwort, user.passwortHash))) {
      return reply.code(401).send({ error: 'E-Mail oder Passwort falsch' })
    }

    req.session.set('user', {
      id: user.id,
      name: user.name,
      rolle: user.rolle,
    })

    return { id: user.id, name: user.name, rolle: user.rolle }
  })

  app.post('/api/auth/logout', async (req) => {
    req.session.delete()
    return { ok: true }
  })

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    return req.session.get('user')
  })
}
