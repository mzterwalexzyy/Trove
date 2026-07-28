import { and, eq, ne } from 'drizzle-orm'
import { bounties, payouts, submissions, useDb } from '../../../db'
import { logEscrow } from '../../../utils/escrow'
import { addressesMatch, lunaToNim } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

/**
 * Selects a winner. Deliberately separate from paying them: the creator picks,
 * reviews the confirmation, and only then authorises the transfer. Nothing
 * automatic ever moves NIM.
 */
export default defineEventHandler(async (event) => {
  const address = await requireAddress(event)
  const bountyId = getRouterParam(event, 'id')!
  const body = await readBody<{ submissionId?: string }>(event)

  if (!body?.submissionId) {
    throw createError({ statusCode: 400, statusMessage: 'submissionId is required' })
  }

  const db = useDb()
  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })

  if (!addressesMatch(bounty.creatorAddress, address)) {
    throw createError({ statusCode: 403, statusMessage: 'Only the creator can select a winner' })
  }
  if (bounty.status === 'completed') {
    throw createError({ statusCode: 409, statusMessage: 'This bounty is already completed' })
  }
  if (bounty.fundedLuna <= 0) {
    throw createError({ statusCode: 409, statusMessage: 'This bounty is not funded' })
  }

  // Once a payout exists the winner is settled, whatever its status. Changing
  // it afterwards could point a retry at a different address.
  const existingPayout = await db.query.payouts.findFirst({ where: eq(payouts.bountyId, bountyId) })
  if (existingPayout) {
    throw createError({ statusCode: 409, statusMessage: 'A payout has already been started for this bounty' })
  }

  const submission = await db.query.submissions.findFirst({
    where: and(eq(submissions.id, body.submissionId), eq(submissions.bountyId, bountyId)),
  })
  if (!submission) throw createError({ statusCode: 404, statusMessage: 'Submission not found' })

  // Compare-and-set on the bounty row is the gate. Only the call that finds
  // the bounty still `active` gets to name a winner; parallel callers change
  // zero rows and stop here. Without this, concurrent requests could each set
  // a different winner, and the payout could pay whoever wrote last rather
  // than whoever the creator confirmed.
  const claimed = await db.update(bounties)
    .set({ status: 'payout_pending', winnerAddress: submission.participantAddress })
    .where(and(eq(bounties.id, bountyId), eq(bounties.status, 'active')))
    .returning({ id: bounties.id })

  if (!claimed.length) {
    const current = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
    // Re-sending the same choice is harmless; naming a different one is not.
    if (current?.winnerAddress && addressesMatch(current.winnerAddress, submission.participantAddress)) {
      return {
        winnerAddress: current.winnerAddress,
        amountNim: lunaToNim(Math.min(current.rewardLuna, current.fundedLuna)),
        status: current.status,
        alreadySelected: true,
      }
    }
    throw createError({
      statusCode: 409,
      statusMessage: 'A winner has already been selected for this bounty',
    })
  }

  // Only now, once this request owns the decision, label the submissions.
  await db.update(submissions)
    .set({ status: 'not_selected' })
    .where(and(eq(submissions.bountyId, bountyId), ne(submissions.id, submission.id)))

  await db.update(submissions)
    .set({ status: 'winner' })
    .where(eq(submissions.id, submission.id))

  await logEscrow({
    bountyId,
    event: 'winner.selected',
    detail: submission.participantAddress,
    amountLuna: Math.min(bounty.rewardLuna, bounty.fundedLuna),
  })

  return {
    winnerAddress: submission.participantAddress,
    amountNim: lunaToNim(Math.min(bounty.rewardLuna, bounty.fundedLuna)),
    status: 'payout_pending',
  }
})
