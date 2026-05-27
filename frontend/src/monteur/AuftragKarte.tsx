import { useState } from 'react'
import {
  starteArbeit,
  auftragErledigt,
  type MonteurAuftrag,
  type KatalogItem,
} from '../monteurApi'
import { formatDatum, formatEuro } from '../format'
import StundenErfassung from './StundenErfassung'
import MaterialErfassung from './MaterialErfassung'
import FotoUpload from './FotoUpload'

function kartenLink(adresse: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`
}

export default function AuftragKarte({
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

  const materialSumme = auftrag.material.reduce(
    (s, m) => s + m.einzelpreis * m.menge,
    0,
  )
  const summe =
    auftrag.stunden * (auftrag.stundensatz ?? 0) + materialSumme

  return (
    <section className="m-auftrag">
      <h2 className="m-titel">{auftrag.titel}</h2>
      <p className="m-kunde">{auftrag.kundeName}</p>
      {auftrag.kundeAdresse && (
        <a
          className="m-adresse"
          href={kartenLink(auftrag.kundeAdresse)}
          target="_blank"
          rel="noreferrer"
        >
          📍 {auftrag.kundeAdresse}
        </a>
      )}
      <p className="m-termin">Termin: {formatDatum(auftrag.termin)}</p>
      {auftrag.beschreibung && (
        <p className="m-beschreibung">{auftrag.beschreibung}</p>
      )}

      {auftrag.status === 'geplant' ? (
        <button
          type="button"
          className="gross-button start"
          disabled={busy}
          onClick={() => aktion(() => starteArbeit(auftrag.id))}
        >
          ▶ Arbeit starten
        </button>
      ) : (
        <>
          <StundenErfassung
            auftrag={auftrag}
            onAenderung={onAenderung}
            onFehler={onFehler}
          />

          <MaterialErfassung
            auftrag={auftrag}
            katalog={katalog}
            onAenderung={onAenderung}
            onFehler={onFehler}
          />

          <FotoUpload
            auftrag={auftrag}
            onAenderung={onAenderung}
            onFehler={onFehler}
          />

          <p className="m-summe">
            Zwischensumme: <strong>{formatEuro(summe)}</strong>
          </p>

          <button
            type="button"
            className="gross-button erledigt"
            disabled={busy}
            onClick={() => aktion(() => auftragErledigt(auftrag.id))}
          >
            ✓ Auftrag erledigt
          </button>
        </>
      )}
    </section>
  )
}
