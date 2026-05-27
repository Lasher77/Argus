import type { FastifyInstance } from 'fastify'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { auftraege, auftragMaterial, fotos, kunden, users } from '../db/schema.js'
import { requireRole } from '../auth.js'
import { istErlaubterStatuswechsel } from '../lib/status.js'

// Standard-Stundensatz beim Anlegen. Wird in Etappe 6 (Einstellungen)
// konfigurierbar; pro Auftrag bereits jetzt überschreibbar.
const STANDARD_STUNDENSATZ = '60.00'

export async function auftragRoutes(app: FastifyInstance) {
  // Liste aller Aufträge mit berechneten Zusatzfeldern (nur Chef).
  app.get(
    '/api/auftraege',
    { preHandler: requireRole('chef') },
    async () => {
      const zeilen = await db
        .select({
          id: auftraege.id,
          titel: auftraege.titel,
          beschreibung: auftraege.beschreibung,
          status: auftraege.status,
          termin: auftraege.termin,
          stunden: auftraege.stunden,
          stundensatz: auftraege.stundensatz,
          erstelltAm: auftraege.erstelltAm,
          erledigtAm: auftraege.erledigtAm,
          kundeName: kunden.name,
          monteurId: auftraege.monteurId,
          monteurName: users.name,
        })
        .from(auftraege)
        .leftJoin(kunden, eq(auftraege.kundeId, kunden.id))
        .leftJoin(users, eq(auftraege.monteurId, users.id))
        .orderBy(desc(auftraege.erstelltAm))

      // Material- und Foto-Kennzahlen je Auftrag in je einer Abfrage.
      const material = await db
        .select({
          auftragId: auftragMaterial.auftragId,
          anzahl: sql<number>`count(*)::int`,
          summe: sql<string>`coalesce(sum(${auftragMaterial.einzelpreis} * ${auftragMaterial.menge}), 0)`,
        })
        .from(auftragMaterial)
        .groupBy(auftragMaterial.auftragId)

      const fotoZahl = await db
        .select({
          auftragId: fotos.auftragId,
          anzahl: sql<number>`count(*)::int`,
        })
        .from(fotos)
        .groupBy(fotos.auftragId)

      const matMap = new Map(material.map((m) => [m.auftragId, m]))
      const fotoMap = new Map(fotoZahl.map((f) => [f.auftragId, f.anzahl]))

      return zeilen.map((z) => {
        const mat = matMap.get(z.id)
        const materialSumme = Number(mat?.summe ?? 0)
        const stunden = Number(z.stunden ?? 0)
        const stundensatz = Number(z.stundensatz ?? 0)
        return {
          id: z.id,
          titel: z.titel,
          beschreibung: z.beschreibung,
          status: z.status,
          termin: z.termin,
          stunden,
          stundensatz: z.stundensatz === null ? null : stundensatz,
          erstelltAm: z.erstelltAm,
          erledigtAm: z.erledigtAm,
          kundeName: z.kundeName,
          monteurId: z.monteurId,
          monteurName: z.monteurName,
          materialAnzahl: mat?.anzahl ?? 0,
          fotoAnzahl: fotoMap.get(z.id) ?? 0,
          summe: stunden * stundensatz + materialSumme,
        }
      })
    },
  )

  // Neuen Auftrag anlegen (nur Chef). Startet immer im Status "neu".
  app.post(
    '/api/auftraege',
    { preHandler: requireRole('chef') },
    async (req, reply) => {
      const body = (req.body ?? {}) as {
        kundeId?: string
        titel?: string
        beschreibung?: string
      }
      const titel = body.titel?.trim()
      if (!body.kundeId || !titel) {
        return reply
          .code(400)
          .send({ error: 'Kunde und Titel sind erforderlich' })
      }

      const [kunde] = await db
        .select({ id: kunden.id })
        .from(kunden)
        .where(eq(kunden.id, body.kundeId))
        .limit(1)
      if (!kunde) {
        return reply.code(400).send({ error: 'Kunde nicht gefunden' })
      }

      const [neu] = await db
        .insert(auftraege)
        .values({
          kundeId: body.kundeId,
          titel,
          beschreibung: body.beschreibung?.trim() || null,
          status: 'neu',
          stundensatz: STANDARD_STUNDENSATZ,
        })
        .returning({ id: auftraege.id })

      return reply.code(201).send({ id: neu.id })
    },
  )

  // Auftrag einem Monteur zuweisen + Termin setzen (Status neu -> geplant).
  app.patch(
    '/api/auftraege/:id/zuweisen',
    { preHandler: requireRole('chef') },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = (req.body ?? {}) as {
        monteurId?: string
        termin?: string | null
      }

      if (!body.monteurId) {
        return reply.code(400).send({ error: 'Monteur ist erforderlich' })
      }

      const [auftrag] = await db
        .select({ status: auftraege.status })
        .from(auftraege)
        .where(eq(auftraege.id, id))
        .limit(1)
      if (!auftrag) {
        return reply.code(404).send({ error: 'Auftrag nicht gefunden' })
      }

      // Zuweisung nur sinnvoll, solange der Auftrag noch nicht in Arbeit ist.
      if (auftrag.status !== 'neu' && auftrag.status !== 'geplant') {
        return reply.code(400).send({
          error: 'Zuweisung nur im Status "neu" oder "geplant" möglich',
        })
      }
      // Statuswechsel neu -> geplant gegen die erlaubte Reihenfolge prüfen.
      if (
        auftrag.status === 'neu' &&
        !istErlaubterStatuswechsel('neu', 'geplant')
      ) {
        return reply.code(400).send({ error: 'Ungültiger Statuswechsel' })
      }

      const [monteur] = await db
        .select({ rolle: users.rolle })
        .from(users)
        .where(eq(users.id, body.monteurId))
        .limit(1)
      if (!monteur || monteur.rolle !== 'monteur') {
        return reply.code(400).send({ error: 'Kein gültiger Monteur' })
      }

      await db
        .update(auftraege)
        .set({
          monteurId: body.monteurId,
          termin: body.termin ? new Date(body.termin) : null,
          status: 'geplant',
        })
        .where(eq(auftraege.id, id))

      return { ok: true }
    },
  )
}
