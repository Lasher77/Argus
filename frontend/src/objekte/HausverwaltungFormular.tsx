import { useState, type FormEvent } from 'react'
import {
  aktualisiereHausverwaltung,
  erstelleHausverwaltung,
  type Hausverwaltung,
} from '../objekteApi'
import Feld from './Feld'
import RechnungsadresseFelder, { adresseAus, type AdressWerte } from './RechnungsadresseFelder'

export default function HausverwaltungFormular({
  hv,
  onFertig,
  onAbbrechen,
}: {
  hv?: Hausverwaltung
  onFertig: (id: string) => void
  onAbbrechen: () => void
}) {
  const [name, setName] = useState(hv?.name ?? '')
  const [notiz, setNotiz] = useState(hv?.notiz ?? '')
  const [adresse, setAdresse] = useState<AdressWerte>(adresseAus(hv))
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    // Nicht an ein äußeres Formular weiterreichen (z. B. Auftrag anlegen).
    e.stopPropagation()
    setFehler(null)
    setBusy(true)
    try {
      const daten = { name, notiz, ...adresse }
      if (hv) {
        await aktualisiereHausverwaltung(hv.id, daten)
        onFertig(hv.id)
      } else {
        const neu = await erstelleHausverwaltung(daten)
        onFertig(neu.id)
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={speichern} className="formular">
      <Feld label="Name der Hausverwaltung" wert={name} onChange={setName} pflicht />
      <h3 className="form-abschnitt">Rechnungsadresse</h3>
      <RechnungsadresseFelder wert={adresse} onChange={setAdresse} />
      <Feld label="Notiz" wert={notiz} onChange={setNotiz} />
      {fehler && <p className="fehler">{fehler}</p>}
      <div className="modal-aktionen">
        <button type="button" className="abmelden" onClick={onAbbrechen}>
          Abbrechen
        </button>
        <button type="submit" disabled={busy}>
          {busy ? 'Speichern …' : 'Speichern'}
        </button>
      </div>
    </form>
  )
}
