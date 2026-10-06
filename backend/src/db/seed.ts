import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import { db, pool } from './index.js'
import {
  users,
  hausverwaltungen,
  ansprechpartner,
  objekte,
  einheiten,
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

  console.log('Grunddaten angelegt (3 Nutzer, 5 Materialien, MwSt 19 %).')
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

// Demo-Objekte zum Ausprobieren (Hausverwaltungen mit Ansprechpartnern, Objekte
// mit Einheiten). Läuft nur, solange noch keine Objekte/Hausverwaltungen existieren.
async function seedObjekte() {
  const vorhanden = await db.select({ id: objekte.id }).from(objekte).limit(1)
  const vorhandenHv = await db.select({ id: hausverwaltungen.id }).from(hausverwaltungen).limit(1)
  if (vorhanden.length > 0 || vorhandenHv.length > 0) {
    console.log('Demo-Objekte übersprungen – bereits vorhanden.')
    return
  }

  const [hvMeier, hvNord] = await db
    .insert(hausverwaltungen)
    .values([
      {
        name: 'Hausverwaltung Meier GmbH',
        rechnungEmpfaenger: 'Hausverwaltung Meier GmbH',
        rechnungStrasse: 'Marktstraße 1',
        rechnungOrt: '10115 Berlin',
        rechnungEmail: 'rechnungen@hv-meier.example',
        rechnungKundennr: 'L-4711',
      },
      {
        name: 'Nord Immobilien KG',
        rechnungEmpfaenger: 'Nord Immobilien KG',
        rechnungStrasse: 'Seestraße 22',
        rechnungOrt: '13353 Berlin',
        rechnungEmail: 'buchhaltung@nord-immo.example',
      },
    ])
    .returning()

  const [apSchmidt, apKoch] = await db
    .insert(ansprechpartner)
    .values([
      { name: 'Frau Schmidt', rolle: 'Objektbetreuung', telefon: '030 111111', email: 'schmidt@hv-meier.example', hausverwaltungId: hvMeier.id },
      { name: 'Herr Koch', rolle: 'Technik', telefon: '030 222222', email: 'koch@hv-meier.example', hausverwaltungId: hvMeier.id },
    ])
    .returning()
  await db.insert(ansprechpartner).values([
    { name: 'Herr Lehmann', rolle: 'Hausmeister', telefon: '0171 3334445' },
    { name: 'Frau Berger', rolle: 'Verwaltung', telefon: '030 555555', hausverwaltungId: hvNord.id },
  ])

  const [pohl, see] = await db
    .insert(objekte)
    .values([
      {
        name: 'Wohnhaus Pohlstraße 11',
        strasse: 'Pohlstraße', hausnummer: '11', plz: '10785', ort: 'Berlin',
        hausverwaltungId: hvMeier.id,
        ansprechpartnerId: apSchmidt.id,
        vorOrtName: 'Herr Lehmann (Hausmeister)', vorOrtTelefon: '0171 3334445',
        rechnungQuelle: 'hausverwaltung',
      },
      {
        name: 'Bürogebäude Seestraße 22',
        strasse: 'Seestraße', hausnummer: '22', plz: '13353', ort: 'Berlin',
        hausverwaltungId: hvNord.id,
        rechnungQuelle: 'eigen',
        rechnungEmpfaenger: 'Seestraße 22 Verwaltungs-GmbH',
        rechnungStrasse: 'Seestraße 22',
        rechnungOrt: '13353 Berlin',
      },
      {
        name: 'Bäckerei Krause (Einfamilienhaus)',
        strasse: 'Marktplatz', hausnummer: '3', plz: '10178', ort: 'Berlin',
        rechnungQuelle: 'eigen',
        rechnungEmpfaenger: 'Bäckerei Krause',
        rechnungStrasse: 'Marktplatz 3',
        rechnungOrt: '10178 Berlin',
        rechnungEmail: 'krause@baeckerei.example',
      },
    ])
    .returning()

  await db.insert(einheiten).values([
    { objektId: pohl.id, bezeichnung: 'Wohnung 1, 1. OG rechts', vorOrtName: 'Familie Yilmaz (Mieter)', vorOrtTelefon: '0176 1234567', rechnungQuelle: 'objekt' },
    {
      objektId: pohl.id, bezeichnung: 'Wohnung 2, 1. OG links',
      hausverwaltungId: hvNord.id,
      vorOrtName: 'Frau Weber (Mieterin)', vorOrtTelefon: '0152 7654321',
      rechnungQuelle: 'hausverwaltung',
    },
    {
      objektId: pohl.id, bezeichnung: 'Gewerbe EG',
      ansprechpartnerId: apKoch.id,
      rechnungQuelle: 'eigen',
      rechnungEmpfaenger: 'Gewerbe EG Betriebs-GmbH', rechnungStrasse: 'Pohlstraße 11', rechnungOrt: '10785 Berlin',
    },
    { objektId: see.id, bezeichnung: 'Büro 3. OG', rechnungQuelle: 'objekt' },
  ])

  console.log('Demo-Objekte angelegt (2 Hausverwaltungen, 4 Ansprechpartner, 3 Objekte, 4 Einheiten).')
}

async function seed() {
  await seedGrunddaten()
  await seedStammdaten()
  await seedFehlendeStammdaten()
  await seedObjekte()
  console.log('Seed abgeschlossen.')
}

seed()
  .then(() => pool.end())
  .catch((err) => {
    console.error('Seed fehlgeschlagen:', err)
    process.exit(1)
  })
