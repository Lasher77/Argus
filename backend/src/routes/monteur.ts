import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  auftraege,
  auftragMaterial,
  fotos,
  kunden,
  materialKatalog,
} from '../db/schema.js'
import { requireRole } from '../auth.js'
import { istErlaubterStatuswechsel } from '../lib/status.js'

// Speicherort der Fotos im Dateisystem (Docker-Volume), Pfad steht in der DB.
const FOTO_DIR = process.env.FOTO_DIR ?? '/data/fotos'
fs.mkdirSync(FOTO_DIR, { recursive: true })

function aktuellerUserId(req: FastifyRequest): string {
  // requireRole('monteur') stellt sicher, dass ein Nutzer vorhanden ist.
  return req.session.get('user')!.id
}

// Lädt einen Auftrag und prüft, dass er dem angemeldeten Monteur gehört.
// Gibt bei Fehler direkt die Antwort zurück (null signalisiert "abgebrochen").
async function eigenerAuftrag(
  req: FastifyRequest,
  reply: FastifyReply,
  auftragId: string,
) {
  const [a] = await db
    .select({ id: auftraege.id, status: auftraege.status, monteurId: auftraege.monteurId, stunden: auftraege.stunden })
    .from(auftraege)
    .where(eq(auftraege.id, auftragId))
    .limit(1)
  if (!a) {
    reply.code(404).send({ error: 'Auftrag nicht gefunden' })
    return null
  }
  if (a.monteurId !== aktuellerUserId(req)) {
    reply.code(403).send({ error: 'Nicht dein Auftrag' })
    return null
  }
  return a
}

