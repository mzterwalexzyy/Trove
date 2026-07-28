import { eq } from 'drizzle-orm'
import { bounties, payouts, submissions, useDb } from '../../../db'
import { addressesMatch, lunaToNim } from '../../../utils/nimiq'
import { getAddress } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const viewer = await getAddress(event)
  const db = useDb()
  const config = useRuntimeConfig()

  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, id) })
  if (!bounty) throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })

  const isCreator = viewer ? addressesMatch(bounty.creatorAddress, viewer) : false

  // An unfunded bounty is only visible to the person who created it.
  if (bounty.status === 'awaiting_funding' && !isCreator) {
    throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })
  }

  const all = await db.select().from(submissions).where(eq(submissions.bountyId, id))

  // Hunters see their own submission and the winner's, never their rivals'.
  const visible = isCreator
    ? all
    : all.filter(s =>
        (viewer && addressesMatch(s.participantAddress, viewer)) || s.status === 'winner')

  const payout = await db.query.payouts.findFirst({ where: eq(payouts.bountyId, id) })
  const explorer = (hash?: string | null) => hash ? `${config.public.explorerBase}/${hash}` : null

  return {
    ...bounty,
    rewardNim: lunaToNim(bounty.rewardLuna),
    fundedNim: lunaToNim(bounty.fundedLuna),
    verified: Boolean(bounty.fundingTxHash),
    fundingExplorerUrl: explorer(bounty.fundingTxHash),
    isCreator,
    viewer,
    submissionCount: all.length,
    submissions: visible.map(s => ({ ...s, isMine: viewer ? addressesMatch(s.participantAddress, viewer) : false })),
    mySubmission: viewer
      ? all.find(s => addressesMatch(s.participantAddress, viewer)) ?? null
      : null,
    payout: payout
      ? {
          status: payout.status,
          amountNim: lunaToNim(payout.amountLuna),
          txHash: payout.txHash,
          explorerUrl: explorer(payout.txHash),
          winnerAddress: payout.winnerAddress,
          verifiedAt: payout.verifiedAt,
        }
      : null,
  }
})
