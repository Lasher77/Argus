import type { FastifyInstance } from 'fastify'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  ansprechpartner,
  einheiten,
  hausverwaltungen,
  objekte,
} from '../db/schema.js'
import { requireRole } from '../auth.js'
import { adresseZeile, ansprechpartnerPasst, ladeKontext } from '../lib/objekte.js'

// Verwaltung von Hausverwaltungen, Ansprechpartnern, Objekten und Einheiten.
// Zugriff: Chef (inline beim Auftrag anlegen) und Büro (eigener Tab).
// Es wird nichts gelöscht, sondern nur archiviert – Aufträge und Rechnungen
// behalten so ihre Verweise.

const BLOCK_KEYS = [
  'rechnungEmpfaenger',
  'rechnungStrasse',
  'rechnungOrt',
  'rechnungEmail',
  'rechnungKundennr',
] as const

type Body = Record<string, unknown>

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

const blockFelder = (b: Body) =>
  Object.fromEntries(BLOCK_KEYS.map((k) => [k, str(b[k])])) as Record<
    (typeof BLOCK_KEYS)[number],
    string | null
  >

const vorOrtFelder = (b: Body) => ({
  vorOrtName: str(b.vorOrtName),
  vorOrtTelefon: str(b.vorOrtTelefon),
  vorOrtEmail: str(b.vorOrtEmail),
})

const idOderNull = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null

