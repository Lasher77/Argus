import { useState } from 'react'
import { logout, type User } from './api'
import Uebersicht from './buero/Uebersicht'
import Kunden from './buero/Kunden'
import Katalog from './buero/Katalog'
import Einstellungen from './buero/Einstellungen'

type Tab = 'uebersicht' | 'kunden' | 'katalog' | 'einstellungen'

const TABS: { id: Tab; label: string }[] = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'kunden', label: 'Kunden' },
  { id: 'katalog', label: 'Material-Katalog' },
  { id: 'einstellungen', label: 'Einstellungen' },
]

export default function BueroAnsicht({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const [tab, setTab] = useState<Tab>('uebersicht')

  async function abmelden() {
    await logout()
    onLogout()
  }

  return (
    <div className="dashboard">
      <header className="kopf">
        <span>
          Angemeldet als <strong>{user.name}</strong> (Büro)
        </span>
        <button type="button" onClick={abmelden} className="abmelden">
          Abmelden
        </button>
      </header>

      <h1>Büro</h1>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab-aktiv' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'uebersicht' && <Uebersicht />}
      {tab === 'kunden' && <Kunden />}
      {tab === 'katalog' && <Katalog />}
      {tab === 'einstellungen' && <Einstellungen />}
    </div>
  )
}
