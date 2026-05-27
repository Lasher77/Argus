import { useEffect, useState } from 'react'
import {
  ladeStammdaten,
  neuerStammwert,
  uploadLogo,
  type StammFeld,
} from '../bueroApi'
import { formatDatum } from '../format'

const LABELS: Record<string, string> = {
  firmenname: 'Firmenname',
  firmenadresse: 'Firmenadresse',
  telefon: 'Telefon',
  mobil: 'Mobil',
  telefax: 'Telefax',
  email: 'E-Mail',
  steuernummer: 'Steuernummer',
  ust_idnr: 'USt-IdNr.',
  standard_stundensatz: 'Standard-Stundensatz (€)',
  mwst_satz: 'MwSt.-Satz (%)',
  bank_kontoinhaber: 'Kontoinhaber',
  bank_iban: 'IBAN',
  bank_bic: 'BIC',
  bank_name: 'Bank',
  zahlungshinweis: 'Zahlungshinweis',
  logo_pfad: 'Logo',
}

function heuteIso() {
  return new Date().toISOString().slice(0, 10)
}

export default function Einstellungen() {
  const [felder, setFelder] = useState<StammFeld[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [offen, setOffen] = useState<string | null>(null)

  async function neuLaden() {
    try {
      setFelder(await ladeStammdaten())
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    neuLaden()
  }, [])

  return (
    <div>
      <p className="hinweis-text">
        Werte sind datiert: Ein neuer Wert erhält ein Startdatum, der bisherige
        Wert wird automatisch zum Vortag beendet. Bereits erstellte Rechnungen
        bleiben unverändert.
      </p>
      {fehler && <p className="fehler">{fehler}</p>}

      <div className="stamm-liste">
        {felder.map((f) => {
          const aktuell = f.eintraege.find((e) => e.aktuell)
          return (
            <div key={f.feldName} className="stamm-feld">
              <div className="stamm-kopf">
                <div>
                  <span className="stamm-label">{LABELS[f.feldName] ?? f.feldName}</span>
                  <span className="stamm-wert">
                    {f.feldName === 'logo_pfad'
                      ? aktuell?.wert
                        ? '✓ hinterlegt'
                        : '— kein Logo —'
                      : aktuell?.wert || '—'}
                  </span>
                </div>
                <button
                  type="button"
                  className="neben-button klein"
                  onClick={() => setOffen(offen === f.feldName ? null : f.feldName)}
                >
                  {offen === f.feldName ? 'Schließen' : 'Ändern'}
                </button>
              </div>

              {offen === f.feldName && (
                <div className="stamm-detail">
                  {f.feldName === 'logo_pfad' ? (
                    <LogoUpload onFertig={() => { setOffen(null); neuLaden() }} onFehler={setFehler} />
                  ) : (
                    <NeuerWert
                      feldName={f.feldName}
                      onFertig={() => { setOffen(null); neuLaden() }}
                      onFehler={setFehler}
                    />
                  )}

                  <div className="historie">
                    <span className="historie-titel">Verlauf</span>
                    {f.eintraege.map((e) => (
                      <div key={e.id} className={`historie-zeile ${e.aktuell ? 'aktuell' : ''}`}>
                        <span className="historie-wert">
                          {f.feldName === 'logo_pfad' ? '(Logo-Datei)' : e.wert || '—'}
                        </span>
                        <span className="historie-zeit">
                          ab {formatDatum(e.gueltigVon)}
                          {e.gueltigBis ? ` bis ${formatDatum(e.gueltigBis)}` : ' (aktuell)'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NeuerWert({
  feldName,
  onFertig,
  onFehler,
}: {
  feldName: string
  onFertig: () => void
  onFehler: (f: string | null) => void
}) {
  const [wert, setWert] = useState('')
  const [von, setVon] = useState(heuteIso())
  const [busy, setBusy] = useState(false)

  async function speichern() {
    setBusy(true)
    onFehler(null)
    try {
      await neuerStammwert(feldName, wert, von)
      onFertig()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="neuer-wert">
      <label>
        Neuer Wert
        <input value={wert} onChange={(e) => setWert(e.target.value)} />
      </label>
      <label>
        Gültig ab
        <input type="date" value={von} onChange={(e) => setVon(e.target.value)} />
      </label>
      <button type="button" disabled={busy} onClick={speichern}>
        Speichern
      </button>
    </div>
  )
}

function LogoUpload({
  onFertig,
  onFehler,
}: {
  onFertig: () => void
  onFehler: (f: string | null) => void
}) {
  const [busy, setBusy] = useState(false)

  async function gewaehlt(e: React.ChangeEvent<HTMLInputElement>) {
    const datei = e.target.files?.[0]
    if (!datei) return
    setBusy(true)
    onFehler(null)
    try {
      await uploadLogo(datei)
      onFertig()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="neuer-wert">
      <label>
        Neues Logo (PNG/JPG/SVG)
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={gewaehlt} />
      </label>
      {busy && <span>lädt …</span>}
    </div>
  )
}
