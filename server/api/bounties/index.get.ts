import { and, desc, eq, gt, like, or, sql } from 'drizzle-orm'
import { bounties, submissions, useDb } from '../../db'
import { lunaToNim } from '../../utils/nimiq'

/**
 * Public bounty feed. Only funded bounties are listed: an unfunded bounty is
 * not an opportunity, it is an intention.
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search = String(query.q ?? '').trim()
  const category = String(query.category ?? '').trim()
  const sort = String(query.sort ?? 'newest')
  const now = Math.floor(Date.now() / 1000)

  const db = useDb()
  const filters = [eq(bounties.status, 'active'), gt(bounties.deadlineAt, now)]

  if (category) filters.push(eq(bounties.category, category))
  if (search) {
    filters.push(or(
      like(bounties.title, `%${search}%`),
      like(bounties.description, `%${search}%`),
    )!)
  }

  const order = {
    newest: desc(bounties.createdAt),
    reward: desc(bounties.fundedLuna),
    ending: bounties.deadlineAt,
  }[sort] ?? desc(bounties.createdAt)

  const rows = await db.select({
    id: bounties.id,
    title: bounties.title,
    category: bounties.category,
    rewardLuna: bounties.rewardLuna,
    fundedLuna: bounties.fundedLuna,
    deadlineAt: bounties.deadlineAt,
    status: bounties.status,
    creatorAddress: bounties.creatorAddress,
    fundingTxHash: bounties.fundingTxHash,
    submissionCount: sql<number>`(
      select count(*) from ${submissions} where ${submissions.bountyId} = ${bounties.id}
    )`,
  })
    .from(bounties)
    .where(and(...filters))
    .orderBy(order)
    .limit(60)

  return rows.map(row => ({
    ...row,
    rewardNim: lunaToNim(row.rewardLuna),
    fundedNim: lunaToNim(row.fundedLuna),
    verified: Boolean(row.fundingTxHash),
  }))
})
