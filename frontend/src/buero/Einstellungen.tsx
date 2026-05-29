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
  mail_betreff_vorlage: 'E-Mail-Betreff (Vorlage)',
  mail_text_vorlage: 'E-Mail-Text (Vorlage)',
  mail_hinweis_text: 'Hinweis nach „Per E-Mail"',
  mail_hinweis_aktiv: 'Hinweis anzeigen (true/false)',
}

const MEHRZEILER = new Set(['mail_text_vorlage', 'zahlungshinweis'])

// Beispielrechnung für die Live-Vorschau der Mail-Vorlagen.
const BEISPIEL = {
  rechnungsnummer: '2026-0042',
  kundenname: 'Müller GmbH',
  betrag: '1.234,56 €',
  firmenname: 'Argus - Metallbau - S. Schellenberg',
}

function ersetzePlatzhalter(text: string): string {
  return text.replace(/\{(\w+)\}/g, (_m, key) =>
    key in BEISPIEL ? (BEISPIEL as Record<string, string>)[key] : `{${key}}`,
  )
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

                  {(f.feldName === 'mail_betreff_vorlage' ||
                    f.feldName === 'mail_text_vorlage') &&
                    aktuell?.wert && (
                      <div className="vorlagen-vorschau">
                        <span className="historie-titel">
                          Vorschau (Beispielrechnung)
                        </span>
                        <pre>{ersetzePlatzhalter(aktuell.wert)}</pre>
                      </div>
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

  const mehrzeilig = MEHRZEILER.has(feldName)
  return (
    <div className="neuer-wert">
      <label style={mehrzeilig ? { flexBasis: '100%' } : undefined}>
        Neuer Wert
        {mehrzeilig ? (
          <textarea rows={5} value={wert} onChange={(e) => setWert(e.target.value)} />
        ) : (
          <input value={wert} onChange={(e) => setWert(e.target.value)} />
        )}
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
