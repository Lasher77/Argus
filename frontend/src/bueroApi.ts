import type { AdressBlock, Herkunft, Kandidat } from './objekteApi'

export interface Kennzahlen {
  bereitAnzahl: number
  offeneRechnungenSumme: number
}

export interface ErledigtRow {
  id: string
  titel: string
  ortLabel: string
  erledigtAm: string | null
  summe: number
}

export interface Position {
  pos: number
  bezeichnung: string
  menge: number
  einheit: string
  einzelpreis: number
  betrag: number
}

export interface Summen {
  netto: number
  mwstSatz: number
  mwstBetrag: number
  brutto: number
}

export interface Vorschau {
  auftragId: string
  datum: string
  objekt: string | null
  beschreibung: string | null
  leistungsdatum: string | null
  mwstSatz: number
  positionen: Position[]
  summen: Summen
  kandidaten: Kandidat[]
  standardKey: Herkunft | null
}

// Rechnungsempfänger, wie er mit der Rechnung gespeichert wird.
export interface EmpfaengerEingabe extends AdressBlock {
  herkunft: Herkunft | 'frei'
}

export interface RechnungRow {
  id: string
  nummer: string
  datum: string
  brutto: number
  empfaengerName: string
  empfaengerEmail: string
  status: 'offen' | 'bezahlt'
  auftragId: string | null
}

export interface MailDaten {
  empfaenger: string
  betreff: string
  text: string
  hinweisText: string
  hinweisAktiv: boolean
  pdfUrl: string
}

export interface KatalogItem {
  id: string
  bezeichnung: string
  einzelpreis: string
  einheit: string
}

export interface StammEintrag {
  id: string
  wert: string
  gueltigVon: string
  gueltigBis: string | null
  aktuell: boolean
}

export interface StammFeld {
  feldName: string
  eintraege: StammEintrag[]
}

async function holen<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fehler beim Laden (${res.status})`)
  return res.json()
}

async function senden<T>(
  url: string,
  methode: 'POST' | 'PATCH' | 'DELETE',
  daten?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: methode,
    headers: daten ? { 'Content-Type': 'application/json' } : undefined,
    body: daten ? JSON.stringify(daten) : undefined,
  })
  if (!res.ok) {
    const fehler = await res.json().catch(() => ({}))
    throw new Error(fehler.error ?? 'Aktion fehlgeschlagen')
  }
  return res.json()
}

export const ladeKennzahlen = () => holen<Kennzahlen>('/api/buero/kennzahlen')
export const ladeErledigt = () => holen<ErledigtRow[]>('/api/buero/erledigt')
export const ladeVorschau = (id: string) =>
  holen<Vorschau>(`/api/buero/auftrag/${id}/vorschau`)
export const erstelleRechnung = (
  id: string,
  daten: {
    positionen: Array<{ bezeichnung: string; menge: number; einheit: string; einzelpreis: number }>
    objekt?: string
    beschreibung?: string
    empfaenger: EmpfaengerEingabe
  },
) => senden<{ id: string; nummer: string }>(`/api/buero/auftrag/${id}/rechnung`, 'POST', daten)
export const ladeRechnungen = (status?: 'offen' | 'bezahlt') =>
  holen<RechnungRow[]>(
    `/api/buero/rechnungen${status ? `?status=${status}` : ''}`,
  )
export const erstelleFreieRechnung = (daten: {
  objektId?: string | null
  einheitId?: string | null
  empfaenger: EmpfaengerEingabe
  positionen: Array<{ bezeichnung: string; menge: number; einheit: string; einzelpreis: number }>
  objekt?: string
  beschreibung?: string
  leistungsdatum?: string | null
}) => senden<{ id: string; nummer: string }>('/api/buero/rechnung', 'POST', daten)
export const markiereBezahlt = (rechnungId: string) =>
  senden<{ ok: true }>(`/api/buero/rechnung/${rechnungId}/bezahlt`, 'PATCH')
export const ladeMailDaten = (rechnungId: string) =>
  holen<MailDaten>(`/api/buero/rechnung/${rechnungId}/mail`)
export const pdfUrl = (id: string) => `/api/buero/rechnung/${id}/pdf`

export const ladeKatalog = () => holen<KatalogItem[]>('/api/buero/katalog')
export const erstelleKatalog = (daten: { bezeichnung: string; einzelpreis: number; einheit: string }) =>
  senden<{ id: string }>('/api/buero/katalog', 'POST', daten)
export const aktualisiereKatalog = (id: string, daten: { bezeichnung: string; einzelpreis: number; einheit: string }) =>
  senden<{ ok: true }>(`/api/buero/katalog/${id}`, 'PATCH', daten)
export const loescheKatalog = (id: string) =>
  senden<{ ok: true }>(`/api/buero/katalog/${id}`, 'DELETE')

export const ladeStammdaten = () => holen<StammFeld[]>('/api/buero/stammdaten')
export const neuerStammwert = (feldName: string, wert: string, gueltigVon: string) =>
  senden<{ ok: true }>('/api/buero/stammdaten', 'POST', { feldName, wert, gueltigVon })

export async function uploadLogo(datei: File): Promise<void> {
  const form = new FormData()
  form.append('logo', datei)
  const res = await fetch('/api/buero/logo', { method: 'POST', body: form })
  if (!res.ok) {
    const fehler = await res.json().catch(() => ({}))
    throw new Error(fehler.error ?? 'Logo-Upload fehlgeschlagen')
  }
}
