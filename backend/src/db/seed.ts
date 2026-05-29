import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { db, pool } from './index.js'
import {
  users,
  kunden,
  materialKatalog,
  mwstSaetze,
  firmaStammdaten,
} from './schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOGO_DIR = process.env.LOGO_DIR ?? '/data/logos'

// Beispiel-Nutzer/Kunden/Material – läuft nur bei leerer users-Tabelle.
async function seedGrunddaten() {
  const vorhandene = await db.select({ id: users.id }).from(users).limit(1)
  if (vorhandene.length > 0) {
    console.log('Grunddaten übersprungen – es existieren bereits Nutzer.')
    return
  }

  const [chefHash, monteurHash, bueroHash] = await Promise.all([
    bcrypt.hash('Hampel', 10),
    bcrypt.hash('monteur', 10),
    bcrypt.hash('buero', 10),
  ])

  await db.insert(users).values([
    { name: 'Sirke', email: 'sirke@wits-berlin.org', passwortHash: chefHash, rolle: 'chef' },
    { name: 'Tom', email: 'tom@wits-berlin.org', passwortHash: monteurHash, rolle: 'monteur' },
    { name: 'Büro', email: 'buero@wits-berlin.org', passwortHash: bueroHash, rolle: 'buero' },
  ])

  await db.insert(kunden).values([
    { name: 'Müller GmbH', adresse: 'Hauptstraße 12, 10115 Berlin', telefon: '030 1234567', email: 'kontakt@mueller-gmbh.de' },
    { name: 'Familie Schmidt', adresse: 'Lindenweg 5, 12203 Berlin', telefon: '030 7654321' },
    { name: 'Bäckerei Krause', adresse: 'Marktplatz 3, 10178 Berlin', notiz: 'Zugang nur vormittags möglich.' },
  ])

  await db.insert(materialKatalog).values([
    { bezeichnung: 'Kupferrohr 15mm', einzelpreis: '8.50', einheit: 'Meter' },
    { bezeichnung: 'Dichtungsring', einzelpreis: '0.80', einheit: 'Stück' },
    { bezeichnung: 'Thermostatventil', einzelpreis: '24.90', einheit: 'Stück' },
    { bezeichnung: 'Silikon-Kartusche', einzelpreis: '6.50', einheit: 'Stück' },
    { bezeichnung: 'Lötzinn', einzelpreis: '14.00', einheit: 'kg' },
  ])

  await db.insert(mwstSaetze).values([
    { satz: '19.00', gueltigAb: '2020-01-01', gueltigBis: null },
  ])

  console.log('Grunddaten angelegt (3 Nutzer, 3 Kunden, 5 Materialien, MwSt 19 %).')
  console.log('    Chef    sirke@wits-berlin.org / Hampel')
  console.log('    Monteur tom@wits-berlin.org   / monteur')
  console.log('    Büro    buero@wits-berlin.org / buero')
}

// Firmen-Stammdaten – läuft nur, wenn noch keine vorhanden sind. Werte aus der
// Beispielvorlage; im Büro-Bereich später pflegbar.
async function seedStammdaten() {
  const vorhandene = await db
    .select({ id: firmaStammdaten.id })
    .from(firmaStammdaten)
    .limit(1)
  if (vorhandene.length > 0) {
    console.log('Stammdaten übersprungen – bereits vorhanden.')
    return
  }

  // Logo aus dem Image ins Volume kopieren.
  fs.mkdirSync(LOGO_DIR, { recursive: true })
  let logoPfad = ''
  const quelle = path.join(__dirname, '..', '..', 'assets', 'argus_logo.jpg')
  if (fs.existsSync(quelle)) {
    logoPfad = path.join(LOGO_DIR, 'argus_logo.jpg')
    fs.copyFileSync(quelle, logoPfad)
  }

  const von = '2020-01-01'
  const werte: Record<string, string> = {
    firmenname: 'Argus - Metallbau - S. Schellenberg',
    firmenadresse: 'Pohlstraße 11 - 10785 Berlin',
    telefon: '+49 30 36461564',
    mobil: '+49 172 7094698',
    telefax: '+49 30 38101150',
    email: 'argus.schellenberg@gmx.de',
    steuernummer: '34/508/00371',
    ust_idnr: '',
    standard_stundensatz: '60.00',
    mwst_satz: '19.00',
    bank_kontoinhaber: 'S. Schellenberg',
    bank_iban: 'DE00 0000 0000 0000 0000 00',
    bank_bic: 'BELADEBEXXX',
    bank_name: 'Berliner Sparkasse',
    zahlungshinweis:
      'Bitte überweisen Sie den Betrag innerhalb von 14 Tagen ohne Abzug auf das unten genannte Konto.',
    logo_pfad: logoPfad,
    mail_betreff_vorlage: 'Rechnung {rechnungsnummer}',
    mail_text_vorlage:
      'Sehr geehrte Damen und Herren,\n\nanbei senden wir Ihnen die Rechnung {rechnungsnummer} über {betrag}.\n\nMit freundlichen Grüßen\n{firmenname}',
    mail_hinweis_text:
      'Die Rechnung wurde heruntergeladen und der Mail-Client geöffnet. Bitte zieh die heruntergeladene PDF in die Mail, bevor du sie versendest.',
    mail_hinweis_aktiv: 'true',
  }

  await db.insert(firmaStammdaten).values(
    Object.entries(werte).map(([feldName, wert]) => ({
      feldName,
      wert,
      gueltigVon: von,
      gueltigBis: null,
    })),
  )

  console.log(`Firmen-Stammdaten angelegt (${Object.keys(werte).length} Felder).`)
}

// Falls Stammdaten schon vorhanden sind, aber einzelne (z. B. neu eingeführte
// Mail-Vorlagen-Felder) noch fehlen: gezielt nachziehen.
async function seedFehlendeStammdaten() {
  const vorhandene = await db
    .select({ feldName: firmaStammdaten.feldName })
    .from(firmaStammdaten)
  const bekannt = new Set(vorhandene.map((v) => v.feldName))
  const nachzieher: Record<string, string> = {
    mail_betreff_vorlage: 'Rechnung {rechnungsnummer}',
    mail_text_vorlage:
      'Sehr geehrte Damen und Herren,\n\nanbei senden wir Ihnen die Rechnung {rechnungsnummer} über {betrag}.\n\nMit freundlichen Grüßen\n{firmenname}',
    mail_hinweis_text:
      'Die Rechnung wurde heruntergeladen und der Mail-Client geöffnet. Bitte zieh die heruntergeladene PDF in die Mail, bevor du sie versendest.',
    mail_hinweis_aktiv: 'true',
  }
  const fehlt = Object.entries(nachzieher).filter(([k]) => !bekannt.has(k))
  if (fehlt.length === 0) return
  await db.insert(firmaStammdaten).values(
    fehlt.map(([feldName, wert]) => ({
      feldName,
      wert,
      gueltigVon: '2020-01-01',
      gueltigBis: null,
    })),
  )
  console.log(`Stammdaten nachgezogen: ${fehlt.map(([k]) => k).join(', ')}`)
}

async function seed() {
  await seedGrunddaten()
  await seedStammdaten()
  await seedFehlendeStammdaten()
  console.log('Seed abgeschlossen.')
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed fehlgeschlagen:', err)
    process.exit(1)
  })
