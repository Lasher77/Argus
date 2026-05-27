import fs from 'node:fs'
import PDFDocument from 'pdfkit'
import type { Position, Summen } from './geld.js'
import type { Stammwerte } from './stammdaten.js'

export interface RechnungPdfDaten {
  nummer: string
  datum: string // YYYY-MM-DD
  leistungsdatum?: string | null
  firma: Stammwerte
  kunde: { name: string; adresse: string | null; nummer: string }
  objekt?: string | null
  beschreibung?: string | null
  positionen: Position[]
  summen: Summen
}

// --- Formatierung -----------------------------------------------------------
function euro(n: number): string {
  const neg = n < 0
  const [g, c] = Math.abs(n).toFixed(2).split('.')
  const ganz = g.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}${ganz},${c} €`
}

function datumDe(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function mengeDe(n: number): string {
  return n
    .toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/ /g, ' ')
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

// --- Geometrie --------------------------------------------------------------
const M = 50 // Seitenrand
const RECHTS = 545 // rechter Textrand (A4 595 - 50)

// Spalten der Positionstabelle
const COL_ART = { x: 53, w: 257 }
const COL_MENGE = { x: 312, w: 78 }
const COL_PREIS = { x: 392, w: 73 }
const COL_BETRAG = { x: 467, w: 78 }

export function erzeugeRechnungPdf(
  daten: RechnungPdfDaten,
  zielPfad: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: M })
    const stream = fs.createWriteStream(zielPfad)
    stream.on('finish', () => resolve())
    stream.on('error', reject)
    doc.on('error', reject)
    doc.pipe(stream)

    const f = daten.firma

    // --- Kopf: Logo + Firmenname/Adresse ---
    if (f.logo_pfad && fs.existsSync(f.logo_pfad)) {
      try {
        doc.image(f.logo_pfad, M, 45, { fit: [80, 80] })
      } catch {
        /* ungültiges Logo ignorieren */
      }
    }
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#111')
    doc.text(f.firmenname ?? '', 145, 52)
    doc.font('Helvetica').fontSize(10).fillColor('#333')
    doc.text(f.firmenadresse ?? '', 145, 72)

    // --- Metadaten rechts oben (zweispaltig: Label links, Wert rechts) ---
    const metaX = 355
    const metaW = RECHTS - metaX
    let my = 110
    const metaZeile = (label: string, wert: string) => {
      doc.font('Helvetica').fontSize(9).fillColor('#333')
      doc.text(label, metaX, my, { width: 90, align: 'left' })
      doc.text(wert, metaX, my, { width: metaW, align: 'right' })
      my += 13
    }
    metaZeile('Rechnungsnr:', daten.nummer)
    metaZeile('Kundennr:', daten.kunde.nummer)
    metaZeile('Datum:', datumDe(daten.datum))
    my += 6
    if (f.telefon) metaZeile('Telefon:', f.telefon)
    if (f.mobil) metaZeile('Mobil:', f.mobil)
    if (f.telefax) metaZeile('Telefax:', f.telefax)
    if (f.email) metaZeile('Email:', f.email)
    my += 6
    if (f.steuernummer) metaZeile('Steuer Nr.:', f.steuernummer)
    if (f.ust_idnr) metaZeile('USt-IdNr.:', f.ust_idnr)

    // --- Absender-Kleinzeile + Empfängeranschrift links ---
    doc.font('Helvetica').fontSize(7.5).fillColor('#555')
    doc.text(
      `${f.firmenname ?? ''} · ${f.firmenadresse ?? ''}`,
      M,
      150,
      { width: 270 },
    )
    doc.font('Helvetica').fontSize(10.5).fillColor('#111')
    const empf = [daten.kunde.name, daten.kunde.adresse ?? ''].filter(Boolean)
    doc.text(empf.join('\n'), M, 168, { width: 270 })

    // --- Überschrift ---
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111')
    doc.text('Rechnung', M, 250)

    // --- Objekt / Beschreibung / Leistungsdatum ---
    let y = 285
    const infoZeile = (label: string, wert: string) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#333')
      doc.text(label, M, y, { width: 90 })
      doc.font('Helvetica').fontSize(10).fillColor('#333')
      doc.text(wert, 145, y, { width: RECHTS - 145 })
      y = doc.y + 4
    }
    if (daten.objekt) infoZeile('Objekt:', daten.objekt)
    if (daten.beschreibung) infoZeile('Beschreibung:', daten.beschreibung)
    if (daten.leistungsdatum && daten.leistungsdatum !== daten.datum) {
      infoZeile('Leistungsdatum:', datumDe(daten.leistungsdatum))
    }

    y += 12

    // --- Positionstabelle: dunkle Kopfzeile ---
    doc.rect(M, y, RECHTS - M, 20).fill('#3f3f46')
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9)
    doc.text('ARTIKEL', COL_ART.x, y + 6, { width: COL_ART.w })
    doc.text('MENGE', COL_MENGE.x, y + 6, { width: COL_MENGE.w, align: 'right' })
    doc.text('EINZELPREIS', COL_PREIS.x, y + 6, { width: COL_PREIS.w, align: 'right' })
    doc.text('BETRAG', COL_BETRAG.x, y + 6, { width: COL_BETRAG.w, align: 'right' })
    y += 20

    // --- Positionszeilen ---
    doc.fillColor('#111')
    for (const p of daten.positionen) {
      const artikel = `Pos ${pad2(p.pos)}  ${p.bezeichnung}`
      doc.font('Helvetica').fontSize(9.5)
      const hoehe = Math.max(
        doc.heightOfString(artikel, { width: COL_ART.w }),
        13,
      )
      // Seitenumbruch, falls nötig
      if (y + hoehe > 720) {
        doc.addPage()
        y = M
      }
      const zy = y + 4
      doc.text(artikel, COL_ART.x, zy, { width: COL_ART.w })
      doc.text(`${mengeDe(p.menge)} ${p.einheit}`, COL_MENGE.x, zy, {
        width: COL_MENGE.w,
        align: 'right',
      })
      doc.text(euro(p.einzelpreis), COL_PREIS.x, zy, {
        width: COL_PREIS.w,
        align: 'right',
      })
      doc.text(euro(p.betrag), COL_BETRAG.x, zy, {
        width: COL_BETRAG.w,
        align: 'right',
      })
      y += hoehe + 8
      doc.strokeColor('#eee').lineWidth(0.5).moveTo(M, y - 4).lineTo(RECHTS, y - 4).stroke()
    }

    // --- Summenblock rechts, grau gerahmt ---
    y += 14
    if (y > 650) {
      doc.addPage()
      y = M
    }
    const boxX = 270
    const boxW = RECHTS - boxX
    const zeilenH = 26
    const boxH = zeilenH * 3
    doc.rect(boxX, y, boxW, boxH).strokeColor('#bbb').lineWidth(1).stroke()

    const valueW = 85
    const summenZeile = (
      label: string,
      wert: string,
      idx: number,
      gross = false,
    ) => {
      const zy = y + idx * zeilenH + (gross ? 7 : 8)
      doc
        .font('Helvetica-Bold')
        .fontSize(gross ? 13 : 9.5)
        .fillColor('#111')
      doc.text(label, boxX + 10, zy, { width: boxW - valueW - 24, align: 'right' })
      doc.text(wert, boxX + boxW - valueW - 8, zy, { width: valueW, align: 'right' })
    }
    summenZeile('GESAMT NETTO', euro(daten.summen.netto), 0)
    summenZeile(
      `MEHRWERTSTEUERSATZ ${mengeDe(daten.summen.mwstSatz)}%`,
      euro(daten.summen.mwstBetrag),
      1,
    )
    summenZeile('GESAMT BRUTTO', euro(daten.summen.brutto), 2, true)

    // --- Fußbereich: Zahlungshinweis + Bankverbindung ---
    const fy = 760
    doc.strokeColor('#ccc').lineWidth(0.5).moveTo(M, fy).lineTo(RECHTS, fy).stroke()
    doc.font('Helvetica').fontSize(8).fillColor('#444')
    if (f.zahlungshinweis) {
      doc.text(f.zahlungshinweis, M, fy + 6, { width: RECHTS - M })
    }
    const bank = [
      f.bank_kontoinhaber && `Kontoinhaber: ${f.bank_kontoinhaber}`,
      f.bank_iban && `IBAN: ${f.bank_iban}`,
      f.bank_bic && `BIC: ${f.bank_bic}`,
      f.bank_name && `Bank: ${f.bank_name}`,
    ]
      .filter(Boolean)
      .join('   ·   ')
    if (bank) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#444')
      doc.text(bank, M, fy + 22, { width: RECHTS - M })
    }

    doc.end()
  })
}
