import { useEffect, useMemo, useState } from 'react'
import {
  ladeVorschau,
  erstelleRechnung,
  type Position,
} from '../bueroApi'
import { formatEuro } from '../format'

interface EditPos {
  bezeichnung: string
  menge: number
  einheit: string
  einzelpreis: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export default function VorschauModal({
  auftragId,
  onAbbrechen,
  onErstellt,
  onFehler,
}: {
  auftragId: string
  onAbbrechen: () => void
  onErstellt: () => void
  onFehler: (f: string | null) => void
}) {
  const [positionen, setPositionen] = useState<EditPos[]>([])
  const [objekt, setObjekt] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [mwstSatz, setMwstSatz] = useState(19)
  const [kunde, setKunde] = useState('')
  const [laedt, setLaedt] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    ladeVorschau(auftragId)
      .then((v) => {
        setPositionen(
          v.positionen.map((p: Position) => ({
            bezeichnung: p.bezeichnung,
            menge: p.menge,
            einheit: p.einheit,
            einzelpreis: p.einzelpreis,
          })),
        )
        setObjekt(v.objekt ?? '')
        setBeschreibung(v.beschreibung ?? '')
        setMwstSatz(v.mwstSatz)
        setKunde(v.kunde.name ?? '')
      })
      .catch((err) => onFehler(err instanceof Error ? err.message : 'Fehler'))
      .finally(() => setLaedt(false))
  }, [auftragId])

  const summen = useMemo(() => {
    const netto = round2(
      positionen.reduce((s, p) => s + round2(p.menge * p.einzelpreis), 0),
    )
    const mwstBetrag = round2((netto * mwstSatz) / 100)
    return { netto, mwstBetrag, brutto: round2(netto + mwstBetrag) }
  }, [positionen, mwstSatz])

  function aendern(i: number, feld: keyof EditPos, wert: string) {
    setPositionen((alt) =>
      alt.map((p, idx) =>
        idx === i
          ? {
              ...p,
              [feld]:
                feld === 'menge' || feld === 'einzelpreis'
                  ? Number(wert.replace(',', '.')) || 0
                  : wert,
            }
          : p,
      ),
    )
  }

  function entfernen(i: number) {
    setPositionen((alt) => alt.filter((_, idx) => idx !== i))
  }

  function hinzufuegen() {
    setPositionen((alt) => [
      ...alt,
      { bezeichnung: '', menge: 1, einheit: 'Stück', einzelpreis: 0 },
    ])
  }

  async function erstellen() {
    if (positionen.length === 0) {
      onFehler('Mindestens eine Position erforderlich')
      return
    }
    setBusy(true)
    onFehler(null)
    try {
      await erstelleRechnung(auftragId, { positionen, objekt, beschreibung })
      onErstellt()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Erstellen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onAbbrechen}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Rechnungs-Vorschau</h2>
        {laedt ? (
          <p>lädt …</p>
        ) : (
          <>
            <p className="modal-kunde">
              Kunde: <strong>{kunde}</strong>
            </p>
            <label className="modal-feld">
              Objekt
              <input value={objekt} onChange={(e) => setObjekt(e.target.value)} />
            </label>
            <label className="modal-feld">
              Beschreibung
              <textarea
                rows={2}
                value={beschreibung}
                onChange={(e) => setBeschreibung(e.target.value)}
              />
            </label>

            <table className="pos-tabelle">
              <thead>
                <tr>
                  <th>Bezeichnung</th>
                  <th>Menge</th>
                  <th>Einheit</th>
                  <th>Einzelpreis</th>
                  <th className="rechts">Betrag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {positionen.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        value={p.bezeichnung}
                        onChange={(e) => aendern(i, 'bezeichnung', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="schmal"
                        type="number"
                        step="0.01"
                        value={p.menge}
                        onChange={(e) => aendern(i, 'menge', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="schmal"
                        value={p.einheit}
                        onChange={(e) => aendern(i, 'einheit', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="schmal"
                        type="number"
                        step="0.01"
                        value={p.einzelpreis}
                        onChange={(e) => aendern(i, 'einzelpreis', e.target.value)}
                      />
                    </td>
                    <td className="rechts">
                      {formatEuro(round2(p.menge * p.einzelpreis))}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="mat-loeschen"
                        onClick={() => entfernen(i)}
                        aria-label="Position entfernen"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="button" className="neben-button" onClick={hinzufuegen}>
              + Position
            </button>

            <div className="summen">
              <div>
                <span>Gesamt netto</span>
                <strong>{formatEuro(summen.netto)}</strong>
              </div>
              <div>
                <span>MwSt. {mwstSatz}%</span>
                <strong>{formatEuro(summen.mwstBetrag)}</strong>
              </div>
              <div className="summen-brutto">
                <span>Gesamt brutto</span>
                <strong>{formatEuro(summen.brutto)}</strong>
              </div>
            </div>

            <div className="modal-aktionen">
              <button type="button" className="abmelden" onClick={onAbbrechen}>
                Abbrechen
              </button>
              <button
                type="button"
                className="erstellen"
                disabled={busy}
                onClick={erstellen}
              >
                {busy ? 'Erstelle …' : 'Rechnung verbindlich erstellen'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
