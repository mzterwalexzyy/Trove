import { eq } from 'drizzle-orm'
import { bounties, useDb } from '../../../db'
import { payReferrer, payWinner, verifyPayout, verifyReferralPayout } from '../../../utils/escrow'
import { addressesMatch, lunaToNim } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

/**
 * Executes the escrow payout. Creator-authorised, never automatic.
 *
 * Idempotency lives in payWinner and payReferrer: each claims a row keyed by
 * bounty id before any NIM moves, so a double tap or a retried request cannot
 * pay twice on either leg.
 *
 * When the winner was referred this sends two transactions. They are issued in
 * sequence rather than in parallel: both spend from the same escrow account,
 * and two concurrent sends would race on the same validity-start height and
 * balance check. The bounty only completes once both are confirmed.
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

  // The referral leg, if one is owed. `payReferrer` is a no-op returning
  // `skipped` when the winner was not referred, so this is safe to call
  // unconditionally.
  const referral = await payReferrer(bountyId)

  // A failed referral leg must not fail the request: the winner has already
  // been paid, and reporting an error here would invite a retry that the
  // claim rows would then reject. It is surfaced instead, and the bounty
  // stays open until both legs verify.
  const referralPaid = referral.ok && !('skipped' in referral)

  // One immediate check each; the client keeps polling the verify endpoint.
  const [verification, referralVerification] = await Promise.all([
    verifyPayout(bountyId),
    referralPaid ? verifyReferralPayout(bountyId) : Promise.resolve(null),
  ])

  const config = useRuntimeConfig()
  const explorer = (hash: string) => `${config.public.explorerBase}/${hash}`

  return {
    txHash: result.txHash,
    amountNim: lunaToNim(result.amountLuna),
    adopted: result.adopted,
    verification,
    explorerUrl: explorer(result.txHash),
    referral: referralPaid
      ? {
          txHash: (referral as { txHash: string }).txHash,
          amountNim: lunaToNim((referral as { amountLuna: number }).amountLuna),
          verification: referralVerification,
          explorerUrl: explorer((referral as { txHash: string }).txHash),
        }
      : null,
    referralError: referral.ok ? null : referral.reason,
  }
})
