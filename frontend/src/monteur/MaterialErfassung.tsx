import { useState } from 'react'
import {
  addMaterial,
  setMenge,
  removeMaterial,
  type MonteurAuftrag,
  type KatalogItem,
} from '../monteurApi'
import { formatEuro } from '../format'

export default function MaterialErfassung({
  auftrag,
  katalog,
  onAenderung,
  onFehler,
}: {
  auftrag: MonteurAuftrag
  katalog: KatalogItem[]
  onAenderung: () => void
  onFehler: (f: string | null) => void
}) {
  const [freiOffen, setFreiOffen] = useState(false)
  const [bez, setBez] = useState('')
  const [preis, setPreis] = useState('')
  const [einheit, setEinheit] = useState('Stück')
  const [busy, setBusy] = useState(false)

  async function aktion(fn: () => Promise<unknown>) {
    onFehler(null)
    setBusy(true)
    try {
      await fn()
      onAenderung()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Aktion fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  async function freiHinzufuegen() {
    const p = Number(preis.replace(',', '.'))
    if (!bez.trim() || !isFinite(p) || p < 0) {
      onFehler('Bezeichnung und gültiger Preis erforderlich')
      return
    }
    await aktion(() =>
      addMaterial(auftrag.id, {
        bezeichnung: bez.trim(),
        einzelpreis: p,
        einheit,
        menge: 1,
      }),
    )
    setBez('')
    setPreis('')
    setEinheit('Stück')
    setFreiOffen(false)
  }

  return (
    <div className="m-block">
      <div className="m-block-kopf">
        <span>Material</span>
      </div>

      {auftrag.material.length > 0 && (
        <ul className="mat-liste">
          {auftrag.material.map((m) => (
            <li key={m.id} className="mat-pos">
              <span className="mat-bez">{m.bezeichnung}</span>
              <div className="mat-rechts">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0.5"
                  className="mat-menge"
                  defaultValue={m.menge}
                  onBlur={(e) => {
                    const wert = Number(e.target.value.replace(',', '.'))
                    if (wert > 0 && wert !== m.menge) {
                      aktion(() => setMenge(m.id, wert))
                    }
                  }}
                />
                <span className="mat-einheit">{m.einheit}</span>
                <span className="mat-summe">
                  {formatEuro(m.einzelpreis * m.menge)}
                </span>
                <button
                  type="button"
                  className="mat-loeschen"
                  disabled={busy}
                  onClick={() => aktion(() => removeMaterial(m.id))}
                  aria-label="Position entfernen"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mat-hinweis">Aus Katalog antippen:</p>
      <div className="katalog-buttons">
        {katalog.map((k) => (
          <button
            key={k.id}
            type="button"
            className="katalog-button"
            disabled={busy}
            onClick={() =>
              aktion(() => addMaterial(auftrag.id, { katalogId: k.id, menge: 1 }))
            }
          >
            {k.bezeichnung}
            <span className="katalog-preis">{formatEuro(k.einzelpreis)}</span>
          </button>
        ))}
      </div>

      {!freiOffen ? (
        <button
          type="button"
          className="neben-button"
          onClick={() => setFreiOffen(true)}
        >
          + Freie Position
        </button>
      ) : (
        <div className="frei-eingabe">
          <input
            placeholder="Bezeichnung"
            value={bez}
            onChange={(e) => setBez(e.target.value)}
          />
          <div className="frei-zeile">
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="Preis €"
              value={preis}
              onChange={(e) => setPreis(e.target.value)}
            />
            <select value={einheit} onChange={(e) => setEinheit(e.target.value)}>
              <option>Stück</option>
              <option>Meter</option>
              <option>kg</option>
              <option>Stunde</option>
            </select>
          </div>
          <div className="frei-zeile">
            <button
              type="button"
              className="neben-button"
              disabled={busy}
              onClick={freiHinzufuegen}
            >
              Hinzufügen
            </button>
            <button
              type="button"
              className="abmelden"
              onClick={() => setFreiOffen(false)}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
