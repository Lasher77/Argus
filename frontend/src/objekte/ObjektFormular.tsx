import { useState, type FormEvent } from 'react'
import {
  aktualisiereObjekt,
  erstelleObjekt,
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

// Objekt anlegen/bearbeiten: Adresse, Hausverwaltung, Ansprechpartner,
// Ansprechpartner vor Ort und Rechnungsadresse.
export default function ObjektFormular({
  objekt,
  onFertig,
  onAbbrechen,
}: {
  objekt?: Objekt
  onFertig: (id: string) => void
  onAbbrechen: () => void
}) {
  const stamm = useStamm()
  const [name, setName] = useState(objekt?.name ?? '')
  const [strasse, setStrasse] = useState(objekt?.strasse ?? '')
  const [hausnummer, setHausnummer] = useState(objekt?.hausnummer ?? '')
  const [plz, setPlz] = useState(objekt?.plz ?? '')
  const [ort, setOrt] = useState(objekt?.ort ?? '')
  const [hvId, setHvId] = useState(objekt?.hausverwaltungId ?? '')
  const [apId, setApId] = useState(objekt?.ansprechpartnerId ?? '')
  const [vorOrtName, setVorOrtName] = useState(objekt?.vorOrtName ?? '')
  const [vorOrtTelefon, setVorOrtTelefon] = useState(objekt?.vorOrtTelefon ?? '')
  const [vorOrtEmail, setVorOrtEmail] = useState(objekt?.vorOrtEmail ?? '')
  const [quelle, setQuelle] = useState<RechnungQuelle>(objekt?.rechnungQuelle ?? 'hausverwaltung')
  const [adresse, setAdresse] = useState<AdressWerte>(adresseAus(objekt))
  const [notiz, setNotiz] = useState(objekt?.notiz ?? '')
  const [fehler, setFehler] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const gewaehlteHv = stamm.hvs.find((h) => h.id === hvId)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    // Nicht an ein äußeres Formular weiterreichen (z. B. Auftrag anlegen).
    e.stopPropagation()
    setFehler(null)
    setBusy(true)
    try {
      const daten = {
        name, strasse, hausnummer, plz, ort,
        hausverwaltungId: hvId || null,
        ansprechpartnerId: apId || null,
        vorOrtName, vorOrtTelefon, vorOrtEmail,
        rechnungQuelle: quelle,
        ...adresse,
        notiz,
      }
      if (objekt) {
        await aktualisiereObjekt(objekt.id, daten)
        onFertig(objekt.id)
      } else {
        const neu = await erstelleObjekt(daten)
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
      <Feld label="Bezeichnung des Objekts" platzhalter="z. B. Wohnhaus Pohlstraße 11" wert={name} onChange={setName} pflicht />

      <h3 className="form-abschnitt">Adresse</h3>
      <div className="zeile2 zeile-strasse">
        <Feld label="Straße" wert={strasse} onChange={setStrasse} />
        <Feld label="Hausnummer" wert={hausnummer} onChange={setHausnummer} />
      </div>
      <div className="zeile2 zeile-strasse">
        <Feld label="PLZ" wert={plz} onChange={setPlz} />
        <Feld label="Stadt" wert={ort} onChange={setOrt} />
      </div>

      <h3 className="form-abschnitt">Verwaltung &amp; Ansprechpartner</h3>
      <HvApAuswahl
        stamm={stamm}
        hvId={hvId}
        apId={apId}
        onChange={(h, a) => {
          setHvId(h)
          setApId(a)
        }}
        hvLeer="— keine Hausverwaltung —"
        apLeer="— kein Ansprechpartner —"
      />

      <h3 className="form-abschnitt">Ansprechpartner vor Ort</h3>
      <Feld label="Name" wert={vorOrtName} onChange={setVorOrtName} />
      <div className="zeile2">
        <Feld label="Telefon" typ="tel" wert={vorOrtTelefon} onChange={setVorOrtTelefon} />
        <Feld label="E-Mail" typ="email" wert={vorOrtEmail} onChange={setVorOrtEmail} />
      </div>

      <h3 className="form-abschnitt">Rechnungsadresse</h3>
      <label>
        Rechnungen gehen an
        <select value={quelle} onChange={(e) => setQuelle(e.target.value as RechnungQuelle)}>
          <option value="hausverwaltung">Die Hausverwaltung</option>
          <option value="eigen">Eine eigene Adresse</option>
        </select>
      </label>
      {quelle === 'eigen' ? (
        <RechnungsadresseFelder wert={adresse} onChange={setAdresse} />
      ) : (
        <p className="hinweis-text">
          {gewaehlteHv
            ? adresseKurz(gewaehlteHv) || 'Für diese Hausverwaltung ist noch keine Rechnungsadresse hinterlegt.'
            : 'Keine Hausverwaltung gewählt – bitte eine wählen oder „Eine eigene Adresse" nutzen.'}
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
