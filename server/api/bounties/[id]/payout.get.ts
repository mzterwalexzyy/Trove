import { verifyPayout } from '../../../utils/escrow'

/**
 * Polled by the client after a payout is broadcast. Safe to call repeatedly:
 * it only reads the chain and settles the bounty once.
 */
export default defineEventHandler(async (event) => {
  const bountyId = getRouterParam(event, 'id')!
  const verification = await verifyPayout(bountyId)
  const config = useRuntimeConfig()

  return {
    ...verification,
    explorerUrl: 'txHash' in verification && verification.txHash
      ? `${config.public.explorerBase}/${verification.txHash}`
      : null,
  }
})
