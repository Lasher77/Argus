import bcrypt from 'bcryptjs'
import { db, pool } from './index.js'
import { users, kunden, materialKatalog, mwstSaetze } from './schema.js'

// Legt Beispieldaten zum Testen an. Idempotent: läuft nur, wenn die
// users-Tabelle noch leer ist, damit ein erneuter Aufruf nichts dupliziert.
async function seed() {
  const vorhandene = await db.select({ id: users.id }).from(users).limit(1)
  if (vorhandene.length > 0) {
    console.log('Seed übersprungen – es existieren bereits Nutzer.')
    return
  }

  const [chefHash, monteurHash, bueroHash] = await Promise.all([
    bcrypt.hash('Hampel', 10),
    bcrypt.hash('monteur', 10),
    bcrypt.hash('buero', 10),
  ])

  await db.insert(users).values([
    {
      name: 'Sirke',
      email: 'sirke@wits-berlin.org',
      passwortHash: chefHash,
      rolle: 'chef',
    },
    {
      name: 'Tom',
      email: 'tom@wits-berlin.org',
      passwortHash: monteurHash,
      rolle: 'monteur',
    },
    {
      name: 'Büro',
      email: 'buero@wits-berlin.org',
      passwortHash: bueroHash,
      rolle: 'buero',
    },
  ])

  await db.insert(kunden).values([
    {
      name: 'Müller GmbH',
      adresse: 'Hauptstraße 12, 10115 Berlin',
      telefon: '030 1234567',
      email: 'kontakt@mueller-gmbh.de',
    },
    {
      name: 'Familie Schmidt',
      adresse: 'Lindenweg 5, 12203 Berlin',
      telefon: '030 7654321',
    },
    {
      name: 'Bäckerei Krause',
      adresse: 'Marktplatz 3, 10178 Berlin',
      notiz: 'Zugang nur vormittags möglich.',
    },
  ])

  await db.insert(materialKatalog).values([
    { bezeichnung: 'Kupferrohr 15mm', einzelpreis: '8.50', einheit: 'Meter' },
    { bezeichnung: 'Dichtungsring', einzelpreis: '0.80', einheit: 'Stück' },
    { bezeichnung: 'Thermostatventil', einzelpreis: '24.90', einheit: 'Stück' },
    { bezeichnung: 'Silikon-Kartusche', einzelpreis: '6.50', einheit: 'Stück' },
    { bezeichnung: 'Lötzinn', einzelpreis: '14.00', einheit: 'kg' },
  ])

  // Aktueller MwSt-Satz, offen (kein Enddatum).
  await db.insert(mwstSaetze).values([
    { satz: '19.00', gueltigAb: '2020-01-01', gueltigBis: null },
  ])

  console.log('Seed abgeschlossen:')
  console.log('  Nutzer:')
  console.log('    Chef    sirke@wits-berlin.org / Hampel')
  console.log('    Monteur tom@wits-berlin.org   / monteur')
  console.log('    Büro    buero@wits-berlin.org / buero')
  console.log('  3 Kunden, 5 Material-Katalog-Einträge, MwSt 19 % angelegt.')
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed fehlgeschlagen:', err)
    process.exit(1)
  })
