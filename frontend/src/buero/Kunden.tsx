import { useEffect, useState, type FormEvent } from 'react'
import {
  ladeKunden,
  erstelleKunde,
  aktualisiereKunde,
  type Kunde,
} from '../bueroApi'

const LEER: Partial<Kunde> = {
  name: '',
  adresse: '',
  telefon: '',
  email: '',
  notiz: '',
}

export default function Kunden() {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [suche, setSuche] = useState('')
  const [formular, setFormular] = useState<Partial<Kunde> | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function neuLaden(q = suche) {
    try {
      setKunden(await ladeKunden(q))
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    neuLaden('')
  }, [])

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (!formular?.name?.trim()) {
      setFehler('Name ist erforderlich')
      return
    }
    setFehler(null)
    try {
      if (formular.id) await aktualisiereKunde(formular.id, formular)
      else await erstelleKunde(formular)
      setFormular(null)
      neuLaden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    }
  }

  return (
    <div>
      <div className="such-leiste">
        <input
          placeholder="Kunde suchen …"
          value={suche}
          onChange={(e) => {
            setSuche(e.target.value)
            neuLaden(e.target.value)
          }}
        />
        <button type="button" onClick={() => setFormular({ ...LEER })}>
          Neuer Kunde
        </button>
      </div>

      {fehler && <p className="fehler">{fehler}</p>}

      {formular && (
        <form onSubmit={speichern} className="karte-innen formular">
          <h3>{formular.id ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h3>
          {(['name', 'adresse', 'telefon', 'email', 'notiz'] as const).map((feld) => (
            <label key={feld}>
              {feld.charAt(0).toUpperCase() + feld.slice(1)}
              <input
                value={(formular[feld] as string) ?? ''}
                onChange={(e) =>
                  setFormular({ ...formular, [feld]: e.target.value })
                }
              />
            </label>
          ))}
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
            <th>Name</th>
            <th>Adresse</th>
            <th>Telefon</th>
            <th>E-Mail</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {kunden.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td>
              <td>{k.adresse ?? '—'}</td>
              <td>{k.telefon ?? '—'}</td>
              <td>{k.email ?? '—'}</td>
              <td className="rechts">
                <button
                  type="button"
                  className="neben-button klein"
                  onClick={() => setFormular(k)}
                >
                  Bearbeiten
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
