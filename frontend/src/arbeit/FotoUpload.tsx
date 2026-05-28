import { useRef, useState } from 'react'
import { uploadFoto, type ArbeitsAuftrag } from '../arbeitApi'

export default function FotoUpload({
  auftrag,
  onAenderung,
  onFehler,
}: {
  auftrag: ArbeitsAuftrag
  onAenderung: () => void
  onFehler: (f: string | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function dateiGewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0]
    if (!datei) return
    onFehler(null)
    setBusy(true)
    try {
      await uploadFoto(auftrag.id, datei)
      onAenderung()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Foto-Upload fehlgeschlagen')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="m-block">
      <div className="m-block-kopf">
        <span>Fotos</span>
        <strong>{auftrag.fotoAnzahl}</strong>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={dateiGewaehlt}
      />
      <button
        type="button"
        className="neben-button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Lädt …' : '📷 Foto aufnehmen / wählen'}
      </button>
    </div>
  )
}
