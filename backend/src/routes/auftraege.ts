import type { FastifyInstance } from 'fastify'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  auftraege,
  auftragMaterial,
  einheiten,
  fotos,
  objekte,
  users,
} from '../db/schema.js'
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
          objektId: auftraege.objektId,
          einheitId: auftraege.einheitId,
          objektName: objekte.name,
          einheitName: einheiten.bezeichnung,
          einsatzort: auftraege.einsatzort,
          monteurId: auftraege.monteurId,
          monteurName: users.name,
        })
        .from(auftraege)
        .leftJoin(objekte, eq(auftraege.objektId, objekte.id))
        .leftJoin(einheiten, eq(auftraege.einheitId, einheiten.id))
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
          objektId: z.objektId,
          einheitId: z.einheitId,
          // Anzeigename: "Objekt · Einheit", bei freien Aufträgen "Freier Auftrag".
          ortLabel: z.objektName
            ? `${z.objektName}${z.einheitName ? ` · ${z.einheitName}` : ''}`
            : 'Freier Auftrag',
          einsatzort: z.einsatzort,
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
        objektId?: string | null
        einheitId?: string | null
        einsatzort?: string | null
        titel?: string
        beschreibung?: string
      }
      const titel = body.titel?.trim()
      if (!titel) {
        return reply.code(400).send({ error: 'Titel ist erforderlich' })
      }

      // Objektbezug: Einheit bestimmt das Objekt; ohne beides = freier Auftrag.
      let objektId: string | null = body.objektId || null
      const einheitId: string | null = body.einheitId || null
      if (einheitId) {
        const [e] = await db
          .select({ objektId: einheiten.objektId, archiviert: einheiten.archiviert })
          .from(einheiten)
          .where(eq(einheiten.id, einheitId))
          .limit(1)
        if (!e) return reply.code(400).send({ error: 'Einheit nicht gefunden' })
        if (e.archiviert) return reply.code(400).send({ error: 'Einheit ist archiviert' })
        if (objektId && objektId !== e.objektId) {
          return reply.code(400).send({ error: 'Einheit gehört nicht zum gewählten Objekt' })
        }
        objektId = e.objektId
      }
      if (objektId) {
        const [o] = await db
          .select({ id: objekte.id, archiviert: objekte.archiviert })
          .from(objekte)
          .where(eq(objekte.id, objektId))
          .limit(1)
        if (!o) return reply.code(400).send({ error: 'Objekt nicht gefunden' })
        if (o.archiviert) return reply.code(400).send({ error: 'Objekt ist archiviert' })
      }
      const frei = !objektId

      const [neu] = await db
        .insert(auftraege)
        .values({
          objektId,
          einheitId,
          // Einsatzort-Freitext gibt es nur bei freien Aufträgen.
          einsatzort: frei ? body.einsatzort?.trim() || null : null,
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

      const [zuweisung] = await db
        .select({ rolle: users.rolle })
        .from(users)
        .where(eq(users.id, body.monteurId))
        .limit(1)
      if (
        !zuweisung ||
        (zuweisung.rolle !== 'monteur' && zuweisung.rolle !== 'chef')
      ) {
        return reply
          .code(400)
          .send({ error: 'Auftrag kann nur Chef oder Monteur zugewiesen werden' })
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
