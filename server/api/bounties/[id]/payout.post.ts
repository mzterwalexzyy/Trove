import { eq } from 'drizzle-orm'
import { bounties, useDb } from '../../../db'
import { payWinner, verifyPayout } from '../../../utils/escrow'
import { addressesMatch, lunaToNim } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

/**
 * Executes the escrow payout. Creator-authorised, never automatic.
 *
 * Idempotency lives in payWinner: the payout row is keyed by bounty id and
 * claimed before any NIM moves, so a double tap or a retried request cannot
 * pay twice.
 */
export default defineEventHandler(async (event) => {
  const address = await requireAddress(event)
  const bountyId = getRouterParam(event, 'id')!

  const bounty = await useDb().query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })
  if (!addressesMatch(bounty.creatorAddress, address)) {
    throw createError({ statusCode: 403, statusMessage: 'Only the creator can release the reward' })
  }

  const result = await payWinner(bountyId)
  if (!result.ok) {
    throw createError({ statusCode: 409, statusMessage: result.reason })
  }

  // Give it one immediate check; the client keeps polling the verify endpoint.
  const verification = await verifyPayout(bountyId)

  return {
    txHash: result.txHash,
    amountNim: lunaToNim(result.amountLuna),
    adopted: result.adopted,
    verification,
    explorerUrl: `${useRuntimeConfig().public.explorerBase}/${result.txHash}`,
  }
})
