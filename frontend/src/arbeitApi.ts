export interface MaterialPos {
  id: string
  bezeichnung: string
  einzelpreis: number
  menge: number
  einheit: string
}

export interface ArbeitsAuftrag {
  id: string
  titel: string
  beschreibung: string | null
  status: 'geplant' | 'arbeit'
  termin: string | null
  stunden: number
  stundensatz: number | null
  kundeName: string | null
  kundeAdresse: string | null
  fotoAnzahl: number
  material: MaterialPos[]
}

export interface KatalogItem {
  id: string
  bezeichnung: string
  einzelpreis: number
  einheit: string
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

export const ladeMeineAuftraege = () =>
  holen<ArbeitsAuftrag[]>('/api/arbeit/auftraege')
export const ladeKatalog = () => holen<KatalogItem[]>('/api/arbeit/katalog')

export const starteArbeit = (id: string) =>
  senden<{ ok: true }>(`/api/arbeit/auftraege/${id}/start`, 'PATCH')
export const auftragErledigt = (id: string) =>
  senden<{ ok: true }>(`/api/arbeit/auftraege/${id}/erledigt`, 'PATCH')

export const addStunden = (id: string, zusatz: number) =>
  senden<{ stunden: number }>(`/api/arbeit/auftraege/${id}/stunden`, 'POST', {
    zusatz,
  })

export const addMaterial = (
  id: string,
  daten:
    | { katalogId: string; menge: number }
    | { bezeichnung: string; einzelpreis: number; einheit: string; menge: number },
) => senden<{ id: string }>(`/api/arbeit/auftraege/${id}/material`, 'POST', daten)

export const setMenge = (matId: string, menge: number) =>
  senden<{ ok: true }>(`/api/arbeit/material/${matId}`, 'PATCH', { menge })

export const removeMaterial = (matId: string) =>
  senden<{ ok: true }>(`/api/arbeit/material/${matId}`, 'DELETE')

export async function uploadFoto(id: string, datei: File): Promise<void> {
  const form = new FormData()
  form.append('foto', datei)
  const res = await fetch(`/api/arbeit/auftraege/${id}/foto`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const fehler = await res.json().catch(() => ({}))
    throw new Error(fehler.error ?? 'Foto-Upload fehlgeschlagen')
  }
}