export async function monteurRoutes(app: FastifyInstance) {
  // Eigene Aufträge im Status geplant oder arbeit, inkl. Material und Fotoanzahl.
  app.get(
    '/api/monteur/auftraege',
    { preHandler: requireRole('monteur') },
    async (req) => {
      const userId = aktuellerUserId(req)
      const rows = await db
        .select({
          id: auftraege.id,
          titel: auftraege.titel,
          beschreibung: auftraege.beschreibung,
          status: auftraege.status,
          termin: auftraege.termin,
          stunden: auftraege.stunden,
          stundensatz: auftraege.stundensatz,
          kundeName: kunden.name,
          kundeAdresse: kunden.adresse,
        })
        .from(auftraege)
        .leftJoin(kunden, eq(auftraege.kundeId, kunden.id))
        .where(
          and(
            eq(auftraege.monteurId, userId),
            inArray(auftraege.status, ['geplant', 'arbeit']),
          ),
        )
        .orderBy(asc(auftraege.termin))

      const ids = rows.map((r) => r.id)
      const mats = ids.length
        ? await db
            .select()
            .from(auftragMaterial)
            .where(inArray(auftragMaterial.auftragId, ids))
        : []
      const fotoCounts = ids.length
        ? await db
            .select({
              auftragId: fotos.auftragId,
              anzahl: sql<number>`count(*)::int`,
            })
            .from(fotos)
            .where(inArray(fotos.auftragId, ids))
            .groupBy(fotos.auftragId)
        : []
      const fotoMap = new Map(fotoCounts.map((f) => [f.auftragId, f.anzahl]))

      return rows.map((r) => ({
        id: r.id,
        titel: r.titel,
        beschreibung: r.beschreibung,
        status: r.status,
        termin: r.termin,
        stunden: Number(r.stunden ?? 0),
        stundensatz: r.stundensatz === null ? null : Number(r.stundensatz),
        kundeName: r.kundeName,
        kundeAdresse: r.kundeAdresse,
        fotoAnzahl: fotoMap.get(r.id) ?? 0,
        material: mats
          .filter((m) => m.auftragId === r.id)
          .map((m) => ({
            id: m.id,
            bezeichnung: m.bezeichnung,
            einzelpreis: Number(m.einzelpreis),
            menge: Number(m.menge),
            einheit: m.einheit,
          })),
      }))
    },
  )

  // Material-Katalog zum Antippen.
  app.get(
    '/api/monteur/katalog',
    { preHandler: requireRole('monteur') },
    async () =>
      (
        await db
          .select()
          .from(materialKatalog)
          .orderBy(asc(materialKatalog.bezeichnung))
      ).map((k) => ({
        id: k.id,
        bezeichnung: k.bezeichnung,
        einzelpreis: Number(k.einzelpreis),
        einheit: k.einheit,
      })),
  )

  // Arbeit starten: geplant -> arbeit.
  app.patch(
    '/api/monteur/auftraege/:id/start',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const a = await eigenerAuftrag(req, reply, id)
      if (!a) return
      if (a.status !== 'geplant' || !istErlaubterStatuswechsel('geplant', 'arbeit')) {
        return reply.code(400).send({ error: 'Arbeit kann nur aus "geplant" gestartet werden' })
      }
      await db.update(auftraege).set({ status: 'arbeit' }).where(eq(auftraege.id, id))
      return { ok: true }
    },
  )

  // Auftrag erledigt: arbeit -> erledigt, setzt erledigt_am.
  app.patch(
    '/api/monteur/auftraege/:id/erledigt',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const a = await eigenerAuftrag(req, reply, id)
      if (!a) return
      if (a.status !== 'arbeit' || !istErlaubterStatuswechsel('arbeit', 'erledigt')) {
        return reply.code(400).send({ error: 'Nur ein Auftrag in Arbeit kann erledigt werden' })
      }
      await db
        .update(auftraege)
        .set({ status: 'erledigt', erledigtAm: new Date() })
        .where(eq(auftraege.id, id))
      return { ok: true }
    },
  )

  // Stunden hinzufügen (Timer-Ergebnis oder manuelle Eingabe). Wird addiert.
  app.post(
    '/api/monteur/auftraege/:id/stunden',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { zusatz } = (req.body ?? {}) as { zusatz?: number }
      if (typeof zusatz !== 'number' || !isFinite(zusatz) || zusatz <= 0) {
        return reply.code(400).send({ error: 'Ungültige Stundenzahl' })
      }
      const a = await eigenerAuftrag(req, reply, id)
      if (!a) return
      if (a.status !== 'arbeit') {
        return reply.code(400).send({ error: 'Stunden nur während der Arbeit erfassbar' })
      }
      const neu = Number(a.stunden ?? 0) + zusatz
      await db
        .update(auftraege)
        .set({ stunden: neu.toFixed(2) })
        .where(eq(auftraege.id, id))
      return { stunden: neu }
    },
  )

  // Material hinzufügen: aus Katalog (katalogId) oder frei (bezeichnung/einzelpreis).
  app.post(
    '/api/monteur/auftraege/:id/material',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = (req.body ?? {}) as {
        katalogId?: string
        bezeichnung?: string
        einzelpreis?: number
        einheit?: string
        menge?: number
      }
      const a = await eigenerAuftrag(req, reply, id)
      if (!a) return
      if (a.status !== 'arbeit') {
        return reply.code(400).send({ error: 'Material nur während der Arbeit erfassbar' })
      }
      const menge = typeof body.menge === 'number' && body.menge > 0 ? body.menge : 1

      let bezeichnung = body.bezeichnung?.trim()
      let einzelpreis = body.einzelpreis
      let einheit = body.einheit?.trim() || 'Stück'

      if (body.katalogId) {
        const [k] = await db
          .select()
          .from(materialKatalog)
          .where(eq(materialKatalog.id, body.katalogId))
          .limit(1)
        if (!k) return reply.code(400).send({ error: 'Katalogeintrag nicht gefunden' })
        bezeichnung = k.bezeichnung
        einzelpreis = Number(k.einzelpreis)
        einheit = k.einheit
      }

      if (!bezeichnung || typeof einzelpreis !== 'number') {
        return reply.code(400).send({ error: 'Bezeichnung und Einzelpreis erforderlich' })
      }

      const [neu] = await db
        .insert(auftragMaterial)
        .values({
          auftragId: id,
          bezeichnung,
          einzelpreis: einzelpreis.toFixed(2),
          menge: menge.toString(),
          einheit,
        })
        .returning({ id: auftragMaterial.id })
      return reply.code(201).send({ id: neu.id })
    },
  )

  // Lädt eine Materialposition und prüft, dass der zugehörige Auftrag dem
  // Monteur gehört und in Arbeit ist.
  async function eigeneMaterialposition(
    req: FastifyRequest,
    reply: FastifyReply,
    matId: string,
  ) {
    const [m] = await db
      .select({
        matId: auftragMaterial.id,
        monteurId: auftraege.monteurId,
        status: auftraege.status,
      })
      .from(auftragMaterial)
      .innerJoin(auftraege, eq(auftragMaterial.auftragId, auftraege.id))
      .where(eq(auftragMaterial.id, matId))
      .limit(1)
    if (!m) {
      reply.code(404).send({ error: 'Position nicht gefunden' })
      return null
    }
    if (m.monteurId !== aktuellerUserId(req)) {
      reply.code(403).send({ error: 'Nicht dein Auftrag' })
      return null
    }
    if (m.status !== 'arbeit') {
      reply.code(400).send({ error: 'Material nur während der Arbeit änderbar' })
      return null
    }
    return m
  }

  // Menge einer Position anpassen.
  app.patch(
    '/api/monteur/material/:matId',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { matId } = req.params as { matId: string }
      const { menge } = (req.body ?? {}) as { menge?: number }
      if (typeof menge !== 'number' || menge <= 0) {
        return reply.code(400).send({ error: 'Ungültige Menge' })
      }
      const m = await eigeneMaterialposition(req, reply, matId)
      if (!m) return
      await db
        .update(auftragMaterial)
        .set({ menge: menge.toString() })
        .where(eq(auftragMaterial.id, matId))
      return { ok: true }
    },
  )

  // Position entfernen.
  app.delete(
    '/api/monteur/material/:matId',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { matId } = req.params as { matId: string }
      const m = await eigeneMaterialposition(req, reply, matId)
      if (!m) return
      await db.delete(auftragMaterial).where(eq(auftragMaterial.id, matId))
      return { ok: true }
    },
  )

  // Foto hochladen (Smartphone-Kamera). Wird im Volume gespeichert.
  app.post(
    '/api/monteur/auftraege/:id/foto',
    { preHandler: requireRole('monteur') },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const a = await eigenerAuftrag(req, reply, id)
      if (!a) return
      if (a.status !== 'arbeit') {
        return reply.code(400).send({ error: 'Fotos nur während der Arbeit hochladbar' })
      }
      const datei = await req.file()
      if (!datei) return reply.code(400).send({ error: 'Keine Datei empfangen' })

      const endung = path.extname(datei.filename) || '.jpg'
      const dateiname = `${randomUUID()}${endung}`
      const zielPfad = path.join(FOTO_DIR, dateiname)
      await pipeline(datei.file, fs.createWriteStream(zielPfad))

      await db.insert(fotos).values({ auftragId: id, pfad: zielPfad })
      return reply.code(201).send({ ok: true })
    },
  )
}
