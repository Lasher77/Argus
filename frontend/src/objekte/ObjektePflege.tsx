import { useCallback, useEffect, useState } from 'react'
import {
  archiviereAnsprechpartner,
  archiviereEinheit,
  archiviereHausverwaltung,
  archiviereObjekt,
  ladeAnsprechpartner,
  ladeHausverwaltungen,
  ladeObjekte,
  type Ansprechpartner,
  type Einheit,
  type Hausverwaltung,
  type Objekt,
} from '../objekteApi'
import Modal from './Modal'
import ObjektFormular from './ObjektFormular'
import EinheitFormular from './EinheitFormular'
import HausverwaltungFormular from './HausverwaltungFormular'
import AnsprechpartnerFormular from './AnsprechpartnerFormular'
import { adresseKurz } from './RechnungsadresseFelder'

type Unter = 'objekte' | 'hausverwaltungen' | 'ansprechpartner'

const UNTER: { id: Unter; label: string }[] = [
  { id: 'objekte', label: 'Objekte & Einheiten' },
  { id: 'hausverwaltungen', label: 'Hausverwaltungen' },
  { id: 'ansprechpartner', label: 'Ansprechpartner' },
]

// Büro-Tab "Objekte": Pflege von Objekten (mit Einheiten), Hausverwaltungen
// (mit ihren Ansprechpartnern) und allen Ansprechpartnern. Es wird nichts
// gelöscht, sondern archiviert – Aufträge und Rechnungen behalten ihre Verweise.
export default function ObjektePflege() {
  const [unter, setUnter] = useState<Unter>('objekte')
  return (
    <div>
      <nav className="tabs unter-tabs">
        {UNTER.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`tab ${unter === u.id ? 'tab-aktiv' : ''}`}
            onClick={() => setUnter(u.id)}
          >
            {u.label}
          </button>
        ))}
      </nav>
      {unter === 'objekte' && <ObjektListe />}
      {unter === 'hausverwaltungen' && <HvListe />}
      {unter === 'ansprechpartner' && <ApListe />}
    </div>
  )
}

function ArchivSchalter({ an, onChange }: { an: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="archiv-schalter">
      <input type="checkbox" checked={an} onChange={(e) => onChange(e.target.checked)} />
      Archivierte anzeigen
    </label>
  )
}

// ---------------- Objekte & Einheiten ----------------
type Dialog =
  | { art: 'objekt'; objekt?: Objekt }
  | { art: 'einheit'; objekt: Objekt; einheit?: Einheit }
  | null

