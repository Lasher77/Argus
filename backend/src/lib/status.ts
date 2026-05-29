// Fester Auftrags-Lebenszyklus (siehe CLAUDE.md). Reihenfolge ist bewusst
// eindimensional: Wechsel sind nur eine Stufe vorwärts oder zurück erlaubt,
// kein freies Springen.
// Lebenszyklus eines Auftrags. Rechnung/Bezahlung sind eigene Objekte in
// der Tabelle `rechnungen` und nicht mehr Status des Auftrags.
export const STATUS_REIHENFOLGE = [
  'neu',
  'geplant',
  'arbeit',
  'erledigt',
  'berechnet',
] as const

export type Status = (typeof STATUS_REIHENFOLGE)[number]

export function istErlaubterStatuswechsel(von: Status, nach: Status): boolean {
  const i = STATUS_REIHENFOLGE.indexOf(von)
  const j = STATUS_REIHENFOLGE.indexOf(nach)
  if (i < 0 || j < 0) return false
  return Math.abs(i - j) === 1
}
