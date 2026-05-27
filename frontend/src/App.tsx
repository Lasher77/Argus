import { useEffect, useState } from 'react'

export default function App() {
  const [status, setStatus] = useState<string>('verbinde …')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setStatus(data.message ?? 'ok'))
      .catch(() => setStatus('Backend nicht erreichbar'))
  }, [])

  return (
    <main className="hallo">
      <h1>Auftragsbuch</h1>
      <p>Hallo Welt – das Gerüst steht.</p>
      <p className="status">
        Backend-Status: <strong>{status}</strong>
      </p>
    </main>
  )
}
