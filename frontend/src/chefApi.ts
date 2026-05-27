import type { Status } from './status'

export interface AuftragRow {
  id: string
  titel: string
  beschreibung: string | null
  status: Status
  termin: string | null
  stunden: number
  stundensatz: number | null
  erstelltAm: string
  erledigtAm: string | null
  kundeName: string | null
  monteurId: string | null
  monteurName: string | null
  materialAnzahl: number
  fotoAnzahl: number
  summe: number
}

export interface Kunde {
  id: string
  name: string
  adresse: string | null
  telefon: string | null
  email: string | null
}

export interface Monteur {
  id: string
  name: string
}

async function holen<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fehler beim Laden (${res.status})`)
  return res.json()
}

async function senden<T>(
  url: string,
  methode: 'POST' | 'PATCH',
  daten: unknown,
): Promise<T> {
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

export const ladeAuftraege = () => holen<AuftragRow[]>('/api/auftraege')
export const ladeKunden = () => holen<Kunde[]>('/api/kunden')
export const ladeMonteure = () => holen<Monteur[]>('/api/monteure')

export const erstelleKunde = (daten: {
  name: string
  adresse?: string
  telefon?: string
  email?: string
}) => senden<{ id: string; name: string }>('/api/kunden', 'POST', daten)

export const erstelleAuftrag = (daten: {
  kundeId: string
  titel: string
  beschreibung?: string
}) => senden<{ id: string }>('/api/auftraege', 'POST', daten)

export const weiseAuftragZu = (
  id: string,
  daten: { monteurId: string; termin: string | null },
) => senden<{ ok: true }>(`/api/auftraege/${id}/zuweisen`, 'PATCH', daten)
