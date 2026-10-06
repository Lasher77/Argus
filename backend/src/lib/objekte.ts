import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  ansprechpartner,
  einheiten,
  hausverwaltungen,
  objekte,
} from '../db/schema.js'

// Zentrale Auflösung der Vererbung Einheit -> Objekt -> Hausverwaltung.
// Alles, was „effektive" Werte braucht (Auftragsformular, Arbeitsansicht,
// Rechnungsvorschau), nutzt diese Datei – die Regeln stehen nur hier.

export interface AdressBlock {
  empfaenger: string
  strasse: string // Straße + Hausnummer in einer Zeile
  ort: string // PLZ + Stadt in einer Zeile
  email: string
  kundennr: string
}

export type Herkunft = 'einheit' | 'objekt' | 'hausverwaltung'

export interface Kandidat {
  key: Herkunft
  label: string
  block: AdressBlock
}

interface BlockZeile {
  rechnungEmpfaenger: string | null
  rechnungStrasse: string | null
  rechnungOrt: string | null
  rechnungEmail: string | null
  rechnungKundennr: string | null
}

export const leererBlock = (): AdressBlock => ({
  empfaenger: '',
  strasse: '',
  ort: '',
  email: '',
  kundennr: '',
})

export function blockAus(z: BlockZeile): AdressBlock {
  return {
    empfaenger: z.rechnungEmpfaenger?.trim() ?? '',
    strasse: z.rechnungStrasse?.trim() ?? '',
    ort: z.rechnungOrt?.trim() ?? '',
    email: z.rechnungEmail?.trim() ?? '',
    kundennr: z.rechnungKundennr?.trim() ?? '',
  }
}

// Ein Block „zählt", wenn mindestens eine der drei Adresszeilen gefüllt ist.
// E-Mail oder Kundennr. allein ergeben keine Rechnungsadresse.
export const blockLeer = (b: AdressBlock) => !b.empfaenger && !b.strasse && !b.ort

export function blockAusEingabe(b: Partial<AdressBlock> | null | undefined): AdressBlock {
  return {
    empfaenger: String(b?.empfaenger ?? '').trim(),
    strasse: String(b?.strasse ?? '').trim(),
    ort: String(b?.ort ?? '').trim(),
    email: String(b?.email ?? '').trim(),
    kundennr: String(b?.kundennr ?? '').trim(),
  }
}

export function adresseZeile(o: {
  strasse: string | null
  hausnummer: string | null
  plz: string | null
  ort: string | null
}): string {
  const strasse = [o.strasse, o.hausnummer].filter(Boolean).join(' ')
  const ort = [o.plz, o.ort].filter(Boolean).join(' ')
  return [strasse, ort].filter(Boolean).join(', ')
}

type HvZeile = typeof hausverwaltungen.$inferSelect
type ObjektZeile = typeof objekte.$inferSelect
type EinheitZeile = typeof einheiten.$inferSelect

type Quelle = { block: AdressBlock; herkunft: Herkunft | null }

// Nimmt den bevorzugten Eintrag; ist er leer, den nächsten nicht-leeren.
function ersterGefuellter(reihenfolge: Array<[Herkunft, AdressBlock]>): Quelle {
  for (const [herkunft, block] of reihenfolge) {
    if (!blockLeer(block)) return { block, herkunft }
  }
  return { block: leererBlock(), herkunft: null }
}

function loeseObjekt(obj: ObjektZeile, hv: HvZeile | null): Quelle {
  const eigen = blockAus(obj)
  const hvBlock = hv ? blockAus(hv) : leererBlock()
  return obj.rechnungQuelle === 'hausverwaltung'
    ? ersterGefuellter([['hausverwaltung', hvBlock], ['objekt', eigen]])
    : ersterGefuellter([['objekt', eigen], ['hausverwaltung', hvBlock]])
}

function loeseEinheit(
  ein: EinheitZeile,
  obj: ObjektZeile,
  hvObjekt: HvZeile | null,
  hvEinheit: HvZeile | null,
): Quelle {
  const eigen = blockAus(ein)
  const ausObjekt = loeseObjekt(obj, hvObjekt)
  const hvBlock = hvEinheit ? blockAus(hvEinheit) : leererBlock()
  const objektEintrag: [Herkunft, AdressBlock] = [
    ausObjekt.herkunft ?? 'objekt',
    ausObjekt.block,
  ]
  if (ein.rechnungQuelle === 'eigen') {
    return ersterGefuellter([['einheit', eigen], objektEintrag, ['hausverwaltung', hvBlock]])
  }
  if (ein.rechnungQuelle === 'hausverwaltung') {
    return ersterGefuellter([['hausverwaltung', hvBlock], ['einheit', eigen], objektEintrag])
  }
  return ersterGefuellter([objektEintrag, ['einheit', eigen], ['hausverwaltung', hvBlock]])
}

