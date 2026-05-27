export type Rolle = 'chef' | 'monteur' | 'buero'

export interface User {
  id: string
  name: string
  rolle: Rolle
}

export async function getMe(): Promise<User | null> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) return null
  return res.json()
}

export async function login(email: string, passwort: string): Promise<User> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, passwort }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Login fehlgeschlagen')
  }
  return res.json()
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}
