import { useState } from 'react'
import { passendeAnsprechpartner, type useStamm } from './useStamm'
import Modal from './Modal'
import HausverwaltungFormular from './HausverwaltungFormular'
import AnsprechpartnerFormular from './AnsprechpartnerFormular'

// Dropdowns für Hausverwaltung und Ansprechpartner – jeweils mit der Möglichkeit,
// direkt eine neue anzugeben. Der Ansprechpartner-Dropdown zeigt nur freie
// Ansprechpartner und die der (effektiven) Hausverwaltung.
export default function HvApAuswahl({
  stamm,
  hvId,
  apId,
  onChange,
  hvLeer,
  apLeer,
  fallbackHvId = null,
}: {
  stamm: ReturnType<typeof useStamm>
  hvId: string
  apId: string
  onChange: (hvId: string, apId: string) => void
  hvLeer: string
  apLeer: string
  // Bei Einheiten: Hausverwaltung des Objekts (gilt, wenn die Einheit keine eigene hat).
  fallbackHvId?: string | null
}) {
  const [neuHv, setNeuHv] = useState(false)
  const [neuAp, setNeuAp] = useState(false)
  const effektiv = hvId || fallbackHvId || null

  function hvGeaendert(neu: string) {
    // Passt der gewählte Ansprechpartner nicht mehr zur neuen Hausverwaltung, zurücksetzen.
    const neuEff = neu || fallbackHvId || null
    const gewaehlt = stamm.aps.find((a) => a.id === apId)
    const passt = !gewaehlt || gewaehlt.hausverwaltungId === null || gewaehlt.hausverwaltungId === neuEff
    onChange(neu, passt ? apId : '')
  }

  return (
    <>
      <label>
        Hausverwaltung
        <div className="kunde-wahl">
          <select value={hvId} onChange={(e) => hvGeaendert(e.target.value)}>
            <option value="">{hvLeer}</option>
            {stamm.hvs
              .filter((h) => !h.archiviert || h.id === hvId)
              .map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
          </select>
          <button type="button" className="abmelden" onClick={() => setNeuHv(true)}>
            + Neue
          </button>
        </div>
      </label>
      <label>
        Ansprechpartner
        <div className="kunde-wahl">
          <select value={apId} onChange={(e) => onChange(hvId, e.target.value)}>
            <option value="">{apLeer}</option>
            {passendeAnsprechpartner(stamm.aps, effektiv, apId || null).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.rolle ? ` (${a.rolle})` : ''}
                {a.hausverwaltungId === null ? ' – frei' : ''}
              </option>
            ))}
          </select>
          <button type="button" className="abmelden" onClick={() => setNeuAp(true)}>
            + Neuer
          </button>
        </div>
      </label>

      {neuHv && (
        <Modal titel="Neue Hausverwaltung" onSchliessen={() => setNeuHv(false)}>
          <HausverwaltungFormular
            onAbbrechen={() => setNeuHv(false)}
            onFertig={async (id) => {
              await stamm.neuLaden()
              setNeuHv(false)
              onChange(id, '')
            }}
          />
        </Modal>
      )}
      {neuAp && (
        <Modal titel="Neuer Ansprechpartner" onSchliessen={() => setNeuAp(false)}>
          <AnsprechpartnerFormular
            hvs={stamm.hvs}
            vorgabeHvId={effektiv}
            onAbbrechen={() => setNeuAp(false)}
            onFertig={async (id) => {
              await stamm.neuLaden()
              setNeuAp(false)
              onChange(hvId, id)
            }}
          />
        </Modal>
      )}
    </>
  )
}
