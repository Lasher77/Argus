// Beschriftetes Textfeld für die Formulare dieses Bereichs.
export default function Feld({
  label,
  wert,
  onChange,
  typ = 'text',
  platzhalter,
  pflicht = false,
}: {
  label: string
  wert: string
  onChange: (v: string) => void
  typ?: 'text' | 'email' | 'tel'
  platzhalter?: string
  pflicht?: boolean
}) {
  return (
    <label>
      {label}
      <input
        type={typ}
        value={wert}
        placeholder={platzhalter}
        required={pflicht}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
