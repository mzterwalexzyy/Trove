import { verifyPayout, verifyReferralPayout } from '../../../utils/escrow'

/**
 * Polled by the client after a payout is broadcast. Safe to call repeatedly:
 * it only reads the chain and settles the bounty once.
 *
 * Both legs are checked. The bounty is not settled until each one it owes has
 * confirmed, so a half-settled payout stays visible and resumable rather than
 * looking finished.
 */
export default defineEventHandler(async (event) => {
  const bountyId = getRouterParam(event, 'id')!
  const config = useRuntimeConfig()

  // Sequential, not parallel: both call maybeCompleteBounty on success, and
  // running them together lets each miss the other's write and leave the
  // bounty un-completed.
  const verification = await verifyPayout(bountyId)
  const referral = await verifyReferralPayout(bountyId)

  const explorer = (v: { txHash?: string }) =>
    v.txHash ? `${config.public.explorerBase}/#${v.txHash}` : null

  return {
    ...verification,
    explorerUrl: explorer(verification),
    referral: referral.status === 'not_started'
      ? null
      : { ...referral, explorerUrl: explorer(referral) },
  }
})