export async function objekteRoutes(app: FastifyInstance) {
  const berechtigt = { preHandler: requireRole('chef', 'buero') }

  // ---------------- Hausverwaltungen ----------------
  app.get('/api/hausverwaltungen', berechtigt, async () => {
    const hvs = await db.select().from(hausverwaltungen).orderBy(asc(hausverwaltungen.name))
    const aps = await db.select().from(ansprechpartner).orderBy(asc(ansprechpartner.name))
    return hvs.map((h) => ({
      ...h,
      ansprechpartner: aps.filter((a) => a.hausverwaltungId === h.id),
    }))
  })

  app.post('/api/hausverwaltungen', berechtigt, async (req, reply) => {
    const b = (req.body ?? {}) as Body
    const name = str(b.name)
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    const [neu] = await db
      .insert(hausverwaltungen)
      .values({ name, notiz: str(b.notiz), ...blockFelder(b) })
      .returning({ id: hausverwaltungen.id, name: hausverwaltungen.name })
    return reply.code(201).send(neu)
  })

  app.patch('/api/hausverwaltungen/:id', berechtigt, async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as Body
    const name = str(b.name)
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    await db
      .update(hausverwaltungen)
      .set({ name, notiz: str(b.notiz), ...blockFelder(b) })
      .where(eq(hausverwaltungen.id, id))
    return { ok: true }
  })

  app.patch('/api/hausverwaltungen/:id/archiv', berechtigt, async (req) => {
    const { id } = req.params as { id: string }
    const { archiviert } = (req.body ?? {}) as { archiviert?: boolean }
    await db
      .update(hausverwaltungen)
      .set({ archiviert: archiviert !== false })
      .where(eq(hausverwaltungen.id, id))
    return { ok: true }
  })

  // ---------------- Ansprechpartner ----------------
  app.get('/api/ansprechpartner', berechtigt, async () =>
    db.select().from(ansprechpartner).orderBy(asc(ansprechpartner.name)),
  )

  app.post('/api/ansprechpartner', berechtigt, async (req, reply) => {
    const b = (req.body ?? {}) as Body
    const name = str(b.name)
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    const hvId = idOderNull(b.hausverwaltungId)
    if (hvId) {
      const [hv] = await db.select({ id: hausverwaltungen.id }).from(hausverwaltungen).where(eq(hausverwaltungen.id, hvId)).limit(1)
      if (!hv) return reply.code(400).send({ error: 'Hausverwaltung nicht gefunden' })
    }
    const [neu] = await db
      .insert(ansprechpartner)
      .values({
        name,
        rolle: str(b.rolle),
        telefon: str(b.telefon),
        email: str(b.email),
        notiz: str(b.notiz),
        hausverwaltungId: hvId,
      })
      .returning({ id: ansprechpartner.id, name: ansprechpartner.name })
    return reply.code(201).send(neu)
  })

  app.patch('/api/ansprechpartner/:id', berechtigt, async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as Body
    const name = str(b.name)
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    await db
      .update(ansprechpartner)
      .set({
        name,
        rolle: str(b.rolle),
        telefon: str(b.telefon),
        email: str(b.email),
        notiz: str(b.notiz),
        hausverwaltungId: idOderNull(b.hausverwaltungId),
      })
      .where(eq(ansprechpartner.id, id))
    return { ok: true }
  })

  app.patch('/api/ansprechpartner/:id/archiv', berechtigt, async (req) => {
    const { id } = req.params as { id: string }
    const { archiviert } = (req.body ?? {}) as { archiviert?: boolean }
    await db
      .update(ansprechpartner)
      .set({ archiviert: archiviert !== false })
      .where(eq(ansprechpartner.id, id))
    return { ok: true }
  })

  // ---------------- Objekte ----------------
  app.get('/api/objekte', berechtigt, async () => {
    const os = await db.select().from(objekte).orderBy(asc(objekte.name))
    const ids = os.map((o) => o.id)
    const es = ids.length
      ? await db.select().from(einheiten).where(inArray(einheiten.objektId, ids)).orderBy(asc(einheiten.bezeichnung))
      : []
    const hvs = await db.select({ id: hausverwaltungen.id, name: hausverwaltungen.name }).from(hausverwaltungen)
    const hvName = new Map(hvs.map((h) => [h.id, h.name]))
    return os.map((o) => ({
      ...o,
      adresse: adresseZeile(o),
      hausverwaltungName: o.hausverwaltungId ? hvName.get(o.hausverwaltungId) ?? null : null,
      einheiten: es.filter((e) => e.objektId === o.id),
    }))
  })

  // Aufgelöster Kontext (effektive Hausverwaltung, Ansprechpartner, Vor-Ort-
  // Kontakt, wählbare Rechnungsadressen) für Objekt bzw. Einheit.
  app.get('/api/objekte/:id/kontext', berechtigt, async (req) => {
    const { id } = req.params as { id: string }
    const { einheitId } = req.query as { einheitId?: string }
    const k = await ladeKontext(id, einheitId ?? null)
    return {
      ortLabel: k.ortLabel,
      adresse: k.adresse,
      hausverwaltung: k.hausverwaltung ? { id: k.hausverwaltung.id, name: k.hausverwaltung.name } : null,
      ansprechpartner: k.ansprechpartner
        ? { id: k.ansprechpartner.id, name: k.ansprechpartner.name, telefon: k.ansprechpartner.telefon, email: k.ansprechpartner.email }
        : null,
      vorOrt: k.vorOrt,
      kandidaten: k.kandidaten,
      standardKey: k.standardKey,
    }
  })

  app.post('/api/objekte', berechtigt, async (req, reply) => {
    const b = (req.body ?? {}) as Body
    const name = str(b.name)
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    const hvId = idOderNull(b.hausverwaltungId)
    const apId = idOderNull(b.ansprechpartnerId)
    if (!(await ansprechpartnerPasst(apId, hvId))) {
      return reply.code(400).send({ error: 'Ansprechpartner passt nicht zur gewählten Hausverwaltung' })
    }
    const quelle = b.rechnungQuelle === 'eigen' ? 'eigen' : 'hausverwaltung'
    const [neu] = await db
      .insert(objekte)
      .values({
        name,
        strasse: str(b.strasse),
        hausnummer: str(b.hausnummer),
        plz: str(b.plz),
        ort: str(b.ort),
        hausverwaltungId: hvId,
        ansprechpartnerId: apId,
        ...vorOrtFelder(b),
        rechnungQuelle: quelle,
        ...blockFelder(b),
        notiz: str(b.notiz),
      })
      .returning({ id: objekte.id, name: objekte.name })
    return reply.code(201).send(neu)
  })

  app.patch('/api/objekte/:id', berechtigt, async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as Body
    const name = str(b.name)
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    const hvId = idOderNull(b.hausverwaltungId)
    const apId = idOderNull(b.ansprechpartnerId)
    if (!(await ansprechpartnerPasst(apId, hvId))) {
      return reply.code(400).send({ error: 'Ansprechpartner passt nicht zur gewählten Hausverwaltung' })
    }
    await db
      .update(objekte)
      .set({
        name,
        strasse: str(b.strasse),
        hausnummer: str(b.hausnummer),
        plz: str(b.plz),
        ort: str(b.ort),
        hausverwaltungId: hvId,
        ansprechpartnerId: apId,
        ...vorOrtFelder(b),
        rechnungQuelle: b.rechnungQuelle === 'eigen' ? 'eigen' : 'hausverwaltung',
        ...blockFelder(b),
        notiz: str(b.notiz),
      })
      .where(eq(objekte.id, id))
    return { ok: true }
  })

  app.patch('/api/objekte/:id/archiv', berechtigt, async (req) => {
    const { id } = req.params as { id: string }
    const { archiviert } = (req.body ?? {}) as { archiviert?: boolean }
    await db.update(objekte).set({ archiviert: archiviert !== false }).where(eq(objekte.id, id))
    return { ok: true }
  })

  // ---------------- Einheiten ----------------
  const einheitWerte = async (objektId: string, b: Body) => {
    const bezeichnung = str(b.bezeichnung)
    if (!bezeichnung) return { fehler: 'Bezeichnung ist erforderlich' as const }
    const hvId = idOderNull(b.hausverwaltungId)
    const apId = idOderNull(b.ansprechpartnerId)
    // Effektive Hausverwaltung = die der Einheit, sonst die des Objekts.
    let effHv = hvId
    if (!effHv) {
      const [o] = await db
        .select({ hv: objekte.hausverwaltungId })
        .from(objekte)
        .where(eq(objekte.id, objektId))
        .limit(1)
      effHv = o?.hv ?? null
    }
    if (!(await ansprechpartnerPasst(apId, effHv))) {
      return { fehler: 'Ansprechpartner passt nicht zur Hausverwaltung' as const }
    }
    const quelle =
      b.rechnungQuelle === 'eigen' || b.rechnungQuelle === 'hausverwaltung'
        ? b.rechnungQuelle
        : 'objekt'
    return {
      werte: {
        bezeichnung,
        hausverwaltungId: hvId,
        ansprechpartnerId: apId,
        ...vorOrtFelder(b),
        rechnungQuelle: quelle as 'eigen' | 'objekt' | 'hausverwaltung',
        ...blockFelder(b),
        notiz: str(b.notiz),
      },
    }
  }

  app.post('/api/objekte/:id/einheiten', berechtigt, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [o] = await db.select({ id: objekte.id }).from(objekte).where(eq(objekte.id, id)).limit(1)
    if (!o) return reply.code(404).send({ error: 'Objekt nicht gefunden' })
    const r = await einheitWerte(id, (req.body ?? {}) as Body)
    if ('fehler' in r) return reply.code(400).send({ error: r.fehler })
    const [neu] = await db
      .insert(einheiten)
      .values({ objektId: id, ...r.werte })
      .returning({ id: einheiten.id, bezeichnung: einheiten.bezeichnung })
    return reply.code(201).send(neu)
  })

  app.patch('/api/einheiten/:id', berechtigt, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [e] = await db.select({ objektId: einheiten.objektId }).from(einheiten).where(eq(einheiten.id, id)).limit(1)
    if (!e) return reply.code(404).send({ error: 'Einheit nicht gefunden' })
    const r = await einheitWerte(e.objektId, (req.body ?? {}) as Body)
    if ('fehler' in r) return reply.code(400).send({ error: r.fehler })
    await db.update(einheiten).set(r.werte).where(eq(einheiten.id, id))
    return { ok: true }
  })

  app.patch('/api/einheiten/:id/archiv', berechtigt, async (req) => {
    const { id } = req.params as { id: string }
    const { archiviert } = (req.body ?? {}) as { archiviert?: boolean }
    await db.update(einheiten).set({ archiviert: archiviert !== false }).where(eq(einheiten.id, id))
    return { ok: true }
  })
}
