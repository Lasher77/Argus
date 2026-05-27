import { useEffect, useState } from 'react'
import { logout, type User } from './api'
import {
  ladeMeineAuftraege,
  ladeKatalog,
  type MonteurAuftrag,
  type KatalogItem,
} from './monteurApi'
import AuftragKarte from './monteur/AuftragKarte'

export default function MonteurAnsicht({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const [auftraege, setAuftraege] = useState<MonteurAuftrag[]>([])
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
      <header className="m-kopf">
        <span>
          Hallo <strong>{user.name}</strong>
        </span>
        <button type="button" onClick={abmelden} className="abmelden">
          Abmelden
        </button>
      </header>

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
