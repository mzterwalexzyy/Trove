import { getEscrowAddress } from '../../utils/escrow'
import {
  addressesMatch,
  decodeMemo,
  fetchTransaction,
  lunaToNim,
  resolveOriginator,
} from '../../utils/nimiq'

/**
 * Independently confirms a funding transaction against the Nimiq testnet.
 *
 * This is the "Proof of Reward" check. A wallet-returned hash only tells us a
 * transaction was submitted; it says nothing about whether it landed, for how
 * much, or to whom. Nothing is treated as funded until this passes.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<{
    txHash?: string
    expectedFrom?: string
    expectedAmountLuna?: number
    expectedMemo?: string
  }>(event)

  if (!body?.txHash) {
    throw createError({ statusCode: 400, statusMessage: 'txHash is required' })
  }

  const config = useRuntimeConfig()
  const tx = await fetchTransaction(body.txHash)

  if (!tx) {
    return { status: 'pending', reason: 'transaction not yet visible on chain', tx: null, checks: null }
  }

  const memo = decodeMemo(tx.data)
  const originator = await resolveOriginator(tx)

  // `senderMatches` is reported but never gates the result. Nimiq Pay spends
  // from contract accounts, so the raw sender is frequently not the user's own
  // address; see resolveOriginator.
  const checks = {
    recipientIsEscrow: addressesMatch(tx.to, await getEscrowAddress()),
    amountMatches: body.expectedAmountLuna != null ? tx.value === body.expectedAmountLuna : null,
    memoMatches: body.expectedMemo ? memo === body.expectedMemo : null,
    included: tx.blockNumber > 0,
  }
  const senderMatches = body.expectedFrom ? addressesMatch(originator, body.expectedFrom) : null

  const failed = Object.entries(checks)
    .filter(([, result]) => result === false)
    .map(([name]) => name)

  return {
    status: failed.length === 0 ? 'verified' : 'rejected',
    failedChecks: failed,
    checks,
    senderMatches,
    originator,
    memo,
    tx: {
      ...tx,
      valueNim: lunaToNim(tx.value),
      explorerUrl: `${config.public.explorerBase}/${tx.hash}`,
    },
  }
})
