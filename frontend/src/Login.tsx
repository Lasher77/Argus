import { useState, type FormEvent } from 'react'
import { login, type User } from './api'

export default function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laedt, setLaedt] = useState(false)

  async function absenden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLaedt(true)
    try {
      const user = await login(email, passwort)
      onLogin(user)
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Login fehlgeschlagen')
    } finally {
      setLaedt(false)
    }
  }

  return (
    <main className="karte">
      <h1>Auftragsbuch</h1>
      <p>Bitte anmelden.</p>
      <form onSubmit={absenden} className="formular">
        <label>
          E-Mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Passwort
          <input
            type="password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {fehler && <p className="fehler">{fehler}</p>}
        <button type="submit" disabled={laedt}>
          {laedt ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
    </main>
  )
}
