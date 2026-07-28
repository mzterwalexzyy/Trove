import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export * from './schema'

let instance: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Local dev uses a file-backed SQLite database so there is nothing to sign up
 * for. Production sets TURSO_DATABASE_URL (libsql over HTTP), which works on
 * serverless where a local file would not persist.
 */
export function useDb() {
  if (!instance) {
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL ?? 'file:./.data/nimiq-bounty.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    instance = drizzle(client, { schema })
  }
  return instance
}
