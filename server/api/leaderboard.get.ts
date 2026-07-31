import { desc, eq, sql } from 'drizzle-orm'
import { bounties, payouts, referralPayouts, useDb } from '../db'
import { lunaToNim } from '../utils/nimiq'

/**
 * Public leaderboards, derived only from chain-verified state.
 *
 * Every figure here comes from a payout or funding transaction we confirmed
 * against the RPC, never from one that was merely broadcast. A leaderboard
 * built on unverified intent would be the easiest place in the product to
 * quietly overstate activity.
 */
export default defineEventHandler(async () => {
  const db = useDb()

  const earners = await db.select({
    address: payouts.winnerAddress,
    totalLuna: sql<number>`sum(${payouts.amountLuna})`,
    wins: sql<number>`count(*)`,
  })
    .from(payouts)
    .where(eq(payouts.status, 'verified'))
    .groupBy(payouts.winnerAddress)
    .orderBy(desc(sql`sum(${payouts.amountLuna})`))
    .limit(10)

  const funders = await db.select({
    address: bounties.creatorAddress,
    totalLuna: sql<number>`sum(${bounties.fundedLuna})`,
    posted: sql<number>`count(*)`,
  })
    .from(bounties)
    .where(sql`${bounties.fundedLuna} > 0`)
    .groupBy(bounties.creatorAddress)
    .orderBy(desc(sql`sum(${bounties.fundedLuna})`))
    .limit(10)

  const referrers = await db.select({
    address: referralPayouts.referrerAddress,
    totalLuna: sql<number>`sum(${referralPayouts.amountLuna})`,
    referrals: sql<number>`count(*)`,
  })
    .from(referralPayouts)
    .where(eq(referralPayouts.status, 'verified'))
    .groupBy(referralPayouts.referrerAddress)
    .orderBy(desc(sql`sum(${referralPayouts.amountLuna})`))
    .limit(10)

  return {
    earners: earners.map(row => ({
      address: row.address,
      nim: lunaToNim(Number(row.totalLuna)),
      count: Number(row.wins),
    })),
    funders: funders.map(row => ({
      address: row.address,
      nim: lunaToNim(Number(row.totalLuna)),
      count: Number(row.posted),
    })),
    referrers: referrers.map(row => ({
      address: row.address,
      nim: lunaToNim(Number(row.totalLuna)),
      count: Number(row.referrals),
    })),
  }
})
