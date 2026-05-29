import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ladeKunden,
  erstelleKunde,
  ladeKatalog,
  ladeStammdaten,
  erstelleFreieRechnung,
  type Kunde,
  type KatalogItem,
} from '../bueroApi'
import { formatEuro } from '../format'

interface EditPos {
  bezeichnung: string
  menge: number
  einheit: string
  einzelpreis: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Freie Rechnung ohne Auftrag: Kunde wählen oder neu anlegen, Positionen frei
// oder per Katalog-Antippen + Arbeitszeit, Vorschau, Erstellung.
export default function FreieRechnungModal({
  onAbbrechen,
  onErstellt,
  onFehler,
}: {
  onAbbrechen: () => void
  onErstellt: () => void
  onFehler: (f: string | null) => void
}) {
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [katalog, setKatalog] = useState<KatalogItem[]>([])
  const [mwstSatz, setMwstSatz] = useState(19)
  const [standardSatz, setStandardSatz] = useState(60)

  const [kundeId, setKundeId] = useState('')
  const [neuerKunde, setNeuerKunde] = useState(false)
  const [neuKundeName, setNeuKundeName] = useState('')
  const [neuKundeAdresse, setNeuKundeAdresse] = useState('')
  const [neuKundeEmail, setNeuKundeEmail] = useState('')

  const [objekt, setObjekt] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [positionen, setPositionen] = useState<EditPos[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([ladeKunden(), ladeKatalog(), ladeStammdaten()])
      .then(([k, m, s]) => {
        setKunden(k)
        setKatalog(m)
        const aktuell = (feld: string) =>
          s.find((f) => f.feldName === feld)?.eintraege.find((e) => e.aktuell)?.wert
        const mwst = Number(aktuell('mwst_satz'))
        const satz = Number(aktuell('standard_stundensatz'))
        if (isFinite(mwst)) setMwstSatz(mwst)
        if (isFinite(satz)) setStandardSatz(satz)
      })
      .catch((err) => onFehler(err instanceof Error ? err.message : 'Fehler beim Laden'))
  }, [])

  const summen = useMemo(() => {
    const netto = round2(
      positionen.reduce((s, p) => s + round2(p.menge * p.einzelpreis), 0),
    )
    const mwstBetrag = round2((netto * mwstSatz) / 100)
    return { netto, mwstBetrag, brutto: round2(netto + mwstBetrag) }
  }, [positionen, mwstSatz])

  const ausgewKunde = useMemo(
    () => kunden.find((k) => k.id === kundeId) ?? null,
    [kundeId, kunden],
  )

  function aendern(i: number, feld: keyof EditPos, wert: string) {
    setPositionen((alt) =>
      alt.map((p, idx): EditPos => {
        if (idx !== i) return p
        if (feld === 'menge' || feld === 'einzelpreis') {
          return { ...p, [feld]: Number(wert.replace(',', '.')) || 0 }
        }
        return { ...p, [feld]: wert }
      }),
    )
  }

  const entfernen = (i: number) => setPositionen((alt) => alt.filter((_, idx) => idx !== i))

  function frei() {
    setPositionen((alt) => [
      ...alt,
      { bezeichnung: '', menge: 1, einheit: 'Stück', einzelpreis: 0 },
    ])
  }

  function arbeitszeit() {
    setPositionen((alt) => [
      ...alt,
      { bezeichnung: 'Arbeitszeit', menge: 1, einheit: 'Std', einzelpreis: standardSatz },
    ])
  }

  function ausKatalog(k: KatalogItem) {
    setPositionen((alt) => [
      ...alt,
      { bezeichnung: k.bezeichnung, menge: 1, einheit: k.einheit, einzelpreis: Number(k.einzelpreis) },
    ])
  }

