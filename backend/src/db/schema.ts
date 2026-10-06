import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  numeric,
  date,
  integer,
  jsonb,
  boolean,
} from 'drizzle-orm/pg-core'

// Rollen und Auftrags-Status als feste Aufzählungen (siehe CLAUDE.md).
export const rolleEnum = pgEnum('rolle', ['chef', 'monteur', 'buero'])
export const auftragStatusEnum = pgEnum('auftrag_status', [
  'neu',
  'geplant',
  'arbeit',
  'erledigt',
  'rechnung',
  'bezahlt',
  'berechnet',
])

// Rechnung ist ein eigenes Objekt mit eigenem Status.
export const rechnungStatusEnum = pgEnum('rechnung_status', [
  'offen',
  'bezahlt',
])

// Woher eine Einheit/ein Objekt seine Rechnungsadresse nimmt:
// eigene Angaben oder Verweis auf die übergeordnete Ebene.
export const rechnungQuelleEnum = pgEnum('rechnung_quelle', [
  'eigen',
  'objekt',
  'hausverwaltung',
])

// Rechnungsadress-Block: max. drei Adresszeilen (Empfänger, Straße + Hausnr.,
// PLZ + Stadt) plus optional E-Mail (für den Mail-Versand) und Kundennummer
// (erscheint auf der Rechnung). Leer = keine eigene Angabe.
const rechnungsadresse = () => ({
  rechnungEmpfaenger: text('rechnung_empfaenger'),
  rechnungStrasse: text('rechnung_strasse'),
  rechnungOrt: text('rechnung_ort'),
  rechnungEmail: text('rechnung_email'),
  rechnungKundennr: text('rechnung_kundennr'),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwortHash: text('passwort_hash').notNull(),
  rolle: rolleEnum('rolle').notNull(),
})

export const hausverwaltungen = pgTable('hausverwaltungen', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  notiz: text('notiz'),
  ...rechnungsadresse(),
  archiviert: boolean('archiviert').notNull().default(false),
})

// Ansprechpartner: gehören zu einer Hausverwaltung ODER stehen frei (z. B. ein
// freier Hausmeister) – hausverwaltung_id ist deshalb nullable.
export const ansprechpartner = pgTable('ansprechpartner', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  rolle: text('rolle'),
  telefon: text('telefon'),
  email: text('email'),
  notiz: text('notiz'),
  hausverwaltungId: uuid('hausverwaltung_id').references(
    () => hausverwaltungen.id,
  ),
  archiviert: boolean('archiviert').notNull().default(false),
})

// Objekt: Haus, Liegenschaft oder Standort – Ausgangspunkt für Aufträge.
export const objekte = pgTable('objekte', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  strasse: text('strasse'),
  hausnummer: text('hausnummer'),
  plz: text('plz'),
  ort: text('ort'),
  hausverwaltungId: uuid('hausverwaltung_id').references(
    () => hausverwaltungen.id,
  ),
  ansprechpartnerId: uuid('ansprechpartner_id').references(
    () => ansprechpartner.id,
  ),
  vorOrtName: text('vor_ort_name'),
  vorOrtTelefon: text('vor_ort_telefon'),
  vorOrtEmail: text('vor_ort_email'),
  rechnungQuelle: rechnungQuelleEnum('rechnung_quelle')
    .notNull()
    .default('hausverwaltung'),
  ...rechnungsadresse(),
  notiz: text('notiz'),
  archiviert: boolean('archiviert').notNull().default(false),
})

// Einheit: z. B. "Wohnung 1, 1. OG rechts". Kann eine andere Hausverwaltung,
// andere Ansprechpartner (u. a. Mieter vor Ort) und eine eigene
// Rechnungsadresse haben als das Objekt – muss aber nicht.
export const einheiten = pgTable('einheiten', {
  id: uuid('id').primaryKey().defaultRandom(),
  objektId: uuid('objekt_id')
    .notNull()
    .references(() => objekte.id),
  bezeichnung: text('bezeichnung').notNull(),
  hausverwaltungId: uuid('hausverwaltung_id').references(
    () => hausverwaltungen.id,
  ),
  ansprechpartnerId: uuid('ansprechpartner_id').references(
    () => ansprechpartner.id,
  ),
  vorOrtName: text('vor_ort_name'),
  vorOrtTelefon: text('vor_ort_telefon'),
  vorOrtEmail: text('vor_ort_email'),
  rechnungQuelle: rechnungQuelleEnum('rechnung_quelle')
    .notNull()
    .default('objekt'),
  ...rechnungsadresse(),
  notiz: text('notiz'),
  archiviert: boolean('archiviert').notNull().default(false),
})

export const auftraege = pgTable('auftraege', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Objektbezug (optional): Objekt und ggf. Einheit. Beide leer = freier Auftrag.
  objektId: uuid('objekt_id').references(() => objekte.id),
  einheitId: uuid('einheit_id').references(() => einheiten.id),
  // Nur bei freien Aufträgen: Freitext-Einsatzort (für den Kartenlink).
  einsatzort: text('einsatzort'),
  titel: text('titel').notNull(),
  beschreibung: text('beschreibung'),
  status: auftragStatusEnum('status').notNull().default('neu'),
  // monteur_id bleibt leer, bis der Chef den Auftrag zuweist.
  monteurId: uuid('monteur_id').references(() => users.id),
  termin: timestamp('termin', { withTimezone: true }),
  // Standard-Stundensatz wird beim Anlegen aus den Einstellungen übernommen,
  // ist aber pro Auftrag überschreibbar.
  stundensatz: numeric('stundensatz', { precision: 10, scale: 2 }),
  stunden: numeric('stunden', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true })
    .notNull()
    .defaultNow(),
  erledigtAm: timestamp('erledigt_am', { withTimezone: true }),
})

