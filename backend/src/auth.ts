import type { FastifyReply, FastifyRequest } from 'fastify'

export type Rolle = 'chef' | 'monteur' | 'buero'

export interface SessionUser {
  id: string
  name: string
  rolle: Rolle
}

// Macht das Session-Objekt typsicher: req.session.get('user') -> SessionUser.
declare module '@fastify/secure-session' {
  interface SessionData {
    user: SessionUser
  }
}

// preHandler: blockt nicht angemeldete Anfragen mit 401.
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const user = req.session.get('user')
  if (!user) {
    return reply.code(401).send({ error: 'Nicht angemeldet' })
  }
}

// preHandler-Fabrik: erlaubt nur die angegebenen Rollen, sonst 403.
// Die Rollenprüfung passiert damit immer serverseitig.
export function requireRole(...erlaubteRollen: Rolle[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.session.get('user')
    if (!user) {
      return reply.code(401).send({ error: 'Nicht angemeldet' })
    }
    if (!erlaubteRollen.includes(user.rolle)) {
      return reply.code(403).send({ error: 'Keine Berechtigung' })
    }
  }
}
