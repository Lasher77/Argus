import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { sql } from 'drizzle-orm'
import { db, pool } from './index.js'

// Idempotente Datenmigration: führt das Rechnungs-/Auftragsmodell aus Nachtrag 2
// von altem Schema (Auftrag.status = rechnung/bezahlt) auf neues Schema
// (eigene rechnungen.status-Spalte; Auftrag endet auf 'berechnet') über.
// Läuft NACH dem Schema-migrate(), damit der Enum-Wert 'berechnet' committed
// und benutzbar ist.
async function migriereRechnungenStatus() {
  // 1) Rechnungen, deren Auftrag noch im alten Status 'bezahlt' steht, in der
  //    neuen rechnungen.status-Spalte als 'bezahlt' markieren.
  await db.execute(sql`
    UPDATE rechnungen r
       SET status = 'bezahlt', bezahlt_am = NOW()
      FROM auftraege a
     WHERE r.auftrag_id = a.id
       AND a.status::text = 'bezahlt'
       AND r.status = 'offen'
  `)
  // 2) Auftrag selbst auf neuen Endstatus 'berechnet' setzen.
  await db.execute(sql`
    UPDATE auftraege
       SET status = 'berechnet'
     WHERE status::text IN ('rechnung', 'bezahlt')
  `)
}

// Wendet alle noch nicht ausgeführten Migrationen aus dem Ordner ./drizzle an.
// Wird beim App-Start automatisch aufgerufen und ist idempotent.
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
  await migriereRechnungenStatus()
}

// Direkter Aufruf: `npm run db:migrate` bzw. `node dist/db/migrate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('Migrationen ausgeführt.')
      return pool.end()
    })
    .catch((err) => {
      console.error('Migration fehlgeschlagen:', err)
      process.exit(1)
    })
}
