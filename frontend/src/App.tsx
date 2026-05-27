import { useEffect, useState } from 'react'
import { getMe, type User } from './api'
import Login from './Login'
import Bereich from './Bereich'
import ChefDashboard from './ChefDashboard'

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [laedt, setLaedt] = useState(true)

  useEffect(() => {
    getMe()
      .then(setUser)
      .finally(() => setLaedt(false))
  }, [])

  if (laedt) {
    return (
      <main className="karte">
        <p>lädt …</p>
      </main>
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (user.rolle === 'chef') {
    return <ChefDashboard user={user} onLogout={() => setUser(null)} />
  }

  return <Bereich user={user} onLogout={() => setUser(null)} />
}
