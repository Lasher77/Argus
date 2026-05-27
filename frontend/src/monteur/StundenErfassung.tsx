import { useEffect, useRef, useState } from 'react'
import { addStunden, type MonteurAuftrag } from '../monteurApi'
import { formatStunden } from '../format'

function formatUhr(sekunden: number): string {
  const h = Math.floor(sekunden / 3600)
  const m = Math.floor((sekunden % 3600) / 60)
  const s = sekunden % 60
  const zwei = (n: number) => n.toString().padStart(2, '0')
  return `${zwei(h)}:${zwei(m)}:${zwei(s)}`
}

export default function StundenErfassung({
  auftrag,
  onAenderung,
  onFehler,
}: {
  auftrag: MonteurAuftrag
  onAenderung: () => void
  onFehler: (f: string | null) => void
}) {
  const [laeuft, setLaeuft] = useState(false)
  const [sekunden, setSekunden] = useState(0)
  const [manuell, setManuell] = useState('')
  const [busy, setBusy] = useState(false)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (!laeuft) return
    const t = setInterval(() => {
      setSekunden(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [laeuft])

  function starten() {
    startRef.current = Date.now()
    setSekunden(0)
    setLaeuft(true)
  }

  async function stoppen() {
    setLaeuft(false)
    const stunden = sekunden / 3600
    setSekunden(0)
    if (stunden <= 0) return
    await speichern(Math.round(stunden * 100) / 100)
  }

  async function manuellHinzufuegen() {
    const wert = Number(manuell.replace(',', '.'))
    if (!isFinite(wert) || wert <= 0) {
      onFehler('Bitte eine gültige Stundenzahl eingeben')
      return
    }
    await speichern(wert)
    setManuell('')
  }

  async function speichern(zusatz: number) {
    onFehler(null)
    setBusy(true)
    try {
      await addStunden(auftrag.id, zusatz)
      onAenderung()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="m-block">
      <div className="m-block-kopf">
        <span>Stunden</span>
        <strong>{formatStunden(auftrag.stunden)} h</strong>
      </div>

      <div className="timer">
        <span className="timer-uhr">{formatUhr(sekunden)}</span>
        {!laeuft ? (
          <button type="button" className="gross-button start" onClick={starten}>
            ▶ Timer starten
          </button>
        ) : (
          <button
            type="button"
            className="gross-button stopp"
            disabled={busy}
            onClick={stoppen}
          >
            ⏹ Stoppen &amp; übernehmen
          </button>
        )}
      </div>

      <div className="manuell">
        <input
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0"
          placeholder="z. B. 1,5"
          value={manuell}
          onChange={(e) => setManuell(e.target.value)}
        />
        <button
          type="button"
          className="neben-button"
          disabled={busy}
          onClick={manuellHinzufuegen}
        >
          + Stunden
        </button>
      </div>
    </div>
  )
}
