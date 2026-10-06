import type { AdressFelder } from '../objekteApi'
import Feld from './Feld'

// Rechnungsadress-Block: max. drei Adresszeilen (Empfänger, Straße + Hausnr.,
// PLZ + Stadt) plus optional E-Mail (Rechnungsversand) und Kundennummer.
export interface AdressWerte {
  rechnungEmpfaenger: string
  rechnungStrasse: string
  rechnungOrt: string
  rechnungEmail: string
  rechnungKundennr: string
}

export const leereAdresse = (): AdressWerte => ({
  rechnungEmpfaenger: '',
  rechnungStrasse: '',
  rechnungOrt: '',
  rechnungEmail: '',
  rechnungKundennr: '',
})

export const adresseAus = (z?: Partial<AdressFelder> | null): AdressWerte => ({
  rechnungEmpfaenger: z?.rechnungEmpfaenger ?? '',
  rechnungStrasse: z?.rechnungStrasse ?? '',
  rechnungOrt: z?.rechnungOrt ?? '',
  rechnungEmail: z?.rechnungEmail ?? '',
  rechnungKundennr: z?.rechnungKundennr ?? '',
})

export default function RechnungsadresseFelder({
  wert,
  onChange,
}: {
  wert: AdressWerte
  onChange: (w: AdressWerte) => void
}) {
  const set = (k: keyof AdressWerte) => (v: string) => onChange({ ...wert, [k]: v })
  return (
    <div className="adress-block">
      <Feld label="Empfänger" wert={wert.rechnungEmpfaenger} onChange={set('rechnungEmpfaenger')} />
      <Feld label="Straße + Hausnummer" wert={wert.rechnungStrasse} onChange={set('rechnungStrasse')} />
      <Feld label="PLZ + Stadt" wert={wert.rechnungOrt} onChange={set('rechnungOrt')} />
      <div className="zeile2">
        <Feld label="E-Mail (für Rechnungsversand)" typ="email" wert={wert.rechnungEmail} onChange={set('rechnungEmail')} />
        <Feld label="Kundennummer (auf der Rechnung)" wert={wert.rechnungKundennr} onChange={set('rechnungKundennr')} />
      </div>
    </div>
  )
}

// Einzeilige Kurzfassung für Listen ("Name, Straße, Ort").
export function adresseKurz(a: Partial<AdressFelder> | null | undefined): string {
  return [a?.rechnungEmpfaenger, a?.rechnungStrasse, a?.rechnungOrt].filter(Boolean).join(', ')
}
