import { desc, eq, sql } from 'drizzle-orm'
import { bounties, payouts, submissions, transactions, useDb, users } from '../db'
import { lunaToNim } from '../utils/nimiq'
import { getAddress } from '../utils/session'

export default defineEventHandler(async (event) => {
  const address = await getAddress(event)
  if (!address) return { address: null }

  const db = useDb()
  const config = useRuntimeConfig()
  const explorer = (hash?: string | null) => hash ? `${config.public.explorerBase}/${hash}` : null

  const created = await db.select().from(bounties)
    .where(eq(bounties.creatorAddress, address))
    .orderBy(desc(bounties.createdAt))

  const entered = await db.select({
    bountyId: submissions.bountyId,
    submissionStatus: submissions.status,
    submittedAt: submissions.createdAt,
    title: bounties.title,
    rewardLuna: bounties.rewardLuna,
    fundedLuna: bounties.fundedLuna,
    bountyStatus: bounties.status,
    deadlineAt: bounties.deadlineAt,
  })
    .from(submissions)
    .innerJoin(bounties, eq(submissions.bountyId, bounties.id))
    .where(eq(submissions.participantAddress, address))
    .orderBy(desc(submissions.createdAt))

  const won = await db.select({
    bountyId: payouts.bountyId,
    amountLuna: payouts.amountLuna,
    status: payouts.status,
    txHash: payouts.txHash,
    title: bounties.title,
  })
    .from(payouts)
    .innerJoin(bounties, eq(payouts.bountyId, bounties.id))
    .where(eq(payouts.winnerAddress, address))

  const earned = won
    .filter(w => w.status === 'verified')
    .reduce((total, w) => total + w.amountLuna, 0)

  const fundedTotal = await db.select({
    total: sql<number>`coalesce(sum(${bounties.fundedLuna}), 0)`,
  })
    .from(bounties)
    .where(eq(bounties.creatorAddress, address))

  const history = await db.select().from(transactions)
    .where(eq(transactions.fromAddress, address))
    .orderBy(desc(transactions.createdAt))
    .limit(25)

  const me = await db.query.users.findFirst({ where: eq(users.address, address) })
  const COOLDOWN_SECONDS = 14 * 86400

  return {
    address,
    // Self-declared, never verified. Named so no client can mistake it.
    handles: {
      xHandle: me?.xHandle ?? null,
      githubHandle: me?.githubHandle ?? null,
      changedAt: me?.handlesChangedAt ?? null,
      nextChangeAt: me?.handlesChangedAt ? me.handlesChangedAt + COOLDOWN_SECONDS : null,
    },
    stats: {
      bountiesCreated: created.length,
      bountiesFunded: created.filter(b => b.fundedLuna > 0).length,
      submissionsMade: entered.length,
      bountiesWon: won.filter(w => w.status === 'verified').length,
      earnedNim: lunaToNim(earned),
      fundedNim: lunaToNim(fundedTotal[0]?.total ?? 0),
    },
    created: created.map(b => ({
      ...b,
      rewardNim: lunaToNim(b.rewardLuna),
      fundedNim: lunaToNim(b.fundedLuna),
      verified: Boolean(b.fundingTxHash),
      fundingExplorerUrl: explorer(b.fundingTxHash),
    })),
    entered: entered.map(e => ({
      ...e,
      rewardNim: lunaToNim(e.rewardLuna),
      fundedNim: lunaToNim(e.fundedLuna),
    })),
    won: won.map(w => ({
      ...w,
      amountNim: lunaToNim(w.amountLuna),
      explorerUrl: explorer(w.txHash),
    })),
    history: history.map(t => ({
      ...t,
      valueNim: lunaToNim(t.valueLuna),
      explorerUrl: explorer(t.txHash),
    })),
  }
})
