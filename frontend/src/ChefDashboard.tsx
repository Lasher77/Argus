import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { logout, type User } from './api'
import {
  ladeAuftraege,
  ladeZuweisbare,
  erstelleAuftrag,
  weiseAuftragZu,
  type AuftragRow,
  type Zuweisbar,
} from './chefApi'
import { formatEuro, formatDatum, formatStunden } from './format'
import StatusBadge from './StatusBadge'
import { ladeKontext, ladeObjekte, type Kontext, type Objekt } from './objekteApi'
import Modal from './objekte/Modal'
import ObjektFormular from './objekte/ObjektFormular'
import EinheitFormular from './objekte/EinheitFormular'

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
  const [monteure, setMonteure] = useState<Zuweisbar[]>([])
  const [fehler, setFehler] = useState<string | null>(null)
  const [zeigeFormular, setZeigeFormular] = useState(false)

  async function neuLaden() {
    try {
      const [a, m] = await Promise.all([ladeAuftraege(), ladeZuweisbare()])
      setAuftraege(a)
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
  onFertig,
  onFehler,
}: {
  onFertig: () => void
  onFehler: (f: string | null) => void
}) {
  const [objekte, setObjekte] = useState<Objekt[]>([])
  const [frei, setFrei] = useState(false)
  const [objektId, setObjektId] = useState('')
  const [einheitId, setEinheitId] = useState('')
  const [einsatzort, setEinsatzort] = useState('')
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [kontext, setKontext] = useState<Kontext | null>(null)
  const [dialog, setDialog] = useState<'objekt' | 'einheit' | null>(null)
  const [laedt, setLaedt] = useState(false)

  async function objekteLaden() {
    try {
      setObjekte((await ladeObjekte()).filter((o) => !o.archiviert))
    } catch (err) {
      onFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    objekteLaden()
  }, [])

  const objekt = objekte.find((o) => o.id === objektId) ?? null

  // Zeigt die geerbten Daten (Hausverwaltung, Ansprechpartner, Vor Ort) zum Bezug.
  async function bezugWaehlen(neuObjekt: string, neueEinheit: string) {
    setObjektId(neuObjekt)
    setEinheitId(neueEinheit)
    if (!neuObjekt) {
      setKontext(null)
      return
    }
    try {
      setKontext(await ladeKontext(neuObjekt, neueEinheit || undefined))
    } catch {
      setKontext(null)
    }
  }

  async function absenden(e: FormEvent) {
    e.preventDefault()
    onFehler(null)
    setLaedt(true)
    try {
      if (!frei && !objektId) throw new Error('Bitte ein Objekt wählen oder „Freier Auftrag" nutzen')
      await erstelleAuftrag({
        objektId: frei ? null : objektId,
        einheitId: frei ? null : einheitId || null,
        einsatzort: frei ? einsatzort : undefined,
        titel,
        beschreibung,
      })
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

      <div className="bezug-wahl">
        <label>
          <input type="radio" checked={!frei} onChange={() => setFrei(false)} /> Objektbezug
        </label>
        <label>
          <input type="radio" checked={frei} onChange={() => setFrei(true)} /> Freier Auftrag
        </label>
      </div>

      {!frei ? (
        <>
          <label>
            Objekt
            <div className="kunde-wahl">
              <select value={objektId} onChange={(e) => bezugWaehlen(e.target.value, '')}>
                <option value="">— Objekt wählen —</option>
                {objekte.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.adresse ? ` – ${o.adresse}` : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="abmelden" onClick={() => setDialog('objekt')}>
                + Neues Objekt
              </button>
            </div>
          </label>
          <label>
            Einheit
            <div className="kunde-wahl">
              <select
                value={einheitId}
                disabled={!objekt}
                onChange={(e) => bezugWaehlen(objektId, e.target.value)}
              >
                <option value="">— gesamtes Objekt —</option>
                {objekt?.einheiten
                  .filter((x) => !x.archiviert)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.bezeichnung}
                    </option>
                  ))}
              </select>
              <button type="button" className="abmelden" disabled={!objekt} onClick={() => setDialog('einheit')}>
                + Neue Einheit
              </button>
            </div>
          </label>
          {kontext && (
            <p className="hinweis-text">
              Hausverwaltung: <strong>{kontext.hausverwaltung?.name ?? '—'}</strong>
              {' · '}Ansprechpartner: <strong>{kontext.ansprechpartner?.name ?? '—'}</strong>
              {' · '}Vor Ort: <strong>{kontext.vorOrt.name || '—'}</strong>
            </p>
          )}
        </>
      ) : (
        <label>
          Einsatzort (optional)
          <input
            value={einsatzort}
            onChange={(e) => setEinsatzort(e.target.value)}
            placeholder="z. B. Gartenstr. 5, 10115 Berlin"
          />
        </label>
      )}

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

      {dialog === 'objekt' && (
        <Modal titel="Neues Objekt" onSchliessen={() => setDialog(null)}>
          <ObjektFormular
            onAbbrechen={() => setDialog(null)}
            onFertig={async (id) => {
              setDialog(null)
              await objekteLaden()
              bezugWaehlen(id, '')
            }}
          />
        </Modal>
      )}
      {dialog === 'einheit' && objekt && (
        <Modal titel="Neue Einheit" onSchliessen={() => setDialog(null)}>
          <EinheitFormular
            objekt={objekt}
            onAbbrechen={() => setDialog(null)}
            onFertig={async (id) => {
              setDialog(null)
              await objekteLaden()
              bezugWaehlen(objekt.id, id)
            }}
          />
        </Modal>
      )}
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
            <span>Objekt: {a.ortLabel}</span>
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
