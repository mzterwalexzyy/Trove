import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? 'file:./.data/nimiq-bounty.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
})
