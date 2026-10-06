import { useCallback, useEffect, useState } from 'react'
import {
  ladeAnsprechpartner,
  ladeHausverwaltungen,
  type Ansprechpartner,
  type Hausverwaltung,
} from '../objekteApi'

// Lädt Hausverwaltungen (mit Ansprechpartnern) und alle Ansprechpartner für
// die Dropdowns. `neuLaden` wird nach dem Inline-Anlegen aufgerufen.
export function useStamm() {
  const [hvs, setHvs] = useState<Hausverwaltung[]>([])
  const [aps, setAps] = useState<Ansprechpartner[]>([])

  const neuLaden = useCallback(async () => {
    const [h, a] = await Promise.all([ladeHausverwaltungen(), ladeAnsprechpartner()])
    setHvs(h)
    setAps(a)
  }, [])

  useEffect(() => {
    neuLaden().catch(() => undefined)
  }, [neuLaden])

  return { hvs, aps, neuLaden }
}

// Ansprechpartner, die zu einer Hausverwaltung passen: freie (ohne HV) und die
// der gewählten HV. Archivierte nur, wenn sie aktuell ausgewählt sind.
export function passendeAnsprechpartner(
  aps: Ansprechpartner[],
  hausverwaltungId: string | null,
  gewaehlt: string | null,
): Ansprechpartner[] {
  return aps.filter(
    (a) =>
      (!a.archiviert || a.id === gewaehlt) &&
      (a.hausverwaltungId === null || a.hausverwaltungId === hausverwaltungId),
  )
}
