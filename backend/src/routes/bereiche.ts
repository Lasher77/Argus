import type { FastifyInstance } from 'fastify'
import { requireRole } from '../auth.js'

// Platzhalter-Endpunkte je Rolle. Sie dienen vorerst nur dazu, die
// serverseitige Rollenprüfung sichtbar zu machen: Ein Monteur erhält auf
// /api/chef/... und /api/buero/... eine 403-Antwort und umgekehrt.
export async function bereichRoutes(app: FastifyInstance) {
  app.get(
    '/api/chef/uebersicht',
    { preHandler: requireRole('chef') },
    async () => ({ bereich: 'chef', titel: 'Chef-Bereich' }),
  )

  app.get(
    '/api/monteur/uebersicht',
    { preHandler: requireRole('monteur') },
    async () => ({ bereich: 'monteur', titel: 'Monteur-Bereich' }),
  )

  app.get(
    '/api/buero/uebersicht',
    { preHandler: requireRole('buero') },
    async () => ({ bereich: 'buero', titel: 'Büro-Bereich' }),
  )
}
