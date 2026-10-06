// API-Schicht für Hausverwaltungen, Ansprechpartner, Objekte und Einheiten.
// Genutzt vom Büro-Tab "Objekte" und inline beim Chef (Auftrag anlegen).

export type RechnungQuelle = 'eigen' | 'objekt' | 'hausverwaltung'
export type Herkunft = 'einheit' | 'objekt' | 'hausverwaltung'

// Rechnungsadress-Felder, wie sie an Hausverwaltung/Objekt/Einheit gespeichert sind.
export interface AdressFelder {
  rechnungEmpfaenger: string | null
  rechnungStrasse: string | null // Straße + Hausnummer in einer Zeile
  rechnungOrt: string | null // PLZ + Stadt in einer Zeile
  rechnungEmail: string | null
  rechnungKundennr: string | null
}

// Aufgelöster Block für die Rechnung (Empfänger-Snapshot).
export interface AdressBlock {
  empfaenger: string
  strasse: string
  ort: string
  email: string
  kundennr: string
}

export interface Ansprechpartner {
  id: string
  name: string
  rolle: string | null
  telefon: string | null
  email: string | null
  notiz: string | null
  hausverwaltungId: string | null
  archiviert: boolean
}

export interface Hausverwaltung extends AdressFelder {
  id: string
  name: string
  notiz: string | null
  archiviert: boolean
  ansprechpartner: Ansprechpartner[]
}

interface Stammbasis extends AdressFelder {
  id: string
  hausverwaltungId: string | null
  ansprechpartnerId: string | null
  vorOrtName: string | null
  vorOrtTelefon: string | null
  vorOrtEmail: string | null
  rechnungQuelle: RechnungQuelle
  notiz: string | null
  archiviert: boolean
}

export interface Einheit extends Stammbasis {
  objektId: string
  bezeichnung: string
}

export interface Objekt extends Stammbasis {
  name: string
  strasse: string | null
  hausnummer: string | null
  plz: string | null
  ort: string | null
  adresse: string
  hausverwaltungName: string | null
  einheiten: Einheit[]
}

export interface Kandidat {
  key: Herkunft
  label: string
  block: AdressBlock
}

export interface Kontext {
  ortLabel: string
  adresse: string
  hausverwaltung: { id: string; name: string } | null
  ansprechpartner: { id: string; name: string; telefon: string | null; email: string | null } | null
  vorOrt: { name: string; telefon: string; email: string }
  kandidaten: Kandidat[]
  standardKey: Herkunft | null
}

async function holen<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fehler beim Laden (${res.status})`)
  return res.json()
}

async function senden<T>(url: string, methode: 'POST' | 'PATCH', daten: unknown): Promise<T> {
  const res = await fetch(url, {
    method: methode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(daten),
  })
  if (!res.ok) {
    const fehler = await res.json().catch(() => ({}))
    throw new Error(fehler.error ?? 'Aktion fehlgeschlagen')
  }
  return res.json()
}

type Daten = Record<string, unknown>
type Angelegt = { id: string; name?: string; bezeichnung?: string }

export const ladeHausverwaltungen = () => holen<Hausverwaltung[]>('/api/hausverwaltungen')
export const erstelleHausverwaltung = (d: Daten) => senden<Angelegt>('/api/hausverwaltungen', 'POST', d)
export const aktualisiereHausverwaltung = (id: string, d: Daten) =>
  senden<{ ok: true }>(`/api/hausverwaltungen/${id}`, 'PATCH', d)
export const archiviereHausverwaltung = (id: string, archiviert: boolean) =>
  senden<{ ok: true }>(`/api/hausverwaltungen/${id}/archiv`, 'PATCH', { archiviert })

export const ladeAnsprechpartner = () => holen<Ansprechpartner[]>('/api/ansprechpartner')
export const erstelleAnsprechpartner = (d: Daten) => senden<Angelegt>('/api/ansprechpartner', 'POST', d)
export const aktualisiereAnsprechpartner = (id: string, d: Daten) =>
  senden<{ ok: true }>(`/api/ansprechpartner/${id}`, 'PATCH', d)
export const archiviereAnsprechpartner = (id: string, archiviert: boolean) =>
  senden<{ ok: true }>(`/api/ansprechpartner/${id}/archiv`, 'PATCH', { archiviert })

export const ladeObjekte = () => holen<Objekt[]>('/api/objekte')
export const erstelleObjekt = (d: Daten) => senden<Angelegt>('/api/objekte', 'POST', d)
export const aktualisiereObjekt = (id: string, d: Daten) =>
  senden<{ ok: true }>(`/api/objekte/${id}`, 'PATCH', d)
export const archiviereObjekt = (id: string, archiviert: boolean) =>
  senden<{ ok: true }>(`/api/objekte/${id}/archiv`, 'PATCH', { archiviert })

export const erstelleEinheit = (objektId: string, d: Daten) =>
  senden<Angelegt>(`/api/objekte/${objektId}/einheiten`, 'POST', d)
export const aktualisiereEinheit = (id: string, d: Daten) =>
  senden<{ ok: true }>(`/api/einheiten/${id}`, 'PATCH', d)
export const archiviereEinheit = (id: string, archiviert: boolean) =>
  senden<{ ok: true }>(`/api/einheiten/${id}/archiv`, 'PATCH', { archiviert })

export const ladeKontext = (objektId: string, einheitId?: string) =>
  holen<Kontext>(
    `/api/objekte/${objektId}/kontext${einheitId ? `?einheitId=${einheitId}` : ''}`,
  )
