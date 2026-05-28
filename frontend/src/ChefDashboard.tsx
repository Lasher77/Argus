import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { logout, type User } from './api'
import {
  ladeAuftraege,
  ladeKunden,
  ladeZuweisbare,
  erstelleAuftrag,
  erstelleKunde,
  weiseAuftragZu,
  type AuftragRow,
  type Kunde,
  type Zuweisbar,
} from './chefApi'
import { formatEuro, formatDatum, formatStunden } from './format'
import StatusBadge from './StatusBadge'

export default function ChefDashboard({
  user,
  onLogout,
  eingebettet = false,
}: {
  user: User
  onLogout: () => void
  eingebettet?: boolean
}) {
  const [auftraege, setAuftraege] = useState<AuftragRow[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [monteure, setMonteure] = useState<Zuweisbar[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [zeigeFormular, setZeigeFormular] = useState(false)

  async function neuLaden() {
    try {
      const [a, k, m] = await Promise.all([
        ladeAuftraege(),
        ladeKunden(),
        ladeZuweisbare(),
      ])
      setAuftraege(a)
      setKunden(k)
      setMonteure(m)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    neuLaden()
  }, [])

  // Kennzahlen aus der geladenen Liste ableiten.
  const kennzahlen = useMemo(() => {
    const jetzt = new Date()
    const offen = auftraege.filter((a) =>
      ['neu', 'geplant', 'arbeit'].includes(a.status),
    ).length
    const zuBerechnen = auftraege
      .filter((a) => a.status === 'erledigt')
      .reduce((s, a) => s + a.summe, 0)
    const umsatzMonat = auftraege
      .filter((a) => {
        if (!['rechnung', 'bezahlt'].includes(a.status) || !a.erledigtAm)
          return false
        const d = new Date(a.erledigtAm)
        return (
          d.getFullYear() === jetzt.getFullYear() &&
          d.getMonth() === jetzt.getMonth()
        )
      })
      .reduce((s, a) => s + a.summe, 0)
    return { offen, zuBerechnen, umsatzMonat }
  }, [auftraege])

  async function abmelden() {
    await logout()
    onLogout()
  }

  return (
    <div className={eingebettet ? '' : 'dashboard'}>
      {!eingebettet && (
        <header className="kopf">
          <span>
            Angemeldet als <strong>{user.name}</strong> (Chef)
          </span>
          <button type="button" onClick={abmelden} className="abmelden">
            Abmelden
          </button>
        </header>
      )}

      {!eingebettet && <h1>Chef-Übersicht</h1>}

      <section className="kennzahlen">
        <div className="kennzahl">
          <span className="kennzahl-wert">{kennzahlen.offen}</span>
          <span className="kennzahl-label">Offene Aufträge</span>
        </div>
        <div className="kennzahl">
          <span className="kennzahl-wert">
            {formatEuro(kennzahlen.zuBerechnen)}
          </span>
          <span className="kennzahl-label">Noch zu berechnen</span>
        </div>
        <div className="kennzahl">
          <span className="kennzahl-wert">
            {formatEuro(kennzahlen.umsatzMonat)}
          </span>
          <span className="kennzahl-label">Umsatz (laufender Monat)</span>
        </div>
      </section>

      {fehler && <p className="fehler">{fehler}</p>}

      <div className="aktionsleiste">
        <button type="button" onClick={() => setZeigeFormular((v) => !v)}>
          {zeigeFormular ? 'Abbrechen' : 'Neuer Auftrag'}
        </button>
      </div>

      {zeigeFormular && (
        <NeuerAuftrag
          kunden={kunden}
          onFertig={() => {
            setZeigeFormular(false)
            neuLaden()
          }}
          onFehler={setFehler}
        />
      )}

      <AuftragsListe
        auftraege={auftraege}
        monteure={monteure}
        onAktualisiert={neuLaden}
        onFehler={setFehler}
      />
    </div>
  )
}

function NeuerAuftrag({
  kunden,
  onFertig,
  onFehler,
}: {
  kunden: Kunde[]
  onFertig: () => void
  onFehler: (f: string | null) => void
}) {
  const [kundeId, setKundeId] = useState('')
  const [neuerKunde, setNeuerKunde] = useState(false)
  const [kundeName, setKundeName] = useState('')
  const [kundeAdresse, setKundeAdresse] = useState('')
  const [kundeTelefon, setKundeTelefon] = useState('')
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [laedt, setLaedt] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    onFehler(null)
    setLaedt(true)
    try {
      let zielKundeId = kundeId
      if (neuerKunde) {
        if (!kundeName.trim()) throw new Error('Kundenname ist erforderlich')
        const k = await erstelleKunde({
          name: kundeName,
          adresse: kundeAdresse,
          telefon: kundeTelefon,
        })
        zielKundeId = k.id
      }
      if (!zielKundeId) throw new Error('Bitte einen Kunden wählen')
      await erstelleAuftrag({ kundeId: zielKundeId, titel, beschreibung })
      onFertig()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <form onSubmit={absenden} className="formular karte-innen">
      <h2>Neuer Auftrag</h2>

      <label>
        Kunde
        <div className="kunde-wahl">
          {!neuerKunde ? (
            <select
              value={kundeId}
              onChange={(e) => setKundeId(e.target.value)}
            >
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
                value={kundeName}
                onChange={(e) => setKundeName(e.target.value)}
              />
              <input
                placeholder="Adresse"
                value={kundeAdresse}
                onChange={(e) => setKundeAdresse(e.target.value)}
              />
              <input
                placeholder="Telefon"
                value={kundeTelefon}
                onChange={(e) => setKundeTelefon(e.target.value)}
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

      <label>
        Titel
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="z. B. Heizung warten"
          required
        />
      </label>

      <label>
        Beschreibung
        <textarea
          value={beschreibung}
          onChange={(e) => setBeschreibung(e.target.value)}
          rows={3}
        />
      </label>

      <button type="submit" disabled={laedt}>
        {laedt ? 'Speichern …' : 'Auftrag anlegen'}
      </button>
    </form>
  )
}

function AuftragsListe({
  auftraege,
  monteure,
  onAktualisiert,
  onFehler,
}: {
  auftraege: AuftragRow[]
  monteure: Zuweisbar[]
  onAktualisiert: () => void
  onFehler: (f: string | null) => void
}) {
  const [offenId, setOffenId] = useState<string | null>(null)

  if (auftraege.length === 0) {
    return <p className="leer">Noch keine Aufträge angelegt.</p>
  }

  return (
    <div className="liste">
      {auftraege.map((a) => (
        <div key={a.id} className="auftrag">
          <div className="auftrag-kopf">
            <div>
              <StatusBadge status={a.status} />
              <span className="auftrag-titel">{a.titel}</span>
            </div>
            <span className="auftrag-summe">{formatEuro(a.summe)}</span>
          </div>
          <div className="auftrag-meta">
            <span>Kunde: {a.kundeName ?? '—'}</span>
            <span>Monteur: {a.monteurName ?? 'nicht zugewiesen'}</span>
            <span>Termin: {formatDatum(a.termin)}</span>
            <span>Stunden: {formatStunden(a.stunden)}</span>
            <span>Material: {a.materialAnzahl}</span>
            <span>Fotos: {a.fotoAnzahl}</span>
          </div>

          {(a.status === 'neu' || a.status === 'geplant') && (
            <div className="auftrag-aktion">
              <button
                type="button"
                className="abmelden"
                onClick={() => setOffenId(offenId === a.id ? null : a.id)}
              >
                {a.status === 'neu' ? 'Zuweisen' : 'Zuweisung ändern'}
              </button>
              {offenId === a.id && (
                <Zuweisen
                  auftrag={a}
                  monteure={monteure}
                  onFertig={() => {
                    setOffenId(null)
                    onAktualisiert()
                  }}
                  onFehler={onFehler}
                />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Zuweisen({
  auftrag,
  monteure,
  onFertig,
  onFehler,
}: {
  auftrag: AuftragRow
  monteure: Zuweisbar[]
  onFertig: () => void
  onFehler: (f: string | null) => void
}) {
  const [monteurId, setMonteurId] = useState(auftrag.monteurId ?? '')
  const [termin, setTermin] = useState('')
  const [laedt, setLaedt] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    onFehler(null)
    setLaedt(true)
    try {
      if (!monteurId) throw new Error('Bitte eine Person wählen')
      await weiseAuftragZu(auftrag.id, {
        monteurId,
        termin: termin ? new Date(termin).toISOString() : null,
      })
      onFertig()
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Zuweisen fehlgeschlagen')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <form onSubmit={absenden} className="zuweisen-formular">
      <select value={monteurId} onChange={(e) => setMonteurId(e.target.value)}>
        <option value="">— Person wählen —</option>
        {monteure.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.rolle === 'chef' ? 'Chef' : 'Monteur'})
          </option>
        ))}
      </select>
      <input
        type="datetime-local"
        value={termin}
        onChange={(e) => setTermin(e.target.value)}
      />
      <button type="submit" disabled={laedt}>
        {laedt ? '…' : 'Speichern'}
      </button>
    </form>
  )
}
