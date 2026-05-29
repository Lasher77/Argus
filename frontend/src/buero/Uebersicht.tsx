import { useEffect, useState } from 'react'
import {
  ladeKennzahlen,
  ladeErledigt,
  ladeRechnungen,
  markiereBezahlt,
  ladeMailDaten,
  pdfUrl,
  type Kennzahlen,
  type ErledigtRow,
  type RechnungRow,
} from '../bueroApi'
import { formatEuro, formatDatum } from '../format'
import VorschauModal from './VorschauModal'
import FreieRechnungModal from './FreieRechnungModal'

type StatusFilter = 'alle' | 'offen' | 'bezahlt'

export default function Uebersicht() {
  const [kennzahlen, setKennzahlen] = useState<Kennzahlen | null>(null)
  const [erledigt, setErledigt] = useState<ErledigtRow[]>([])
  const [rechnungen, setRechnungen] = useState<RechnungRow[]>([])
  const [filter, setFilter] = useState<StatusFilter>('alle')
  const [fehler, setFehler] = useState<string | null>(null)
  const [vorschauId, setVorschauId] = useState<string | null>(null)
  const [freieRechnung, setFreieRechnung] = useState(false)
  const [mailHinweis, setMailHinweis] = useState<string | null>(null)

  async function neuLaden() {
    try {
      const [k, e, r] = await Promise.all([
        ladeKennzahlen(),
        ladeErledigt(),
        ladeRechnungen(filter === 'alle' ? undefined : filter),
      ])
      setKennzahlen(k)
      setErledigt(e)
      setRechnungen(r)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    neuLaden()
  }, [filter])

  async function bezahlt(rechnungId: string) {
    setFehler(null)
    try {
      await markiereBezahlt(rechnungId)
      neuLaden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Aktion fehlgeschlagen')
    }
  }

  async function perMailVersenden(rechnungId: string) {
    setFehler(null)
    try {
      const mail = await ladeMailDaten(rechnungId)
      // Parallel: PDF herunterladen + Mail-Client öffnen.
      const pdfHref = `${mail.pdfUrl}?download=1`
      const a = document.createElement('a')
      a.href = pdfHref
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      const mailto = `mailto:${encodeURIComponent(mail.empfaenger)}?subject=${encodeURIComponent(mail.betreff)}&body=${encodeURIComponent(mail.text)}`
      window.location.href = mailto

      if (mail.hinweisAktiv && mail.hinweisText) {
        setMailHinweis(mail.hinweisText)
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Mail-Versand fehlgeschlagen')
    }
  }

  return (
    <div>
      <section className="kennzahlen">
        <div className="kennzahl">
          <span className="kennzahl-wert">{kennzahlen?.bereitAnzahl ?? 0}</span>
          <span className="kennzahl-label">Bereit zum Berechnen</span>
        </div>
        <div className="kennzahl">
          <span className="kennzahl-wert">
            {formatEuro(kennzahlen?.offeneRechnungenSumme ?? 0)}
          </span>
          <span className="kennzahl-label">Offene Rechnungsbeträge</span>
        </div>
      </section>

      {fehler && <p className="fehler">{fehler}</p>}
      {mailHinweis && (
        <div className="mail-hinweis">
          <span>{mailHinweis}</span>
          <button type="button" onClick={() => setMailHinweis(null)}>
            ✕
          </button>
        </div>
      )}

      <h2>Erledigt – bereit für Rechnung</h2>
      {erledigt.length === 0 ? (
        <p className="leer">Keine erledigten Aufträge.</p>
      ) : (
        <div className="liste">
          {erledigt.map((a) => (
            <div key={a.id} className="auftrag">
              <div className="auftrag-kopf">
                <span className="auftrag-titel">{a.titel}</span>
                <span className="auftrag-summe">{formatEuro(a.summe)}</span>
              </div>
              <div className="auftrag-meta">
                <span>Kunde: {a.kundeName ?? '—'}</span>
                <span>Erledigt: {formatDatum(a.erledigtAm)}</span>
              </div>
              <div className="auftrag-aktion">
                <button type="button" onClick={() => setVorschauId(a.id)}>
                  Rechnung erstellen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rechnungen-kopf">
        <h2>Rechnungen</h2>
        <div className="rechnungen-aktionen">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as StatusFilter)}
          >
            <option value="alle">Alle</option>
            <option value="offen">Nur offene</option>
            <option value="bezahlt">Nur bezahlte</option>
          </select>
          <button type="button" onClick={() => setFreieRechnung(true)}>
            Neue Rechnung erstellen
          </button>
        </div>
      </div>

      {rechnungen.length === 0 ? (
        <p className="leer">Noch keine Rechnungen.</p>
      ) : (
        <table className="tabelle">
          <thead>
            <tr>
              <th>Nummer</th>
              <th>Datum</th>
              <th>Kunde</th>
              <th className="rechts">Betrag</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rechnungen.map((r) => (
              <tr key={r.id}>
                <td>{r.nummer}</td>
                <td>{formatDatum(r.datum)}</td>
                <td>
                  {r.kundeName}
                  {!r.auftragId && <span className="frei-hinweis"> (frei)</span>}
                </td>
                <td className="rechts">{formatEuro(r.brutto)}</td>
                <td>
                  <span className={`badge badge-${r.status}`}>
                    {r.status === 'bezahlt' ? 'Bezahlt' : 'Offen'}
                  </span>
                </td>
                <td className="rechts">
                  <a
                    className="link-button"
                    href={pdfUrl(r.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF öffnen
                  </a>
                  <button
                    type="button"
                    className="neben-button klein"
                    onClick={() => perMailVersenden(r.id)}
                    title={r.kundeEmail || 'Empfängerfeld leer'}
                  >
                    Per E-Mail
                  </button>
                  {r.status === 'offen' && (
                    <button
                      type="button"
                      className="neben-button klein"
                      onClick={() => bezahlt(r.id)}
                    >
                      Als bezahlt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {vorschauId && (
        <VorschauModal
          auftragId={vorschauId}
          onAbbrechen={() => setVorschauId(null)}
          onErstellt={() => {
            setVorschauId(null)
            neuLaden()
          }}
          onFehler={setFehler}
        />
      )}

      {freieRechnung && (
        <FreieRechnungModal
          onAbbrechen={() => setFreieRechnung(false)}
          onErstellt={() => {
            setFreieRechnung(false)
            neuLaden()
          }}
          onFehler={setFehler}
        />
      )}
    </div>
  )
}