function ObjektListe() {
  const [objekte, setObjekte] = useState<Objekt[]>([])
  const [archiv, setArchiv] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const neuLaden = useCallback(async () => {
    try {
      setObjekte(await ladeObjekte())
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }, [])

  useEffect(() => {
    neuLaden()
  }, [neuLaden])

  async function umschalten(fn: () => Promise<unknown>) {
    setFehler(null)
    try {
      await fn()
      neuLaden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Aktion fehlgeschlagen')
    }
  }

  const sichtbar = objekte.filter((o) => archiv || !o.archiviert)

  return (
    <div>
      <div className="such-leiste">
        <button type="button" onClick={() => setDialog({ art: 'objekt' })}>
          + Neues Objekt
        </button>
        <ArchivSchalter an={archiv} onChange={setArchiv} />
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {sichtbar.length === 0 && <p className="leer">Noch keine Objekte angelegt.</p>}

      <div className="liste">
        {sichtbar.map((o) => (
          <div key={o.id} className={`auftrag ${o.archiviert ? 'archiviert' : ''}`}>
            <div className="auftrag-kopf">
              <span className="auftrag-titel">
                {o.name}
                {o.archiviert && <span className="frei-hinweis"> (archiviert)</span>}
              </span>
            </div>
            <div className="auftrag-meta">
              <span>{o.adresse || 'keine Adresse'}</span>
              <span>Hausverwaltung: {o.hausverwaltungName ?? '—'}</span>
            </div>
            <div className="zeilen-aktionen">
              <button type="button" className="neben-button klein" onClick={() => setDialog({ art: 'objekt', objekt: o })}>
                Bearbeiten
              </button>
              <button type="button" className="neben-button klein" onClick={() => setDialog({ art: 'einheit', objekt: o })}>
                + Einheit
              </button>
              <button
                type="button"
                className="neben-button klein"
                onClick={() => umschalten(() => archiviereObjekt(o.id, !o.archiviert))}
              >
                {o.archiviert ? 'Wiederherstellen' : 'Archivieren'}
              </button>
            </div>

            {o.einheiten
              .filter((e) => archiv || !e.archiviert)
              .map((e) => (
                <div key={e.id} className={`einheit-zeile ${e.archiviert ? 'archiviert' : ''}`}>
                  <span>
                    {e.bezeichnung}
                    {e.archiviert && <span className="frei-hinweis"> (archiviert)</span>}
                  </span>
                  <span className="zeilen-aktionen">
                    <button type="button" className="neben-button klein" onClick={() => setDialog({ art: 'einheit', objekt: o, einheit: e })}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="neben-button klein"
                      onClick={() => umschalten(() => archiviereEinheit(e.id, !e.archiviert))}
                    >
                      {e.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                    </button>
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {dialog?.art === 'objekt' && (
        <Modal titel={dialog.objekt ? 'Objekt bearbeiten' : 'Neues Objekt'} onSchliessen={() => setDialog(null)}>
          <ObjektFormular
            objekt={dialog.objekt}
            onAbbrechen={() => setDialog(null)}
            onFertig={() => {
              setDialog(null)
              neuLaden()
            }}
          />
        </Modal>
      )}
      {dialog?.art === 'einheit' && (
        <Modal titel={dialog.einheit ? 'Einheit bearbeiten' : 'Neue Einheit'} onSchliessen={() => setDialog(null)}>
          <EinheitFormular
            objekt={dialog.objekt}
            einheit={dialog.einheit}
            onAbbrechen={() => setDialog(null)}
            onFertig={() => {
              setDialog(null)
              neuLaden()
            }}
          />
        </Modal>
      )}
    </div>
  )
}

// ---------------- Hausverwaltungen ----------------
type HvDialog =
  | { art: 'hv'; hv?: Hausverwaltung }
  | { art: 'ap'; hvId: string; ap?: Ansprechpartner }
  | null

function HvListe() {
  const [hvs, setHvs] = useState<Hausverwaltung[]>([])
  const [archiv, setArchiv] = useState(false)
  const [dialog, setDialog] = useState<HvDialog>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const neuLaden = useCallback(async () => {
    try {
      setHvs(await ladeHausverwaltungen())
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }, [])

  useEffect(() => {
    neuLaden()
  }, [neuLaden])

  async function umschalten(fn: () => Promise<unknown>) {
    setFehler(null)
    try {
      await fn()
      neuLaden()
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Aktion fehlgeschlagen')
    }
  }

  const sichtbar = hvs.filter((h) => archiv || !h.archiviert)

  return (
    <div>
      <div className="such-leiste">
        <button type="button" onClick={() => setDialog({ art: 'hv' })}>
          + Neue Hausverwaltung
        </button>
        <ArchivSchalter an={archiv} onChange={setArchiv} />
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      {sichtbar.length === 0 && <p className="leer">Noch keine Hausverwaltungen angelegt.</p>}

      <div className="liste">
        {sichtbar.map((h) => (
          <div key={h.id} className={`auftrag ${h.archiviert ? 'archiviert' : ''}`}>
            <div className="auftrag-kopf">
              <span className="auftrag-titel">
                {h.name}
                {h.archiviert && <span className="frei-hinweis"> (archiviert)</span>}
              </span>
            </div>
            <div className="auftrag-meta">
              <span>Rechnungsadresse: {adresseKurz(h) || '—'}</span>
              {h.rechnungEmail && <span>E-Mail: {h.rechnungEmail}</span>}
              {h.rechnungKundennr && <span>Kundennr.: {h.rechnungKundennr}</span>}
            </div>
            <div className="zeilen-aktionen">
              <button type="button" className="neben-button klein" onClick={() => setDialog({ art: 'hv', hv: h })}>
                Bearbeiten
              </button>
              <button type="button" className="neben-button klein" onClick={() => setDialog({ art: 'ap', hvId: h.id })}>
                + Ansprechpartner
              </button>
              <button
                type="button"
                className="neben-button klein"
                onClick={() => umschalten(() => archiviereHausverwaltung(h.id, !h.archiviert))}
              >
                {h.archiviert ? 'Wiederherstellen' : 'Archivieren'}
              </button>
            </div>
            {h.ansprechpartner
              .filter((a) => archiv || !a.archiviert)
              .map((a) => (
                <div key={a.id} className={`einheit-zeile ${a.archiviert ? 'archiviert' : ''}`}>
                  <span>
                    {a.name}
                    {a.rolle ? ` (${a.rolle})` : ''}
                    {a.telefon ? ` · ${a.telefon}` : ''}
                    {a.email ? ` · ${a.email}` : ''}
                  </span>
                  <span className="zeilen-aktionen">
                    <button type="button" className="neben-button klein" onClick={() => setDialog({ art: 'ap', hvId: h.id, ap: a })}>
                      Bearbeiten
                    </button>
                    <button
                      type="button"
                      className="neben-button klein"
                      onClick={() => umschalten(() => archiviereAnsprechpartner(a.id, !a.archiviert))}
                    >
                      {a.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                    </button>
                  </span>
                </div>
              ))}
          </div>
        ))}
      </div>

      {dialog?.art === 'hv' && (
        <Modal titel={dialog.hv ? 'Hausverwaltung bearbeiten' : 'Neue Hausverwaltung'} onSchliessen={() => setDialog(null)}>
          <HausverwaltungFormular
            hv={dialog.hv}
            onAbbrechen={() => setDialog(null)}
            onFertig={() => {
              setDialog(null)
              neuLaden()
            }}
          />
        </Modal>
      )}
      {dialog?.art === 'ap' && (
        <Modal titel={dialog.ap ? 'Ansprechpartner bearbeiten' : 'Neuer Ansprechpartner'} onSchliessen={() => setDialog(null)}>
          <AnsprechpartnerFormular
            ap={dialog.ap}
            hvs={hvs}
            vorgabeHvId={dialog.hvId}
            onAbbrechen={() => setDialog(null)}
            onFertig={() => {
              setDialog(null)
              neuLaden()
            }}
          />
        </Modal>
      )}
    </div>
  )
}

// ---------------- Alle Ansprechpartner ----------------
function ApListe() {
  const [aps, setAps] = useState<Ansprechpartner[]>([])
  const [hvs, setHvs] = useState<Hausverwaltung[]>([])
  const [archiv, setArchiv] = useState(false)
  const [dialog, setDialog] = useState<{ ap?: Ansprechpartner } | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  const neuLaden = useCallback(async () => {
    try {
      const [a, h] = await Promise.all([ladeAnsprechpartner(), ladeHausverwaltungen()])
      setAps(a)
      setHvs(h)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }, [])

  useEffect(() => {
    neuLaden()
  }, [neuLaden])

  const hvName = new Map(hvs.map((h) => [h.id, h.name]))
  const sichtbar = aps.filter((a) => archiv || !a.archiviert)

  return (
    <div>
      <div className="such-leiste">
        <button type="button" onClick={() => setDialog({})}>
          + Neuer Ansprechpartner
        </button>
        <ArchivSchalter an={archiv} onChange={setArchiv} />
      </div>
      {fehler && <p className="fehler">{fehler}</p>}
      <table className="tabelle">
        <thead>
          <tr>
            <th>Name</th>
            <th>Rolle</th>
            <th>Telefon</th>
            <th>E-Mail</th>
            <th>Hausverwaltung</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sichtbar.map((a) => (
            <tr key={a.id} className={a.archiviert ? 'archiviert' : ''}>
              <td>{a.name}</td>
              <td>{a.rolle ?? '—'}</td>
              <td>{a.telefon ?? '—'}</td>
              <td>{a.email ?? '—'}</td>
              <td>{a.hausverwaltungId ? hvName.get(a.hausverwaltungId) ?? '—' : 'frei'}</td>
              <td className="rechts">
                <button type="button" className="neben-button klein" onClick={() => setDialog({ ap: a })}>
                  Bearbeiten
                </button>
                <button
                  type="button"
                  className="neben-button klein"
                  onClick={async () => {
                    await archiviereAnsprechpartner(a.id, !a.archiviert)
                    neuLaden()
                  }}
                >
                  {a.archiviert ? 'Wiederherstellen' : 'Archivieren'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {dialog && (
        <Modal titel={dialog.ap ? 'Ansprechpartner bearbeiten' : 'Neuer Ansprechpartner'} onSchliessen={() => setDialog(null)}>
          <AnsprechpartnerFormular
            ap={dialog.ap}
            hvs={hvs}
            onAbbrechen={() => setDialog(null)}
            onFertig={() => {
              setDialog(null)
              neuLaden()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
