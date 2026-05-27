const euroFormat = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
})

export function formatEuro(betrag: number): string {
  return euroFormat.format(betrag)
}

export function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function formatStunden(stunden: number): string {
  return stunden.toLocaleString('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}
