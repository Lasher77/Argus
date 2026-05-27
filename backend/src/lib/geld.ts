// Kaufmännisch auf zwei Nachkommastellen runden.
export function round2(wert: number): number {
  return Math.round((wert + Number.EPSILON) * 100) / 100
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

// Rundungslogik laut Vorgabe:
//  - jede Position auf 2 Stellen runden
//  - Netto = Summe der gerundeten Positionsbeträge
//  - MwSt auf das Netto, dann auf 2 Stellen runden
//  - Brutto = Netto + gerundete MwSt
export function berechneSummen(
  positionen: Position[],
  mwstSatz: number,
): Summen {
  const netto = round2(positionen.reduce((s, p) => s + round2(p.betrag), 0))
  const mwstBetrag = round2((netto * mwstSatz) / 100)
  const brutto = round2(netto + mwstBetrag)
  return { netto, mwstSatz, mwstBetrag, brutto }
}