export interface Kontext {
  objekt: ObjektZeile | null
  einheit: EinheitZeile | null
  hausverwaltung: HvZeile | null // effektiv: Einheit vor Objekt
  ansprechpartner: typeof ansprechpartner.$inferSelect | null // effektiv
  vorOrt: { name: string; telefon: string; email: string }
  adresse: string // Objektadresse als eine Zeile ("" wenn keine)
  ortLabel: string // "Objekt · Einheit"
  kandidaten: Kandidat[] // wählbare Rechnungsadressen (nicht leer)
  standardKey: Herkunft | null
}

async function holeHv(id: string | null): Promise<HvZeile | null> {
  if (!id) return null
  const [z] = await db.select().from(hausverwaltungen).where(eq(hausverwaltungen.id, id)).limit(1)
  return z ?? null
}

// Lädt Objekt/Einheit und löst alle geerbten Werte auf.
// Einheit gewählt -> Daten der Einheit (mit Rückfall aufs Objekt),
// nur Objekt -> Daten des Objekts (mit Rückfall auf die Hausverwaltung).
export async function ladeKontext(
  objektId: string | null,
  einheitId: string | null,
): Promise<Kontext> {
  let einheit: EinheitZeile | null = null
  if (einheitId) {
    const [e] = await db.select().from(einheiten).where(eq(einheiten.id, einheitId)).limit(1)
    einheit = e ?? null
    if (einheit) objektId = einheit.objektId
  }
  let objekt: ObjektZeile | null = null
  if (objektId) {
    const [o] = await db.select().from(objekte).where(eq(objekte.id, objektId)).limit(1)
    objekt = o ?? null
  }

  const hvObjekt = await holeHv(objekt?.hausverwaltungId ?? null)
  const hvEinheit = einheit?.hausverwaltungId
    ? await holeHv(einheit.hausverwaltungId)
    : hvObjekt
  const hausverwaltung = hvEinheit

  const apId = einheit?.ansprechpartnerId ?? objekt?.ansprechpartnerId ?? null
  let ap = null
  if (apId) {
    const [a] = await db.select().from(ansprechpartner).where(eq(ansprechpartner.id, apId)).limit(1)
    ap = a ?? null
  }

  const vorOrtEinheit = {
    name: einheit?.vorOrtName?.trim() ?? '',
    telefon: einheit?.vorOrtTelefon?.trim() ?? '',
    email: einheit?.vorOrtEmail?.trim() ?? '',
  }
  const vorOrtObjekt = {
    name: objekt?.vorOrtName?.trim() ?? '',
    telefon: objekt?.vorOrtTelefon?.trim() ?? '',
    email: objekt?.vorOrtEmail?.trim() ?? '',
  }
  const vorOrt =
    vorOrtEinheit.name || vorOrtEinheit.telefon || vorOrtEinheit.email
      ? vorOrtEinheit
      : vorOrtObjekt

  const kandidaten: Kandidat[] = []
  if (einheit && objekt) {
    const q = loeseEinheit(einheit, objekt, hvObjekt, hvEinheit)
    if (!blockLeer(q.block)) {
      kandidaten.push({ key: 'einheit', label: `Einheit „${einheit.bezeichnung}"`, block: q.block })
    }
  }
  if (objekt) {
    const q = loeseObjekt(objekt, hvObjekt)
    if (!blockLeer(q.block)) {
      kandidaten.push({ key: 'objekt', label: `Objekt „${objekt.name}"`, block: q.block })
    }
  }
  if (hausverwaltung) {
    const b = blockAus(hausverwaltung)
    if (!blockLeer(b)) {
      kandidaten.push({
        key: 'hausverwaltung',
        label: `Hausverwaltung „${hausverwaltung.name}"`,
        block: b,
      })
    }
  }

  return {
    objekt,
    einheit,
    hausverwaltung,
    ansprechpartner: ap,
    vorOrt,
    adresse: objekt ? adresseZeile(objekt) : '',
    ortLabel: objekt
      ? `${objekt.name}${einheit ? ` · ${einheit.bezeichnung}` : ''}`
      : 'Freier Auftrag',
    kandidaten,
    standardKey: kandidaten[0]?.key ?? null,
  }
}

// Ein Ansprechpartner passt, wenn er frei steht oder zur effektiven
// Hausverwaltung gehört.
export async function ansprechpartnerPasst(
  ansprechpartnerId: string | null,
  hausverwaltungId: string | null,
): Promise<boolean> {
  if (!ansprechpartnerId) return true
  const [a] = await db
    .select({ hv: ansprechpartner.hausverwaltungId })
    .from(ansprechpartner)
    .where(eq(ansprechpartner.id, ansprechpartnerId))
    .limit(1)
  if (!a) return false
  return a.hv === null || a.hv === hausverwaltungId
}
