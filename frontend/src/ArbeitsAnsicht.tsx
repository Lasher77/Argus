import { useEffect, useState } from 'react'
import { logout, type User } from './api'
import {
  ladeMeineAuftraege,
  ladeKatalog,
  type ArbeitsAuftrag,
  type KatalogItem,
} from './arbeitApi'
import AuftragKarte from './arbeit/AuftragKarte'

export default function ArbeitsAnsicht({
  user,
  onLogout,
  eingebettet = false,
}: {
  user: User
  onLogout: () => void
  eingebettet?: boolean
}) {
  const [auftraege, setAuftraege] = useState<ArbeitsAuftrag[]>([])
  const [katalog, setKatalog] = useState<KatalogItem[]>([])
  const [fehler, setFehler] = useState<string | null>(null)

  async function neuLaden() {
    try {
      const [a, k] = await Promise.all([ladeMeineAuftraege(), ladeKatalog()])
      setAuftraege(a)
      setKatalog(k)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Fehler beim Laden')
    }
  }

  useEffect(() => {
    neuLaden()
  }, [])

  async function abmelden() {
    await logout()
    onLogout()
  }

  return (
    <div className="monteur">
      {!eingebettet && (
        <header className="m-kopf">
          <span>
            Hallo <strong>{user.name}</strong>
          </span>
          <button type="button" onClick={abmelden} className="abmelden">
            Abmelden
          </button>
        </header>
      )}

      {fehler && <p className="fehler">{fehler}</p>}

      {auftraege.length === 0 ? (
        <p className="leer">Keine offenen Aufträge.</p>
      ) : (
        auftraege.map((a) => (
          <AuftragKarte
            key={a.id}
            auftrag={a}
            katalog={katalog}
            onAenderung={neuLaden}
            onFehler={setFehler}
          />
        ))
      )}
    </div>
  )
}
