import { useState } from 'react'
import { logout, type User } from './api'
import ChefDashboard from './ChefDashboard'
import ArbeitsAnsicht from './ArbeitsAnsicht'

type Tab = 'dashboard' | 'arbeit'

// Rahmen für die Chef-Rolle: zeigt entweder das Dashboard
// (Geschäftsführung, alle Aufträge) oder die Arbeitsansicht
// "Meine Aufträge" (nur dem Chef selbst zugewiesene Aufträge).
// Siehe Rollenmodell in CLAUDE.md §1.
export default function ChefRahmen({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const [tab, setTab] = useState<Tab>('dashboard')

  async function abmelden() {
    await logout()
    onLogout()
  }

  return (
    <div className="dashboard">
      <header className="kopf">
        <span>
          Angemeldet als <strong>{user.name}</strong> (Chef)
        </span>
        <button type="button" onClick={abmelden} className="abmelden">
          Abmelden
        </button>
      </header>

      <h1>{tab === 'dashboard' ? 'Chef-Übersicht' : 'Meine Aufträge'}</h1>

      <nav className="tabs">
        <button
          type="button"
          className={`tab ${tab === 'dashboard' ? 'tab-aktiv' : ''}`}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={`tab ${tab === 'arbeit' ? 'tab-aktiv' : ''}`}
          onClick={() => setTab('arbeit')}
        >
          Meine Aufträge
        </button>
      </nav>

      {tab === 'dashboard' ? (
        <ChefDashboard user={user} onLogout={onLogout} eingebettet />
      ) : (
        <ArbeitsAnsicht user={user} onLogout={onLogout} eingebettet />
      )}
    </div>
  )
}