export const auftragMaterial = pgTable('auftrag_material', {
  id: uuid('id').primaryKey().defaultRandom(),
  auftragId: uuid('auftrag_id')
    .notNull()
    .references(() => auftraege.id, { onDelete: 'cascade' }),
  bezeichnung: text('bezeichnung').notNull(),
  einzelpreis: numeric('einzelpreis', { precision: 10, scale: 2 }).notNull(),
  menge: numeric('menge', { precision: 10, scale: 2 }).notNull().default('1'),
  einheit: text('einheit').notNull().default('Stück'),
})

export const materialKatalog = pgTable('material_katalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  bezeichnung: text('bezeichnung').notNull(),
  einzelpreis: numeric('einzelpreis', { precision: 10, scale: 2 }).notNull(),
  einheit: text('einheit').notNull().default('Stück'),
})

export const fotos = pgTable('fotos', {
  id: uuid('id').primaryKey().defaultRandom(),
  auftragId: uuid('auftrag_id')
    .notNull()
    .references(() => auftraege.id, { onDelete: 'cascade' }),
  pfad: text('pfad').notNull(),
  hochgeladenAm: timestamp('hochgeladen_am', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Konfigurierbarer MwSt-Satz mit Gültigkeitszeitraum: eine künftige Änderung
// wird datiert hinterlegt, ohne alte Rechnungen zu verfälschen.
export const mwstSaetze = pgTable('mwst_saetze', {
  id: uuid('id').primaryKey().defaultRandom(),
  satz: numeric('satz', { precision: 5, scale: 2 }).notNull(),
  gueltigAb: date('gueltig_ab').notNull(),
  gueltigBis: date('gueltig_bis'),
})

// Datierte Firmen-Stammdaten: pro feld_name beliebig viele Werte mit
// Gültigkeitszeitraum. Für eine Rechnung wird der zum Rechnungsdatum gültige
// Wert herangezogen (gueltig_von <= datum < oder = gueltig_bis bzw. offen).
export const firmaStammdaten = pgTable('firma_stammdaten', {
  id: uuid('id').primaryKey().defaultRandom(),
  feldName: text('feld_name').notNull(),
  wert: text('wert').notNull(),
  gueltigVon: date('gueltig_von').notNull(),
  gueltigBis: date('gueltig_bis'),
})

// Erstellte Rechnungen. Die zum Zeitpunkt der Erstellung verwendeten Werte
// (Firma, Kunde, Positionen, Beträge) werden als Snapshot gespeichert, damit
// sich eine Rechnung nachträglich nicht mehr ändert.
export const rechnungen = pgTable('rechnungen', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Optional: bei auftragsbasierter Rechnung gesetzt, bei freier Rechnung leer.
  auftragId: uuid('auftrag_id').references(() => auftraege.id),
  // Objektbezug (optional) – nur zur Orientierung, die Wahrheit ist der Snapshot.
  objektId: uuid('objekt_id').references(() => objekte.id),
  einheitId: uuid('einheit_id').references(() => einheiten.id),
  nummer: text('nummer').notNull().unique(),
  jahr: integer('jahr').notNull(),
  laufendeNr: integer('laufende_nr').notNull(),
  datum: date('datum').notNull(),
  leistungsdatum: date('leistungsdatum'),
  status: rechnungStatusEnum('status').notNull().default('offen'),
  bezahltAm: timestamp('bezahlt_am', { withTimezone: true }),
  objekt: text('objekt'),
  beschreibung: text('beschreibung'),
  firmaSnapshot: jsonb('firma_snapshot').notNull(),
  // Rechnungsempfänger zum Erstellungszeitpunkt (5 Block-Felder + Herkunft).
  empfaengerSnapshot: jsonb('empfaenger_snapshot').notNull(),
  positionen: jsonb('positionen').notNull(),
  netto: numeric('netto', { precision: 12, scale: 2 }).notNull(),
  mwstSatz: numeric('mwst_satz', { precision: 5, scale: 2 }).notNull(),
  mwstBetrag: numeric('mwst_betrag', { precision: 12, scale: 2 }).notNull(),
  brutto: numeric('brutto', { precision: 12, scale: 2 }).notNull(),
  pdfPfad: text('pdf_pfad').notNull(),
  erstelltAm: timestamp('erstellt_am', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Lückenloser, jahresweiser Rechnungsnummern-Zähler. Wird beim Erstellen einer
// Rechnung in einer Transaktion mit Zeilensperre hochgezählt.
export const rechnungZaehler = pgTable('rechnung_zaehler', {
  jahr: integer('jahr').primaryKey(),
  letzteNr: integer('letzte_nr').notNull().default(0),
})
