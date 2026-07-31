/**
 * Applies a migration SQL file directly to the runtime database.
 *
 * The base tables were created with `drizzle-kit push`, so the migrations
 * bookkeeping table is empty and `drizzle-kit migrate` is a no-op here. This
 * splits on the statement breakpoint and runs each statement, skipping ones
 * that are already applied so a rerun is harmless.
 *
 * Usage: node scripts/apply-migration.mjs server/db/migrations/0003_x.sql
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { createClient } from '@libsql/client'

const file = process.argv[2]
if (!file) {
  console.error('Pass the migration file to apply.')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
    }),
)

const db = createClient({
  url: env.TURSO_DATABASE_URL || 'file:./.data/nimiq-bounty.db',
  authToken: env.TURSO_AUTH_TOKEN || undefined,
})

const statements = readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map(s => s.trim())
  .filter(Boolean)

console.log(`applying ${statements.length} statement(s) from ${file}`)

for (const statement of statements) {
  try {
    await db.execute(statement)
    console.log(`  ok    ${statement.split('\n')[0].slice(0, 70)}`)
  }
  catch (error) {
    const message = String(error.message ?? error)
    // Rerunning a migration should be a no-op, not a failure.
    if (/duplicate column|already exists/i.test(message)) {
      console.log(`  skip  ${statement.split('\n')[0].slice(0, 60)} (already applied)`)
      continue
    }
    console.error(`  FAIL  ${statement.split('\n')[0].slice(0, 60)}`)
    console.error(`        ${message}`)
    process.exit(1)
  }
}

console.log('done')
