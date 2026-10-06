import { useState, type FormEvent } from 'react'
import {
  aktualisiereAnsprechpartner,
  erstelleAnsprechpartner,
  type Ansprechpartner,
  type Hausverwaltung,
} from '../objekteApi'
import Feld from './Feld'

// Ansprechpartner gehören zu einer Hausverwaltung ODER stehen frei
// (z. B. ein freier Hausmeister).
export default function AnsprechpartnerFormular({
  ap,
  hvs,
  vorgabeHvId = null,
  onFertig,
  onAbbrechen,
}: {
  ap?: Ansprechpartner
  hvs: Hausverwaltung[]
  vorgabeHvId?: string | null
  onFertig: (id: string) => void
  onAbbrechen: () => void
}) {
  const [name, setName] = useState(ap?.name ?? '')
  const [rolle, setRolle] = useState(ap?.rolle ?? '')
  const [telefon, setTelefon] = useState(ap?.telefon ?? '')
  const [email, setEmail] = useState(ap?.email ?? '')
  const [notiz, setNotiz] = useState(ap?.notiz ?? '')
  const [hvId, setHvId] = useState(ap ? ap.hausverwaltungId ?? '' : vorgabeHvId ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    // Nicht an ein äußeres Formular weiterreichen (z. B. Auftrag anlegen).
    e.stopPropagation()
    setFehler(null)
    setBusy(true)
    try {
      const daten = { name, rolle, telefon, email, notiz, hausverwaltungId: hvId || null }
      if (ap) {
        await aktualisiereAnsprechpartner(ap.id, daten)
        onFertig(ap.id)
      } else {
        const neu = await erstelleAnsprechpartner(daten)
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
      <Feld label="Name" wert={name} onChange={setName} pflicht />
      <label>
        Hausverwaltung
        <select value={hvId} onChange={(e) => setHvId(e.target.value)}>
          <option value="">— frei (ohne Hausverwaltung) —</option>
          {hvs
            .filter((h) => !h.archiviert || h.id === hvId)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
        </select>
      </label>
      <div className="zeile2">
        <Feld label="Rolle (z. B. Objektbetreuung)" wert={rolle} onChange={setRolle} />
        <Feld label="Telefon" typ="tel" wert={telefon} onChange={setTelefon} />
      </div>
      <Feld label="E-Mail" typ="email" wert={email} onChange={setEmail} />
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
