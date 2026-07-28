import { and, eq, gt, sql } from 'drizzle-orm'
import { bounties, payouts, submissions, useDb } from '../db'
import { lunaToNim } from '../utils/nimiq'

/**
 * Headline numbers. Every one is derived from chain-verified state: paid-out
 * NIM counts only payouts we confirmed on chain, never merely broadcast ones.
 */
export default defineEventHandler(async () => {
  const db = useDb()
  const now = Math.floor(Date.now() / 1000)

  const [active] = await db.select({ count: sql<number>`count(*)` })
    .from(bounties)
    .where(and(eq(bounties.status, 'active'), gt(bounties.deadlineAt, now)))

  const [completed] = await db.select({ count: sql<number>`count(*)` })
    .from(bounties)
    .where(eq(bounties.status, 'completed'))

  const [paid] = await db.select({ total: sql<number>`coalesce(sum(${payouts.amountLuna}), 0)` })
    .from(payouts)
    .where(eq(payouts.status, 'verified'))

  const [hunters] = await db.select({
    count: sql<number>`count(distinct ${submissions.participantAddress})`,
  }).from(submissions)

  const [secured] = await db.select({ total: sql<number>`coalesce(sum(${bounties.fundedLuna}), 0)` })
    .from(bounties)
    .where(eq(bounties.status, 'active'))

  return {
    activeBounties: active?.count ?? 0,
    completed: completed?.count ?? 0,
    paidOutNim: lunaToNim(paid?.total ?? 0),
    hunters: hunters?.count ?? 0,
    securedNim: lunaToNim(secured?.total ?? 0),
  }
})
