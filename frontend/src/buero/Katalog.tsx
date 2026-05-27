import { useEffect, useState, type FormEvent } from 'react'
import {
  ladeKatalog,
  erstelleKatalog,
  aktualisiereKatalog,
  loescheKatalog,
  type KatalogItem,
} from '../bueroApi'
import { formatEuro } from '../format'

interface Form {
  id?: string
  bezeichnung: string
  einzelpreis: string
  einheit: string
}

const LEER: Form = { bezeichnung: '', einzelpreis: '', einheit: 'Stück' }

export default function Katalog() {
  const [eintraege, setEintraege] = useState<KatalogItem[]>([])
  const [formular, setFormular] = useState<Form | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function neuLaden() {
    try {
      setEintraege(await ladeKatalog())
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    neuLaden()
  }, [])

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (!formular) return
    const preis = Number(formular.einzelpreis.replace(',', '.'))
    if (!formular.bezeichnung.trim() || !isFinite(preis)) {
      setFehler('Bezeichnung und gültiger Preis erforderlich')
      return
    }
    setFehler(null)
    try {
      const daten = {
        bezeichnung: formular.bezeichnung.trim(),
        einzelpreis: preis,
        einheit: formular.einheit.trim() || 'Stück',
      }
      if (formular.id) await aktualisiereKatalog(formular.id, daten)
      else await erstelleKatalog(daten)
      setFormular(null)
      neuLaden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  async function loeschen(id: string) {
    try {
      await loescheKatalog(id)
      neuLaden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Löschen fehlgeschlagen')
    }
  }

  return (
    <div>
      <div className="such-leiste">
        <button type="button" onClick={() => setFormular({ ...LEER })}>
          Neues Material
        </button>
      </div>

      {fehler && <p className="fehler">{fehler}</p>}

      {formular && (
        <form onSubmit={speichern} className="karte-innen formular">
          <h3>{formular.id ? 'Material bearbeiten' : 'Neues Material'}</h3>
          <label>
            Bezeichnung
            <input
              value={formular.bezeichnung}
              onChange={(e) => setFormular({ ...formular, bezeichnung: e.target.value })}
            />
          </label>
          <div className="frei-zeile">
            <label style={{ flex: 1 }}>
              Einzelpreis (€)
              <input
                type="number"
                step="0.01"
                value={formular.einzelpreis}
                onChange={(e) => setFormular({ ...formular, einzelpreis: e.target.value })}
              />
            </label>
            <label style={{ flex: 1 }}>
              Einheit
              <input
                value={formular.einheit}
                onChange={(e) => setFormular({ ...formular, einheit: e.target.value })}
              />
            </label>
          </div>
          <div className="frei-zeile">
            <button type="submit">Speichern</button>
            <button type="button" className="abmelden" onClick={() => setFormular(null)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}

      <table className="tabelle">
        <thead>
          <tr>
            <th>Bezeichnung</th>
            <th className="rechts">Einzelpreis</th>
            <th>Einheit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {eintraege.map((m) => (
            <tr key={m.id}>
              <td>{m.bezeichnung}</td>
              <td className="rechts">{formatEuro(Number(m.einzelpreis))}</td>
              <td>{m.einheit}</td>
              <td className="rechts">
                <button
                  type="button"
                  className="neben-button klein"
                  onClick={() =>
                    setFormular({
                      id: m.id,
                      bezeichnung: m.bezeichnung,
                      einzelpreis: m.einzelpreis,
                      einheit: m.einheit,
                    })
                  }
                >
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="mat-loeschen"
                  onClick={() => loeschen(m.id)}
                  aria-label="Löschen"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
