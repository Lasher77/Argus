import { useState } from 'react'
import { logout, type User } from './api'
import Uebersicht from './buero/Uebersicht'
import ObjektePflege from './objekte/ObjektePflege'
import Katalog from './buero/Katalog'
import Einstellungen from './buero/Einstellungen'

type Tab = 'uebersicht' | 'objekte' | 'katalog' | 'einstellungen'

const TABS: { id: Tab; label: string }[] = [
  { id: 'uebersicht', label: 'Übersicht' },
  { id: 'objekte', label: 'Objekte' },
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
      {tab === 'objekte' && <ObjektePflege />}
      {tab === 'katalog' && <Katalog />}
      {tab === 'einstellungen' && <Einstellungen />}
    </div>
  )
}
