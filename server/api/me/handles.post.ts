import { eq } from 'drizzle-orm'
import { useDb, users } from '../../db'
import { requireAddress } from '../../utils/session'

/**
 * Sets the wallet's X and GitHub handles.
 *
 * These are self-declared. Nothing here proves the wallet owner controls the
 * account, and the response says so, so no caller can present this as
 * verification.
 *
 * The cooldown is the whole point: a handle that cannot be changed for two
 * weeks is a commitment, where a free-form field is not. It applies to the
 * pair, not to each field, so a creator cannot reset the clock on one by
 * editing the other.
 */
const COOLDOWN_DAYS = 14
const COOLDOWN_SECONDS = COOLDOWN_DAYS * 86400

/** Platform rules, not ours: X allows 1-15 word characters, GitHub 1-39 with
 *  single internal hyphens. Rejecting junk here keeps profiles honest. */
const X_PATTERN = /^\w{1,15}$/
const GITHUB_PATTERN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/^@/, '')
  return trimmed.length ? trimmed : null
}

export default defineEventHandler(async (event) => {
  const address = await requireAddress(event)
  const body = await readBody<{ xHandle?: string | null, githubHandle?: string | null }>(event)

  const xHandle = clean(body?.xHandle)
  const githubHandle = clean(body?.githubHandle)

  if (xHandle && !X_PATTERN.test(xHandle)) {
    throw createError({ statusCode: 400, statusMessage: 'That is not a valid X username' })
  }
  if (githubHandle && !GITHUB_PATTERN.test(githubHandle)) {
    throw createError({ statusCode: 400, statusMessage: 'That is not a valid GitHub username' })
  }

  const db = useDb()
  const now = Math.floor(Date.now() / 1000)
  const me = await db.query.users.findFirst({ where: eq(users.address, address) })
  if (!me) throw createError({ statusCode: 404, statusMessage: 'Wallet not found' })

  const unchanged = me.xHandle === xHandle && me.githubHandle === githubHandle
  if (unchanged) return { xHandle, githubHandle, changedAt: me.handlesChangedAt, verified: false }

  // Only a real change is rate limited. Setting them for the first time is
  // free; so is re-saving the same values.
  const hadAny = Boolean(me.xHandle || me.githubHandle)
  if (hadAny && me.handlesChangedAt) {
    const elapsed = now - me.handlesChangedAt
    if (elapsed < COOLDOWN_SECONDS) {
      const daysLeft = Math.ceil((COOLDOWN_SECONDS - elapsed) / 86400)
      throw createError({
        statusCode: 429,
        statusMessage: `Handles can be changed once every ${COOLDOWN_DAYS} days. Try again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      })
    }
  }

  try {
    await db.update(users)
      .set({ xHandle, githubHandle, handlesChangedAt: now })
      .where(eq(users.address, address))
  }
  catch {
    // The unique indexes are the real guard; this is only the message.
    throw createError({
      statusCode: 409,
      statusMessage: 'One of those handles is already linked to another wallet',
    })
  }

  return {
    xHandle,
    githubHandle,
    changedAt: now,
    nextChangeAt: now + COOLDOWN_SECONDS,
    // Stated explicitly so no client can present this as proof of ownership.
    verified: false,
  }
})
