import { useEffect } from 'react'
import type { EmpfaengerEingabe } from '../bueroApi'
import type { Herkunft, Kandidat } from '../objekteApi'
import Feld from '../objekte/Feld'

export const leererEmpfaenger = (): EmpfaengerEingabe => ({
  empfaenger: '',
  strasse: '',
  ort: '',
  email: '',
  kundennr: '',
  herkunft: 'frei',
})

// Rechnungsempfänger wählen: Dropdown mit den Rechnungsadressen von Einheit,
// Objekt und Hausverwaltung (vorbelegt mit dem passendsten Treffer) oder
// "Freie Eingabe". Die Felder bleiben immer editierbar.
export default function EmpfaengerWahl({
  kandidaten,
  standardKey,
  wert,
  onChange,
}: {
  kandidaten: Kandidat[]
  standardKey: Herkunft | null
  wert: EmpfaengerEingabe
  onChange: (w: EmpfaengerEingabe) => void
}) {
  // Vorbelegung, sobald die wählbaren Adressen (neu) geladen sind.
  useEffect(() => {
    const k = kandidaten.find((x) => x.key === standardKey)
    if (k) onChange({ ...k.block, herkunft: k.key })
    // onChange bewusst nicht in den Abhängigkeiten: nur bei neuen Kandidaten vorbelegen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kandidaten, standardKey])

  function auswahl(key: string) {
    if (key === 'frei') {
      onChange({ ...wert, herkunft: 'frei' })
      return
    }
    const k = kandidaten.find((x) => x.key === key)
    if (k) onChange({ ...k.block, herkunft: k.key })
  }

  const set = (feld: 'empfaenger' | 'strasse' | 'ort' | 'email' | 'kundennr') => (v: string) =>
    onChange({ ...wert, [feld]: v, herkunft: 'frei' })

  return (
    <div className="empfaenger-wahl">
      <label className="modal-feld">
        Rechnungsadresse
        <select value={wert.herkunft} onChange={(e) => auswahl(e.target.value)}>
          {kandidaten.map((k) => (
            <option key={k.key} value={k.key}>
              {k.label}
            </option>
          ))}
          <option value="frei">Freie Eingabe</option>
        </select>
      </label>
      <div className="adress-block">
        <Feld label="Empfänger" wert={wert.empfaenger} onChange={set('empfaenger')} />
        <Feld label="Straße + Hausnummer" wert={wert.strasse} onChange={set('strasse')} />
        <Feld label="PLZ + Stadt" wert={wert.ort} onChange={set('ort')} />
        <div className="zeile2">
          <Feld label="E-Mail (für Rechnungsversand)" typ="email" wert={wert.email} onChange={set('email')} />
          <Feld label="Kundennummer (auf der Rechnung)" wert={wert.kundennr} onChange={set('kundennr')} />
        </div>
      </div>
    </div>
  )
}