  async function speichern(e: FormEvent) {
    e.preventDefault()
    onFehler(null)
    setBusy(true)
    try {
      let zielKundeId = kundeId
      if (neuerKunde) {
        if (!neuKundeName.trim()) throw new Error('Kundenname ist erforderlich')
        const neu = await erstelleKunde({
          name: neuKundeName,
          adresse: neuKundeAdresse,
          email: neuKundeEmail,
        })
        zielKundeId = neu.id
      }
      if (!zielKundeId) throw new Error('Bitte einen Kunden wählen')
      if (positionen.length === 0) throw new Error('Mindestens eine Position erforderlich')

      await erstelleFreieRechnung({
        kundeId: zielKundeId,
        objekt: objekt.trim() || undefined,
        beschreibung: beschreibung.trim() || undefined,
        positionen,
      })
      onErstellt()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Erstellen fehlgeschlagen')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onAbbrechen}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Neue Rechnung erstellen</h2>

        <label className="modal-feld">
          Kunde
          <div className="kunde-wahl">
            {!neuerKunde ? (
              <select value={kundeId} onChange={(e) => setKundeId(e.target.value)}>
                <option value="">— Kunde wählen —</option>
                {kunden.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="neuer-kunde">
                <input
                  placeholder="Kundenname"
                  value={neuKundeName}
                  onChange={(e) => setNeuKundeName(e.target.value)}
                />
                <input
                  placeholder="Adresse"
                  value={neuKundeAdresse}
                  onChange={(e) => setNeuKundeAdresse(e.target.value)}
                />
                <input
                  placeholder="E-Mail"
                  type="email"
                  value={neuKundeEmail}
                  onChange={(e) => setNeuKundeEmail(e.target.value)}
                />
              </div>
            )}
            <button
              type="button"
              className="abmelden"
              onClick={() => setNeuerKunde((v) => !v)}
            >
              {neuerKunde ? 'Bestehenden wählen' : '+ Neuer Kunde'}
            </button>
          </div>
        </label>

        {ausgewKunde && !ausgewKunde.email && (
          <p className="hinweis-text">
            Hinweis: für diesen Kunden ist keine E-Mail hinterlegt; der „Per E-Mail"-Button
            wird das Empfängerfeld leer lassen.
          </p>
        )}

        <label className="modal-feld">
          Objekt
          <input value={objekt} onChange={(e) => setObjekt(e.target.value)} />
        </label>
        <label className="modal-feld">
          Beschreibung
          <textarea
            rows={2}
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
          />
        </label>

        <div className="m-block-kopf" style={{ marginTop: '0.6rem' }}>
          <span>Positionen</span>
        </div>
        <div className="katalog-buttons">
          <button type="button" className="katalog-button" onClick={arbeitszeit}>
            + Arbeitszeit
            <span className="katalog-preis">{formatEuro(standardSatz)}/Std</span>
          </button>
          {katalog.map((k) => (
            <button
              key={k.id}
              type="button"
              className="katalog-button"
              onClick={() => ausKatalog(k)}
            >
              {k.bezeichnung}
              <span className="katalog-preis">{formatEuro(Number(k.einzelpreis))}</span>
            </button>
          ))}
          <button type="button" className="katalog-button" onClick={frei}>
            + Freie Position
          </button>
        </div>

        {positionen.length > 0 && (
          <table className="pos-tabelle">
            <thead>
              <tr>
                <th>Bezeichnung</th>
                <th>Menge</th>
                <th>Einheit</th>
                <th>Einzelpreis</th>
                <th className="rechts">Betrag</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      value={p.bezeichnung}
                      onChange={(e) => aendern(i, 'bezeichnung', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="schmal"
                      type="number"
                      step="0.01"
                      value={p.menge}
                      onChange={(e) => aendern(i, 'menge', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="schmal"
                      value={p.einheit}
                      onChange={(e) => aendern(i, 'einheit', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="schmal"
                      type="number"
                      step="0.01"
                      value={p.einzelpreis}
                      onChange={(e) => aendern(i, 'einzelpreis', e.target.value)}
                    />
                  </td>
                  <td className="rechts">
                    {formatEuro(round2(p.menge * p.einzelpreis))}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="mat-loeschen"
                      onClick={() => entfernen(i)}
                      aria-label="Position entfernen"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="summen">
          <div>
            <span>Gesamt netto</span>
            <strong>{formatEuro(summen.netto)}</strong>
          </div>
          <div>
            <span>MwSt. {mwstSatz}%</span>
            <strong>{formatEuro(summen.mwstBetrag)}</strong>
          </div>
          <div className="summen-brutto">
            <span>Gesamt brutto</span>
            <strong>{formatEuro(summen.brutto)}</strong>
          </div>
        </div>

        <form onSubmit={speichern} className="modal-aktionen">
          <button type="button" className="abmelden" onClick={onAbbrechen}>
            Abbrechen
          </button>
          <button type="submit" className="erstellen" disabled={busy}>
            {busy ? 'Erstelle …' : 'Rechnung verbindlich erstellen'}
          </button>
        </form>
      </div>
    </div>
  )
}
