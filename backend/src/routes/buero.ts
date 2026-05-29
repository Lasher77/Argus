import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  auftraege,
  auftragMaterial,
  kunden,
  materialKatalog,
  rechnungen,
  firmaStammdaten,
} from '../db/schema.js'
import { requireRole } from '../auth.js'
import { berechneSummen, round2, type Position } from '../lib/geld.js'
import { holeStammwerte, STAMMDATEN_FELDER } from '../lib/stammdaten.js'
import { erzeugeRechnungPdf } from '../lib/rechnungPdf.js'

const RECHNUNG_DIR = process.env.RECHNUNG_DIR ?? '/data/rechnungen'
const LOGO_DIR = process.env.LOGO_DIR ?? '/data/logos'
fs.mkdirSync(RECHNUNG_DIR, { recursive: true })
fs.mkdirSync(LOGO_DIR, { recursive: true })

function heuteIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function vortagIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

// Stabile, gut lesbare Kundennummer aus der UUID (kein eigenes Nummernfeld).
function kundennummer(id: string): string {
  const n = parseInt(id.replace(/-/g, '').slice(0, 6), 16) % 100000
  return n.toString().padStart(5, '0')
}

// Deutsches Währungsformat für Mail-Vorlagen-Platzhalter (z. B. "1.234,56 €").
function formatBetrag(n: number): string {
  const [g, c] = Math.abs(n).toFixed(2).split('.')
  const ganz = g.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${n < 0 ? '-' : ''}${ganz},${c} €`
}

// Berechnete Summe eines erledigten Auftrags (Arbeitszeit + Material).
async function auftragSumme(auftragId: string, stunden: number, satz: number) {
  const [mat] = await db
    .select({
      summe: sql<string>`coalesce(sum(${auftragMaterial.einzelpreis} * ${auftragMaterial.menge}), 0)`,
    })
    .from(auftragMaterial)
    .where(eq(auftragMaterial.auftragId, auftragId))
  return round2(stunden * satz + Number(mat?.summe ?? 0))
}

// Standard-Positionen aus einem Auftrag ableiten (Arbeitszeit + Materialien).
async function vorschauPositionen(auftragId: string, stunden: number, satz: number): Promise<Position[]> {
  const mats = await db
    .select()
    .from(auftragMaterial)
    .where(eq(auftragMaterial.auftragId, auftragId))
    .orderBy(asc(auftragMaterial.bezeichnung))

  const positionen: Position[] = []
  if (stunden > 0) {
    positionen.push({
      pos: 0,
      bezeichnung: 'Arbeitszeit',
      menge: stunden,
      einheit: 'Std',
      einzelpreis: satz,
      betrag: round2(stunden * satz),
    })
  }
  for (const m of mats) {
    const menge = Number(m.menge)
    const einzelpreis = Number(m.einzelpreis)
    positionen.push({
      pos: 0,
      bezeichnung: m.bezeichnung,
      menge,
      einheit: m.einheit,
      einzelpreis,
      betrag: round2(menge * einzelpreis),
    })
  }
  return positionen.map((p, i) => ({ ...p, pos: i + 1 }))
}

export async function bueroRoutes(app: FastifyInstance) {
  const nurBuero = { preHandler: requireRole('buero') }

  // --- Kennzahlen ---
  app.get('/api/buero/kennzahlen', nurBuero, async () => {
    // Bereit zum Berechnen: erledigte Aufträge OHNE bereits erzeugte Rechnung.
    const [bereit] = await db
      .select({ anzahl: sql<number>`count(*)::int` })
      .from(auftraege)
      .leftJoin(rechnungen, eq(rechnungen.auftragId, auftraege.id))
      .where(and(eq(auftraege.status, 'erledigt'), sql`${rechnungen.id} IS NULL`))
    // Offene Rechnungsbeträge: Summe brutto aller Rechnungen im Status 'offen'.
    const [offen] = await db
      .select({ summe: sql<string>`coalesce(sum(${rechnungen.brutto}), 0)` })
      .from(rechnungen)
      .where(eq(rechnungen.status, 'offen'))
    return {
      bereitAnzahl: bereit?.anzahl ?? 0,
      offeneRechnungenSumme: Number(offen?.summe ?? 0),
    }
  })

  // --- Erledigt – bereit für Rechnung (nur Aufträge ohne bestehende Rechnung) ---
  app.get('/api/buero/erledigt', nurBuero, async () => {
    const rows = await db
      .select({
        id: auftraege.id,
        titel: auftraege.titel,
        stunden: auftraege.stunden,
        stundensatz: auftraege.stundensatz,
        erledigtAm: auftraege.erledigtAm,
        kundeName: kunden.name,
      })
      .from(auftraege)
      .leftJoin(kunden, eq(auftraege.kundeId, kunden.id))
      .leftJoin(rechnungen, eq(rechnungen.auftragId, auftraege.id))
      .where(and(eq(auftraege.status, 'erledigt'), sql`${rechnungen.id} IS NULL`))
      .orderBy(desc(auftraege.erledigtAm))

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        titel: r.titel,
        kundeName: r.kundeName,
        erledigtAm: r.erledigtAm,
        summe: await auftragSumme(r.id, Number(r.stunden ?? 0), Number(r.stundensatz ?? 0)),
      })),
    )
  })

  // --- Rechnungs-Vorschau (editierbare Positionen) ---
  app.get('/api/buero/auftrag/:id/vorschau', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [a] = await db
      .select({
        id: auftraege.id,
        titel: auftraege.titel,
        beschreibung: auftraege.beschreibung,
        status: auftraege.status,
        stunden: auftraege.stunden,
        stundensatz: auftraege.stundensatz,
        erledigtAm: auftraege.erledigtAm,
        kundeName: kunden.name,
        kundeAdresse: kunden.adresse,
        kundeId: kunden.id,
      })
      .from(auftraege)
      .leftJoin(kunden, eq(auftraege.kundeId, kunden.id))
      .where(eq(auftraege.id, id))
      .limit(1)
    if (!a) return reply.code(404).send({ error: 'Auftrag nicht gefunden' })
    if (a.status !== 'erledigt') {
      return reply.code(400).send({ error: 'Nur erledigte Aufträge können berechnet werden' })
    }

    const datum = heuteIso()
    const stamm = await holeStammwerte(datum)
    const mwstSatz = Number(stamm.mwst_satz ?? '19')
    const positionen = await vorschauPositionen(a.id, Number(a.stunden ?? 0), Number(a.stundensatz ?? 0))
    const summen = berechneSummen(positionen, mwstSatz)

    return {
      auftragId: a.id,
      datum,
      objekt: a.titel,
      beschreibung: a.beschreibung,
      leistungsdatum: a.erledigtAm ? new Date(a.erledigtAm).toISOString().slice(0, 10) : null,
      kunde: {
        name: a.kundeName,
        adresse: a.kundeAdresse,
        nummer: a.kundeId ? kundennummer(a.kundeId) : '—',
      },
      mwstSatz,
      positionen,
      summen,
    }
  })

  // --- Rechnung erstellen (transaktionssicher, mit Snapshot + PDF) ---
  app.post('/api/buero/auftrag/:id/rechnung', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as {
      positionen?: Array<{ bezeichnung: string; menge: number; einheit: string; einzelpreis: number }>
      objekt?: string
      beschreibung?: string
    }
    if (!body.positionen || body.positionen.length === 0) {
      return reply.code(400).send({ error: 'Mindestens eine Position erforderlich' })
    }

    const [a] = await db
      .select({
        id: auftraege.id,
        status: auftraege.status,
        erledigtAm: auftraege.erledigtAm,
        kundeId: auftraege.kundeId,
        kundeName: kunden.name,
        kundeAdresse: kunden.adresse,
      })
      .from(auftraege)
      .leftJoin(kunden, eq(auftraege.kundeId, kunden.id))
      .where(eq(auftraege.id, id))
      .limit(1)
    if (!a) return reply.code(404).send({ error: 'Auftrag nicht gefunden' })
    if (a.status !== 'erledigt') {
      return reply.code(400).send({ error: 'Auftrag ist nicht im Status "erledigt"' })
    }

    const datum = heuteIso()
    const jahr = Number(datum.slice(0, 4))
    const stamm = await holeStammwerte(datum)
    const mwstSatz = Number(stamm.mwst_satz ?? '19')

    const positionen: Position[] = body.positionen.map((p, i) => {
      const menge = Number(p.menge)
      const einzelpreis = Number(p.einzelpreis)
      return {
        pos: i + 1,
        bezeichnung: String(p.bezeichnung).trim(),
        menge,
        einheit: String(p.einheit || 'Stück'),
        einzelpreis,
        betrag: round2(menge * einzelpreis),
      }
    })
    const summen = berechneSummen(positionen, mwstSatz)

    const kunde = {
      name: a.kundeName ?? '',
      adresse: a.kundeAdresse ?? null,
      nummer: a.kundeId ? kundennummer(a.kundeId) : '—',
    }
    const leistungsdatum = a.erledigtAm
      ? new Date(a.erledigtAm).toISOString().slice(0, 10)
      : null

    try {
      const ergebnis = await db.transaction(async (tx) => {
        // Lückenlose, jahresweise Nummer: atomar hochzählen.
        const res = await tx.execute(sql`
          INSERT INTO rechnung_zaehler (jahr, letzte_nr) VALUES (${jahr}, 1)
          ON CONFLICT (jahr) DO UPDATE SET letzte_nr = rechnung_zaehler.letzte_nr + 1
          RETURNING letzte_nr
        `)
        const laufendeNr = Number((res.rows[0] as { letzte_nr: number }).letzte_nr)
        const nummer = `${jahr}-${laufendeNr.toString().padStart(4, '0')}`
        const pdfPfad = path.join(RECHNUNG_DIR, `${nummer}.pdf`)

        await erzeugeRechnungPdf(
          {
            nummer,
            datum,
            leistungsdatum,
            firma: stamm,
            kunde,
            objekt: body.objekt ?? null,
            beschreibung: body.beschreibung ?? null,
            positionen,
            summen,
          },
          pdfPfad,
        )

        const [neu] = await tx
          .insert(rechnungen)
          .values({
            auftragId: id,
            kundeId: a.kundeId,
            nummer,
            jahr,
            laufendeNr,
            datum,
            leistungsdatum,
            objekt: body.objekt ?? null,
            beschreibung: body.beschreibung ?? null,
            firmaSnapshot: stamm,
            kundeSnapshot: kunde,
            positionen,
            netto: summen.netto.toFixed(2),
            mwstSatz: summen.mwstSatz.toFixed(2),
            mwstBetrag: summen.mwstBetrag.toFixed(2),
            brutto: summen.brutto.toFixed(2),
            pdfPfad,
          })
          .returning({ id: rechnungen.id, nummer: rechnungen.nummer })

        // Auftrag landet im neuen Endstatus "berechnet" (siehe CLAUDE.md §2).
        await tx.update(auftraege).set({ status: 'berechnet' }).where(eq(auftraege.id, id))
        return neu
      })
      return reply.code(201).send(ergebnis)
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Rechnung konnte nicht erstellt werden' })
    }
  })

  // --- Rechnungen-Liste (alle, auftragsbasiert UND frei) ---
  app.get('/api/buero/rechnungen', nurBuero, async (req) => {
    const { status } = req.query as { status?: 'offen' | 'bezahlt' }
    const basis = db
      .select({
        id: rechnungen.id,
        nummer: rechnungen.nummer,
        datum: rechnungen.datum,
        brutto: rechnungen.brutto,
        kundeSnapshot: rechnungen.kundeSnapshot,
        status: rechnungen.status,
        kundeEmail: kunden.email,
        auftragId: rechnungen.auftragId,
      })
      .from(rechnungen)
      .leftJoin(kunden, eq(rechnungen.kundeId, kunden.id))
      .orderBy(desc(rechnungen.nummer))
    const rows =
      status === 'offen' || status === 'bezahlt'
        ? await basis.where(eq(rechnungen.status, status))
        : await basis
    return rows.map((r) => ({
      id: r.id,
      nummer: r.nummer,
      datum: r.datum,
      brutto: Number(r.brutto),
      kundeName: (r.kundeSnapshot as { name?: string })?.name ?? '',
      kundeEmail: r.kundeEmail ?? '',
      status: r.status,
      auftragId: r.auftragId,
    }))
  })

  // --- PDF öffnen ---
  app.get('/api/buero/rechnung/:id/pdf', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [r] = await db
      .select({ pdfPfad: rechnungen.pdfPfad, nummer: rechnungen.nummer })
      .from(rechnungen)
      .where(eq(rechnungen.id, id))
      .limit(1)
    if (!r || !fs.existsSync(r.pdfPfad)) {
      return reply.code(404).send({ error: 'PDF nicht gefunden' })
    }
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', `inline; filename="Rechnung-${r.nummer}.pdf"`)
    return reply.send(fs.createReadStream(r.pdfPfad))
  })

  // --- Rechnung als bezahlt markieren ---
  app.patch('/api/buero/rechnung/:id/bezahlt', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [r] = await db
      .select({ status: rechnungen.status })
      .from(rechnungen)
      .where(eq(rechnungen.id, id))
      .limit(1)
    if (!r) return reply.code(404).send({ error: 'Rechnung nicht gefunden' })
    if (r.status !== 'offen') {
      return reply.code(400).send({ error: 'Rechnung ist nicht offen' })
    }
    await db
      .update(rechnungen)
      .set({ status: 'bezahlt', bezahltAm: new Date() })
      .where(eq(rechnungen.id, id))
    return { ok: true }
  })

  // --- Freie Rechnung erstellen (ohne Auftrag) ---
  app.post('/api/buero/rechnung', nurBuero, async (req, reply) => {
    const body = (req.body ?? {}) as {
      kundeId?: string
      objekt?: string
      beschreibung?: string
      leistungsdatum?: string | null
      positionen?: Array<{ bezeichnung: string; menge: number; einheit: string; einzelpreis: number }>
    }
    if (!body.kundeId) {
      return reply.code(400).send({ error: 'Kunde ist erforderlich' })
    }
    if (!body.positionen || body.positionen.length === 0) {
      return reply.code(400).send({ error: 'Mindestens eine Position erforderlich' })
    }

    const [k] = await db
      .select({ id: kunden.id, name: kunden.name, adresse: kunden.adresse })
      .from(kunden)
      .where(eq(kunden.id, body.kundeId))
      .limit(1)
    if (!k) return reply.code(400).send({ error: 'Kunde nicht gefunden' })

    const datum = heuteIso()
    const jahr = Number(datum.slice(0, 4))
    const stamm = await holeStammwerte(datum)
    const mwstSatz = Number(stamm.mwst_satz ?? '19')

    const positionen: Position[] = body.positionen.map((p, i) => {
      const menge = Number(p.menge)
      const einzelpreis = Number(p.einzelpreis)
      return {
        pos: i + 1,
        bezeichnung: String(p.bezeichnung).trim(),
        menge,
        einheit: String(p.einheit || 'Stück'),
        einzelpreis,
        betrag: round2(menge * einzelpreis),
      }
    })
    const summen = berechneSummen(positionen, mwstSatz)

    const kunde = {
      name: k.name,
      adresse: k.adresse,
      nummer: kundennummer(k.id),
    }

    try {
      const ergebnis = await db.transaction(async (tx) => {
        const res = await tx.execute(sql`
          INSERT INTO rechnung_zaehler (jahr, letzte_nr) VALUES (${jahr}, 1)
          ON CONFLICT (jahr) DO UPDATE SET letzte_nr = rechnung_zaehler.letzte_nr + 1
          RETURNING letzte_nr
        `)
        const laufendeNr = Number((res.rows[0] as { letzte_nr: number }).letzte_nr)
        const nummer = `${jahr}-${laufendeNr.toString().padStart(4, '0')}`
        const pdfPfad = path.join(RECHNUNG_DIR, `${nummer}.pdf`)

        await erzeugeRechnungPdf(
          {
            nummer,
            datum,
            leistungsdatum: body.leistungsdatum ?? null,
            firma: stamm,
            kunde,
            objekt: body.objekt ?? null,
            beschreibung: body.beschreibung ?? null,
            positionen,
            summen,
          },
          pdfPfad,
        )

        const [neu] = await tx
          .insert(rechnungen)
          .values({
            auftragId: null,
            kundeId: k.id,
            nummer,
            jahr,
            laufendeNr,
            datum,
            leistungsdatum: body.leistungsdatum ?? null,
            objekt: body.objekt ?? null,
            beschreibung: body.beschreibung ?? null,
            firmaSnapshot: stamm,
            kundeSnapshot: kunde,
            positionen,
            netto: summen.netto.toFixed(2),
            mwstSatz: summen.mwstSatz.toFixed(2),
            mwstBetrag: summen.mwstBetrag.toFixed(2),
            brutto: summen.brutto.toFixed(2),
            pdfPfad,
          })
          .returning({ id: rechnungen.id, nummer: rechnungen.nummer })
        return neu
      })
      return reply.code(201).send(ergebnis)
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Rechnung konnte nicht erstellt werden' })
    }
  })

  // --- Mail-Daten für eine Rechnung (Empfänger, Betreff, Text aus Vorlagen) ---
  app.get('/api/buero/rechnung/:id/mail', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [r] = await db
      .select({
        id: rechnungen.id,
        nummer: rechnungen.nummer,
        brutto: rechnungen.brutto,
        kundeSnapshot: rechnungen.kundeSnapshot,
        firmaSnapshot: rechnungen.firmaSnapshot,
        kundeEmail: kunden.email,
      })
      .from(rechnungen)
      .leftJoin(kunden, eq(rechnungen.kundeId, kunden.id))
      .where(eq(rechnungen.id, id))
      .limit(1)
    if (!r) return reply.code(404).send({ error: 'Rechnung nicht gefunden' })

    const stamm = await holeStammwerte(heuteIso())
    const platzhalter = {
      rechnungsnummer: r.nummer,
      kundenname: (r.kundeSnapshot as { name?: string })?.name ?? '',
      betrag: formatBetrag(Number(r.brutto)),
      firmenname:
        stamm.firmenname ??
        (r.firmaSnapshot as { firmenname?: string })?.firmenname ??
        '',
    }
    const fuelle = (text: string) =>
      text.replace(/\{(\w+)\}/g, (_m, key) =>
        key in platzhalter ? String((platzhalter as Record<string, string>)[key]) : `{${key}}`,
      )

    return {
      empfaenger: r.kundeEmail ?? '',
      betreff: fuelle(stamm.mail_betreff_vorlage ?? 'Rechnung {rechnungsnummer}'),
      text: fuelle(stamm.mail_text_vorlage ?? ''),
      hinweisText: stamm.mail_hinweis_text ?? '',
      hinweisAktiv: (stamm.mail_hinweis_aktiv ?? 'true') === 'true',
      pdfUrl: `/api/buero/rechnung/${r.id}/pdf`,
    }
  })

  // --- Kundenverwaltung ---
  app.get('/api/buero/kunden', nurBuero, async (req) => {
    const { q } = req.query as { q?: string }
    const basis = db
      .select()
      .from(kunden)
      .orderBy(asc(kunden.name))
    if (q && q.trim()) {
      const muster = `%${q.trim()}%`
      return basis.where(
        or(ilike(kunden.name, muster), ilike(kunden.adresse, muster)),
      )
    }
    return basis
  })

  app.post('/api/buero/kunden', nurBuero, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>
    const name = b.name?.trim()
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    const [neu] = await db
      .insert(kunden)
      .values({
        name,
        adresse: b.adresse?.trim() || null,
        telefon: b.telefon?.trim() || null,
        email: b.email?.trim() || null,
        notiz: b.notiz?.trim() || null,
      })
      .returning({ id: kunden.id })
    return reply.code(201).send(neu)
  })

  app.patch('/api/buero/kunden/:id', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as Record<string, string>
    const name = b.name?.trim()
    if (!name) return reply.code(400).send({ error: 'Name ist erforderlich' })
    await db
      .update(kunden)
      .set({
        name,
        adresse: b.adresse?.trim() || null,
        telefon: b.telefon?.trim() || null,
        email: b.email?.trim() || null,
        notiz: b.notiz?.trim() || null,
      })
      .where(eq(kunden.id, id))
    return { ok: true }
  })

  // --- Material-Katalog-Pflege ---
  app.get('/api/buero/katalog', nurBuero, async () =>
    db.select().from(materialKatalog).orderBy(asc(materialKatalog.bezeichnung)),
  )

  app.post('/api/buero/katalog', nurBuero, async (req, reply) => {
    const b = (req.body ?? {}) as { bezeichnung?: string; einzelpreis?: number; einheit?: string }
    if (!b.bezeichnung?.trim() || typeof b.einzelpreis !== 'number') {
      return reply.code(400).send({ error: 'Bezeichnung und Einzelpreis erforderlich' })
    }
    const [neu] = await db
      .insert(materialKatalog)
      .values({
        bezeichnung: b.bezeichnung.trim(),
        einzelpreis: b.einzelpreis.toFixed(2),
        einheit: b.einheit?.trim() || 'Stück',
      })
      .returning({ id: materialKatalog.id })
    return reply.code(201).send(neu)
  })

  app.patch('/api/buero/katalog/:id', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const b = (req.body ?? {}) as { bezeichnung?: string; einzelpreis?: number; einheit?: string }
    if (!b.bezeichnung?.trim() || typeof b.einzelpreis !== 'number') {
      return reply.code(400).send({ error: 'Bezeichnung und Einzelpreis erforderlich' })
    }
    await db
      .update(materialKatalog)
      .set({
        bezeichnung: b.bezeichnung.trim(),
        einzelpreis: b.einzelpreis.toFixed(2),
        einheit: b.einheit?.trim() || 'Stück',
      })
      .where(eq(materialKatalog.id, id))
    return { ok: true }
  })

  app.delete('/api/buero/katalog/:id', nurBuero, async (req) => {
    const { id } = req.params as { id: string }
    await db.delete(materialKatalog).where(eq(materialKatalog.id, id))
    return { ok: true }
  })

  // --- Stammdaten lesen (mit Historie je Feld) ---
  app.get('/api/buero/stammdaten', nurBuero, async () => {
    const alle = await db
      .select()
      .from(firmaStammdaten)
      .orderBy(asc(firmaStammdaten.feldName), desc(firmaStammdaten.gueltigVon))
    const heute = heuteIso()
    return STAMMDATEN_FELDER.map((feld) => {
      const eintraege = alle
        .filter((e) => e.feldName === feld)
        .map((e) => ({
          id: e.id,
          wert: e.wert,
          gueltigVon: e.gueltigVon,
          gueltigBis: e.gueltigBis,
          aktuell:
            e.gueltigVon <= heute && (e.gueltigBis === null || e.gueltigBis >= heute),
        }))
      return { feldName: feld, eintraege }
    })
  })

  // --- Stammdaten: neuen datierten Wert anlegen ---
  app.post('/api/buero/stammdaten', nurBuero, async (req, reply) => {
    const b = (req.body ?? {}) as { feldName?: string; wert?: string; gueltigVon?: string }
    if (!b.feldName || !STAMMDATEN_FELDER.includes(b.feldName as never)) {
      return reply.code(400).send({ error: 'Unbekanntes Feld' })
    }
    if (b.wert === undefined) return reply.code(400).send({ error: 'Wert fehlt' })
    const gueltigVon = b.gueltigVon || heuteIso()

    await db.transaction(async (tx) => {
      // bisher offenen Wert dieses Feldes mit Enddatum (Vortag) schließen
      await tx
        .update(firmaStammdaten)
        .set({ gueltigBis: vortagIso(gueltigVon) })
        .where(
          and(
            eq(firmaStammdaten.feldName, b.feldName as string),
            sql`${firmaStammdaten.gueltigBis} IS NULL`,
          ),
        )
      await tx.insert(firmaStammdaten).values({
        feldName: b.feldName as string,
        wert: b.wert as string,
        gueltigVon,
        gueltigBis: null,
      })
    })
    return reply.code(201).send({ ok: true })
  })

  // --- Logo-Upload (PNG/JPG/SVG) ---
  app.post('/api/buero/logo', nurBuero, async (req, reply) => {
    const datei = await req.file()
    if (!datei) return reply.code(400).send({ error: 'Keine Datei empfangen' })
    const erlaubt = ['.png', '.jpg', '.jpeg', '.svg']
    const endung = path.extname(datei.filename).toLowerCase() || '.png'
    if (!erlaubt.includes(endung)) {
      return reply.code(400).send({ error: 'Nur PNG, JPG oder SVG erlaubt' })
    }
    const dateiname = `logo_${Date.now()}${endung}`
    const zielPfad = path.join(LOGO_DIR, dateiname)
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(zielPfad)
      datei.file.pipe(ws)
      ws.on('finish', () => resolve())
      ws.on('error', reject)
    })

    const gueltigVon = heuteIso()
    await db.transaction(async (tx) => {
      await tx
        .update(firmaStammdaten)
        .set({ gueltigBis: vortagIso(gueltigVon) })
        .where(
          and(
            eq(firmaStammdaten.feldName, 'logo_pfad'),
            sql`${firmaStammdaten.gueltigBis} IS NULL`,
          ),
        )
      await tx.insert(firmaStammdaten).values({
        feldName: 'logo_pfad',
        wert: zielPfad,
        gueltigVon,
        gueltigBis: null,
      })
    })
    return reply.code(201).send({ ok: true, pfad: zielPfad })
  })
}
