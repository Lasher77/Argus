import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  auftraege,
  auftragMaterial,
  einheiten,
  materialKatalog,
  objekte,
  rechnungen,
  firmaStammdaten,
} from '../db/schema.js'
import { requireRole } from '../auth.js'
import { berechneSummen, round2, type Position } from '../lib/geld.js'
import { holeStammwerte, STAMMDATEN_FELDER } from '../lib/stammdaten.js'
import { erzeugeRechnungPdf } from '../lib/rechnungPdf.js'
import { blockAusEingabe, ladeKontext, type Herkunft } from '../lib/objekte.js'

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

interface Empfaenger {
  empfaenger: string
  strasse: string
  ort: string
  email: string
  kundennr: string
  herkunft: Herkunft | 'frei'
}

// Rechnungsempfänger aus dem Request prüfen. Eine deutsche Rechnung braucht die
// vollständige Anschrift des Empfängers (Name, Straße + Nr., PLZ + Ort).
function empfaengerAusBody(
  raw: unknown,
): { empfaenger: Empfaenger } | { fehler: string } {
  const b = blockAusEingabe(raw as Record<string, string> | null)
  if (!b.empfaenger || !b.strasse || !b.ort) {
    return { fehler: 'Rechnungsempfänger: Name, Straße + Hausnummer und PLZ + Ort sind erforderlich' }
  }
  const h = (raw as { herkunft?: string } | null)?.herkunft
  const herkunft: Empfaenger['herkunft'] =
    h === 'einheit' || h === 'objekt' || h === 'hausverwaltung' ? h : 'frei'
  return { empfaenger: { ...b, herkunft } }
}

// Positionen prüfen und je Position auf 2 Nachkommastellen runden.
function positionenAusBody(
  raw: unknown,
): { positionen: Position[] } | { fehler: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { fehler: 'Mindestens eine Position erforderlich' }
  }
  const positionen: Position[] = []
  for (const [i, p] of raw.entries()) {
    const bezeichnung = String(p?.bezeichnung ?? '').trim()
    const menge = Number(p?.menge)
    const einzelpreis = Number(p?.einzelpreis)
    if (!bezeichnung) return { fehler: `Position ${i + 1}: Bezeichnung fehlt` }
    if (!isFinite(menge) || menge <= 0) return { fehler: `Position ${i + 1}: Menge ungültig` }
    if (!isFinite(einzelpreis)) return { fehler: `Position ${i + 1}: Einzelpreis ungültig` }
    positionen.push({
      pos: i + 1,
      bezeichnung,
      menge,
      einheit: String(p?.einheit || 'Stück'),
      einzelpreis,
      betrag: round2(menge * einzelpreis),
    })
  }
  return { positionen }
}

