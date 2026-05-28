import { useEffect, useState } from 'react'
import { getMe, type User } from './api'
import Login from './Login'
import Bereich from './Bereich'
import ChefRahmen from './ChefRahmen'
import ArbeitsAnsicht from './ArbeitsAnsicht'
import BueroAnsicht from './BueroAnsicht'

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
    return <ChefRahmen user={user} onLogout={() => setUser(null)} />
  }

  if (user.rolle === 'monteur') {
    return <ArbeitsAnsicht user={user} onLogout={() => setUser(null)} />
  }

  if (user.rolle === 'buero') {
    return <BueroAnsicht user={user} onLogout={() => setUser(null)} />
  }

  return <Bereich user={user} onLogout={() => setUser(null)} />
}
