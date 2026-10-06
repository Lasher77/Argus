import { useState, type FormEvent } from 'react'
import {
  aktualisiereEinheit,
  erstelleEinheit,
  type Einheit,
  type Objekt,
  type RechnungQuelle,
} from '../objekteApi'
import { useStamm } from './useStamm'
import Feld from './Feld'
import HvApAuswahl from './HvApAuswahl'
import RechnungsadresseFelder, {
  adresseAus,
  adresseKurz,
  type AdressWerte,
} from './RechnungsadresseFelder'

// Einheit (z. B. "Wohnung 1, 1. OG rechts"): kann eine andere Hausverwaltung,
// andere Ansprechpartner (u. a. Mieter vor Ort) und eine eigene Rechnungsadresse
// haben als das Objekt – muss aber nicht ("wie Objekt").
export default function EinheitFormular({
  objekt,
  einheit,
  onFertig,
  onAbbrechen,
}: {
  objekt: Objekt
  einheit?: Einheit
  onFertig: (id: string) => void
  onAbbrechen: () => void
}) {
  const stamm = useStamm()
  const [bezeichnung, setBezeichnung] = useState(einheit?.bezeichnung ?? '')
  const [hvId, setHvId] = useState(einheit?.hausverwaltungId ?? '')
  const [apId, setApId] = useState(einheit?.ansprechpartnerId ?? '')
  const [vorOrtName, setVorOrtName] = useState(einheit?.vorOrtName ?? '')
  const [vorOrtTelefon, setVorOrtTelefon] = useState(einheit?.vorOrtTelefon ?? '')
  const [vorOrtEmail, setVorOrtEmail] = useState(einheit?.vorOrtEmail ?? '')
  const [quelle, setQuelle] = useState<RechnungQuelle>(einheit?.rechnungQuelle ?? 'objekt')
  const [adresse, setAdresse] = useState<AdressWerte>(adresseAus(einheit))
  const [notiz, setNotiz] = useState(einheit?.notiz ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const effHv = stamm.hvs.find((h) => h.id === (hvId || objekt.hausverwaltungId))

  async function speichern(e: FormEvent) {
    e.preventDefault()
    // Nicht an ein äußeres Formular weiterreichen (z. B. Auftrag anlegen).
    e.stopPropagation()
    setFehler(null)
    setBusy(true)
    try {
      const daten = {
        bezeichnung,
        hausverwaltungId: hvId || null,
        ansprechpartnerId: apId || null,
        vorOrtName, vorOrtTelefon, vorOrtEmail,
        rechnungQuelle: quelle,
        ...adresse,
        notiz,
      }
      if (einheit) {
        await aktualisiereEinheit(einheit.id, daten)
        onFertig(einheit.id)
      } else {
        const neu = await erstelleEinheit(objekt.id, daten)
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
      <p className="hinweis-text">Objekt: <strong>{objekt.name}</strong></p>
      <Feld label="Bezeichnung der Einheit" platzhalter="z. B. Wohnung 1, 1. OG rechts" wert={bezeichnung} onChange={setBezeichnung} pflicht />

      <h3 className="form-abschnitt">Verwaltung &amp; Ansprechpartner</h3>
      <HvApAuswahl
        stamm={stamm}
        hvId={hvId}
        apId={apId}
        onChange={(h, a) => {
          setHvId(h)
          setApId(a)
        }}
        hvLeer="— wie Objekt —"
        apLeer="— wie Objekt —"
        fallbackHvId={objekt.hausverwaltungId}
      />

      <h3 className="form-abschnitt">Ansprechpartner vor Ort (z. B. Mieter)</h3>
      <Feld label="Name" wert={vorOrtName} onChange={setVorOrtName} />
      <div className="zeile2">
        <Feld label="Telefon" typ="tel" wert={vorOrtTelefon} onChange={setVorOrtTelefon} />
        <Feld label="E-Mail" typ="email" wert={vorOrtEmail} onChange={setVorOrtEmail} />
      </div>

      <h3 className="form-abschnitt">Rechnungsadresse</h3>
      <label>
        Rechnungen gehen an
        <select value={quelle} onChange={(e) => setQuelle(e.target.value as RechnungQuelle)}>
          <option value="objekt">Wie das Objekt</option>
          <option value="hausverwaltung">Die Hausverwaltung</option>
          <option value="eigen">Eine eigene Adresse</option>
        </select>
      </label>
      {quelle === 'eigen' && <RechnungsadresseFelder wert={adresse} onChange={setAdresse} />}
      {quelle === 'hausverwaltung' && (
        <p className="hinweis-text">
          {effHv ? adresseKurz(effHv) || 'Keine Rechnungsadresse bei der Hausverwaltung hinterlegt.' : 'Keine Hausverwaltung gewählt.'}
        </p>
      )}

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