// Gemeinsamer Erstellungsweg für auftragsbasierte UND freie Rechnungen:
// lückenlose Jahresnummer (atomar), Stammdaten- und Empfänger-Snapshot, PDF,
// bei Auftragsbezug Status des Auftrags -> "berechnet".
async function erstelleRechnung(p: {
  auftragId: string | null
  objektId: string | null
  einheitId: string | null
  empfaenger: Empfaenger
  objekt: string | null
  beschreibung: string | null
  leistungsdatum: string | null
  positionen: Position[]
}) {
  const datum = heuteIso()
  const jahr = Number(datum.slice(0, 4))
  const stamm = await holeStammwerte(datum)
  const mwstSatz = Number(stamm.mwst_satz ?? '19')
  const summen = berechneSummen(p.positionen, mwstSatz)

  return db.transaction(async (tx) => {
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
        leistungsdatum: p.leistungsdatum,
        firma: stamm,
        empfaenger: p.empfaenger,
        objekt: p.objekt,
        beschreibung: p.beschreibung,
        positionen: p.positionen,
        summen,
      },
      pdfPfad,
    )

    const [neu] = await tx
      .insert(rechnungen)
      .values({
        auftragId: p.auftragId,
        objektId: p.objektId,
        einheitId: p.einheitId,
        nummer,
        jahr,
        laufendeNr,
        datum,
        leistungsdatum: p.leistungsdatum,
        objekt: p.objekt,
        beschreibung: p.beschreibung,
        firmaSnapshot: stamm,
        empfaengerSnapshot: p.empfaenger,
        positionen: p.positionen,
        netto: summen.netto.toFixed(2),
        mwstSatz: summen.mwstSatz.toFixed(2),
        mwstBetrag: summen.mwstBetrag.toFixed(2),
        brutto: summen.brutto.toFixed(2),
        pdfPfad,
      })
      .returning({ id: rechnungen.id, nummer: rechnungen.nummer })

    if (p.auftragId) {
      await tx.update(auftraege).set({ status: 'berechnet' }).where(eq(auftraege.id, p.auftragId))
    }
    return neu
  })
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
        objektName: objekte.name,
        einheitName: einheiten.bezeichnung,
      })
      .from(auftraege)
      .leftJoin(objekte, eq(auftraege.objektId, objekte.id))
      .leftJoin(einheiten, eq(auftraege.einheitId, einheiten.id))
      .leftJoin(rechnungen, eq(rechnungen.auftragId, auftraege.id))
      .where(and(eq(auftraege.status, 'erledigt'), sql`${rechnungen.id} IS NULL`))
      .orderBy(desc(auftraege.erledigtAm))

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        titel: r.titel,
        ortLabel: r.objektName
          ? `${r.objektName}${r.einheitName ? ` · ${r.einheitName}` : ''}`
          : 'Freier Auftrag',
        erledigtAm: r.erledigtAm,
        summe: await auftragSumme(r.id, Number(r.stunden ?? 0), Number(r.stundensatz ?? 0)),
      })),
    )
  })

  // --- Rechnungs-Vorschau (editierbare Positionen + wählbare Rechnungsadressen) ---
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
        objektId: auftraege.objektId,
        einheitId: auftraege.einheitId,
        einsatzort: auftraege.einsatzort,
      })
      .from(auftraege)
      .where(eq(auftraege.id, id))
      .limit(1)
    if (!a) return reply.code(404).send({ error: 'Auftrag nicht gefunden' })
    if (a.status !== 'erledigt') {
      return reply.code(400).send({ error: 'Nur erledigte Aufträge können berechnet werden' })
    }

    // Einheit-Auftrag -> Daten der Einheit, Objekt-Auftrag -> Daten des Objekts
    // (mit Rückfall auf die Hausverwaltung); freier Auftrag -> keine Vorbelegung.
    const kontext = await ladeKontext(a.objektId, a.einheitId)

    const datum = heuteIso()
    const stamm = await holeStammwerte(datum)
    const mwstSatz = Number(stamm.mwst_satz ?? '19')
    const positionen = await vorschauPositionen(a.id, Number(a.stunden ?? 0), Number(a.stundensatz ?? 0))
    const summen = berechneSummen(positionen, mwstSatz)

    return {
      auftragId: a.id,
      datum,
      // "Objekt:"-Zeile der Rechnung: Objekt (+ Einheit) bzw. Einsatzort.
      objekt: kontext.objekt ? kontext.ortLabel : a.einsatzort ?? '',
      beschreibung: a.titel + (a.beschreibung ? ` – ${a.beschreibung}` : ''),
      leistungsdatum: a.erledigtAm ? new Date(a.erledigtAm).toISOString().slice(0, 10) : null,
      mwstSatz,
      positionen,
      summen,
      kandidaten: kontext.kandidaten,
      standardKey: kontext.standardKey,
    }
  })

  // --- Rechnung aus Auftrag erstellen (transaktionssicher, mit Snapshot + PDF) ---
  app.post('/api/buero/auftrag/:id/rechnung', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = (req.body ?? {}) as {
      positionen?: unknown
      objekt?: string
      beschreibung?: string
      empfaenger?: unknown
    }
    const pos = positionenAusBody(body.positionen)
    if ('fehler' in pos) return reply.code(400).send({ error: pos.fehler })
    const emp = empfaengerAusBody(body.empfaenger)
    if ('fehler' in emp) return reply.code(400).send({ error: emp.fehler })

    const [a] = await db
      .select({
        status: auftraege.status,
        erledigtAm: auftraege.erledigtAm,
        objektId: auftraege.objektId,
        einheitId: auftraege.einheitId,
      })
      .from(auftraege)
      .where(eq(auftraege.id, id))
      .limit(1)
    if (!a) return reply.code(404).send({ error: 'Auftrag nicht gefunden' })
    if (a.status !== 'erledigt') {
      return reply.code(400).send({ error: 'Auftrag ist nicht im Status "erledigt"' })
    }

    try {
      const ergebnis = await erstelleRechnung({
        auftragId: id,
        objektId: a.objektId,
        einheitId: a.einheitId,
        empfaenger: emp.empfaenger,
        objekt: body.objekt?.trim() || null,
        beschreibung: body.beschreibung?.trim() || null,
        leistungsdatum: a.erledigtAm ? new Date(a.erledigtAm).toISOString().slice(0, 10) : null,
        positionen: pos.positionen,
      })
      return reply.code(201).send(ergebnis)
    } catch (err) {
      app.log.error(err)
      return reply.code(500).send({ error: 'Rechnung konnte nicht erstellt werden' })
    }
  })

  // --- Freie Rechnung erstellen (ohne Auftrag) ---
  app.post('/api/buero/rechnung', nurBuero, async (req, reply) => {
    const body = (req.body ?? {}) as {
      objektId?: string | null
      einheitId?: string | null
      empfaenger?: unknown
      objekt?: string
      beschreibung?: string
      leistungsdatum?: string | null
      positionen?: unknown
    }
    const pos = positionenAusBody(body.positionen)
    if ('fehler' in pos) return reply.code(400).send({ error: pos.fehler })
    const emp = empfaengerAusBody(body.empfaenger)
    if ('fehler' in emp) return reply.code(400).send({ error: emp.fehler })

    // Objekt/Einheit sind optional und dienen nur dem Bezug; müssen aber existieren.
    const kontext = await ladeKontext(body.objektId || null, body.einheitId || null)
    if (body.einheitId && !kontext.einheit) {
      return reply.code(400).send({ error: 'Einheit nicht gefunden' })
    }
    if (body.objektId && !kontext.objekt) {
      return reply.code(400).send({ error: 'Objekt nicht gefunden' })
    }

    try {
      const ergebnis = await erstelleRechnung({
        auftragId: null,
        objektId: kontext.objekt?.id ?? null,
        einheitId: kontext.einheit?.id ?? null,
        empfaenger: emp.empfaenger,
        objekt: body.objekt?.trim() || null,
        beschreibung: body.beschreibung?.trim() || null,
        leistungsdatum: body.leistungsdatum ?? null,
        positionen: pos.positionen,
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
        empfaengerSnapshot: rechnungen.empfaengerSnapshot,
        status: rechnungen.status,
        auftragId: rechnungen.auftragId,
      })
      .from(rechnungen)
      .orderBy(desc(rechnungen.nummer))
    const rows =
      status === 'offen' || status === 'bezahlt'
        ? await basis.where(eq(rechnungen.status, status))
        : await basis
    return rows.map((r) => {
      const emp = r.empfaengerSnapshot as { empfaenger?: string; email?: string }
      return {
        id: r.id,
        nummer: r.nummer,
        datum: r.datum,
        brutto: Number(r.brutto),
        empfaengerName: emp?.empfaenger ?? '',
        empfaengerEmail: emp?.email ?? '',
        status: r.status,
        auftragId: r.auftragId,
      }
    })
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

  // --- Mail-Daten für eine Rechnung (Empfänger, Betreff, Text aus Vorlagen) ---
  app.get('/api/buero/rechnung/:id/mail', nurBuero, async (req, reply) => {
    const { id } = req.params as { id: string }
    const [r] = await db
      .select({
        id: rechnungen.id,
        nummer: rechnungen.nummer,
        brutto: rechnungen.brutto,
        empfaengerSnapshot: rechnungen.empfaengerSnapshot,
        firmaSnapshot: rechnungen.firmaSnapshot,
      })
      .from(rechnungen)
      .where(eq(rechnungen.id, id))
      .limit(1)
    if (!r) return reply.code(404).send({ error: 'Rechnung nicht gefunden' })

    const emp = r.empfaengerSnapshot as { empfaenger?: string; email?: string }
    const stamm = await holeStammwerte(heuteIso())
    const platzhalter: Record<string, string> = {
      rechnungsnummer: r.nummer,
      // {kundenname} bleibt als Alias bestehen, damit gespeicherte Vorlagen weiter funktionieren.
      kundenname: emp?.empfaenger ?? '',
      empfaenger: emp?.empfaenger ?? '',
      betrag: formatBetrag(Number(r.brutto)),
      firmenname:
        stamm.firmenname ??
        (r.firmaSnapshot as { firmenname?: string })?.firmenname ??
        '',
    }
    const fuelle = (text: string) =>
      text.replace(/\{(\w+)\}/g, (_m, key) =>
        key in platzhalter ? platzhalter[key] : `{${key}}`,
      )

    return {
      empfaenger: emp?.email ?? '',
      betreff: fuelle(stamm.mail_betreff_vorlage ?? 'Rechnung {rechnungsnummer}'),
      text: fuelle(stamm.mail_text_vorlage ?? ''),
      hinweisText: stamm.mail_hinweis_text ?? '',
      hinweisAktiv: (stamm.mail_hinweis_aktiv ?? 'true') === 'true',
      pdfUrl: `/api/buero/rechnung/${r.id}/pdf`,
    }
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
