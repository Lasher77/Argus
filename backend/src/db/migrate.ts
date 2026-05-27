import path from 'node:path'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './index.js'

// Wendet alle noch nicht ausgeführten Migrationen aus dem Ordner ./drizzle an.
// Wird beim App-Start automatisch aufgerufen und ist idempotent.
export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })
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
