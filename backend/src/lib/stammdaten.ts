import { and, lte, or, gte, isNull, eq, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { firmaStammdaten } from '../db/schema.js'

// Alle Stammdaten-Feldnamen, die im System verwendet werden.
export const STAMMDATEN_FELDER = [
  'firmenname',
  'firmenadresse',
  'telefon',
  'mobil',
  'telefax',
  'email',
  'steuernummer',
  'ust_idnr',
  'standard_stundensatz',
  'mwst_satz',
  'bank_kontoinhaber',
  'bank_iban',
  'bank_bic',
  'bank_name',
  'zahlungshinweis',
  'logo_pfad',
] as const

export type StammdatenFeld = (typeof STAMMDATEN_FELDER)[number]
export type Stammwerte = Record<string, string>

// Liefert für ein Datum (YYYY-MM-DD) alle gültigen Stammwerte als Objekt.
// Gültig = gueltig_von <= datum UND (gueltig_bis IS NULL ODER gueltig_bis >= datum).
export async function holeStammwerte(datum: string): Promise<Stammwerte> {
  const zeilen = await db
    .select({
      feldName: firmaStammdaten.feldName,
      wert: firmaStammdaten.wert,
      gueltigVon: firmaStammdaten.gueltigVon,
    })
    .from(firmaStammdaten)
    .where(
      and(
        lte(firmaStammdaten.gueltigVon, datum),
        or(
          isNull(firmaStammdaten.gueltigBis),
          gte(firmaStammdaten.gueltigBis, datum),
        ),
      ),
    )
    .orderBy(desc(firmaStammdaten.gueltigVon))

  // Bei mehreren passenden Einträgen gewinnt der mit dem jüngsten gueltig_von.
  const werte: Stammwerte = {}
  for (const z of zeilen) {
    if (!(z.feldName in werte)) werte[z.feldName] = z.wert
  }
  return werte
}

// Komplette Historie eines Feldes (neueste zuerst).
export function holeHistorie(feldName: string) {
  return db
    .select()
    .from(firmaStammdaten)
    .where(eq(firmaStammdaten.feldName, feldName))
    .orderBy(desc(firmaStammdaten.gueltigVon))
}
