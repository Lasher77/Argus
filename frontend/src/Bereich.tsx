import { useEffect, useState } from 'react'
import { logout, type User } from './api'

const TITEL: Record<User['rolle'], string> = {
  chef: 'Chef-Bereich',
  monteur: 'Monteur-Bereich',
  buero: 'Büro-Bereich',
}

// Platzhalterseite je Rolle. Lädt zur Bestätigung den rollengeschützten
// Endpunkt /api/<rolle>/uebersicht – das beweist, dass der Server die Rolle
// prüft (eine fremde Rolle bekäme hier 403).
export default function Bereich({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const [serverTitel, setServerTitel] = useState<string>('lädt …')

  useEffect(() => {
    fetch(`/api/${user.rolle}/uebersicht`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setServerTitel(data.titel))
      .catch(() => setServerTitel('— (kein Zugriff)'))
  }, [user.rolle])

  async function abmelden() {
    await logout()
    onLogout()
  }

  return (
    <main className="karte">
      <header className="kopf">
        <span>
          Angemeldet als <strong>{user.name}</strong> ({user.rolle})
        </span>
        <button type="button" onClick={abmelden} className="abmelden">
          Abmelden
        </button>
      </header>
      <h1>{TITEL[user.rolle]}</h1>
      <p>Platzhalter – die Funktionen folgen in den nächsten Etappen.</p>
      <p className="status">
        Server bestätigt: <strong>{serverTitel}</strong>
      </p>
    </main>
  )
}
