import { randomBytes } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { authNonces, useDb } from '../db'
import { normalizeAddress } from './nimiq'

const TTL_SECONDS = 5 * 60

export async function issueNonce(address: string): Promise<string> {
  const db = useDb()
  const now = Math.floor(Date.now() / 1000)
  await db.delete(authNonces).where(lt(authNonces.expiresAt, now))

  const nonce = randomBytes(16).toString('hex')
  await db.insert(authNonces).values({
    nonce,
    address: normalizeAddress(address),
    used: 0,
    expiresAt: now + TTL_SECONDS,
  })
  return nonce
}

/**
 * Consumes a nonce. Returns false when it is unknown, expired, already used,
 * or was issued to a different address. Marking it used before the signature
 * is checked means a failed attempt cannot be retried against the same
 * challenge.
 */
export async function consumeNonce(nonce: string, address: string): Promise<boolean> {
  const db = useDb()
  const now = Math.floor(Date.now() / 1000)

  const result = await db.update(authNonces)
    .set({ used: 1 })
    .where(and(
      eq(authNonces.nonce, nonce),
      eq(authNonces.address, normalizeAddress(address)),
      eq(authNonces.used, 0),
    ))
    .returning({ expiresAt: authNonces.expiresAt })

  const row = result[0]
  if (!row) return false
  return row.expiresAt >= now
}

export function nonceMessage(nonce: string): string {
  return `Nimiq Bounty login\nnonce: ${nonce}`
}
