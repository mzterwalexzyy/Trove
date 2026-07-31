import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { bounties, transactions, useDb } from '../../../db'
import { fundingMemo, logEscrow } from '../../../utils/escrow'
import { addressesMatch, decodeMemo, fetchTransaction, lunaToNim, resolveOriginator } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

/**
 * Records a funding transaction and confirms it against the chain.
 *
 * This is the Proof of Reward gate. The wallet-returned hash is only a claim;
 * the bounty stays unpublished until the RPC confirms the transfer landed, hit
 * the escrow address, carried this bounty's memo, and covered the reward.
 *
 * The ledger row is keyed by tx_hash and upserted rather than inserted. An
 * earlier version inserted on every call, so the `pending` row written on the
 * first attempt collided with its own unique index once the transaction
 * confirmed, and the bounty could never be activated.
 */
export default defineEventHandler(async (event) => {
  const address = await requireAddress(event)
  const bountyId = getRouterParam(event, 'id')!
  const body = await readBody<{ txHash?: string }>(event)

  if (!body?.txHash) {
    throw createError({ statusCode: 400, statusMessage: 'txHash is required' })
  }

  const db = useDb()
  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })

  if (!addressesMatch(bounty.creatorAddress, address)) {
    throw createError({ statusCode: 403, statusMessage: 'Only the creator can fund this bounty' })
  }
  if (bounty.status === 'active' || bounty.fundedLuna > 0) {
    return { status: 'already_funded', bountyId, fundedLuna: bounty.fundedLuna }
  }

  // One transaction can only ever back one bounty.
  const existing = await db.query.transactions.findFirst({
    where: eq(transactions.txHash, body.txHash),
  })
  if (existing && existing.bountyId !== bountyId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'That transaction has already been credited to another bounty',
    })
  }

  /**
   * Writes the ledger row as a single atomic upsert.
   *
   * Read-then-insert raced: parallel calls both saw no existing row, both
   * inserted, and the losers died on the unique index with a 500. The upsert
   * collapses that to one statement. `setWhere` keeps the row pinned to this
   * bounty, so a hash belonging to another bounty is never overwritten.
   */
  async function record(values: Partial<typeof transactions.$inferInsert>) {
    await db.insert(transactions)
      .values({
        id: randomUUID(),
        txHash: body!.txHash!,
        bountyId,
        type: 'fund',
        fromAddress: address,
        toAddress: bounty!.escrowAddress,
        valueLuna: 0,
        memo: fundingMemo(bountyId),
        status: 'pending',
        ...values,
      })
      .onConflictDoUpdate({
        target: transactions.txHash,
        set: values,
        setWhere: eq(transactions.bountyId, bountyId),
      })
  }

  const tx = await fetchTransaction(body.txHash)
  if (!tx) {
    // Record the attempt so a refresh can resume the check, but publish nothing.
    await record({ status: 'pending' })
    return { status: 'pending', bountyId, reason: 'Transaction not yet visible on chain' }
  }

  const memo = decodeMemo(tx.data)

  // The sender is deliberately not a gate. Nimiq Pay spends from contract
  // accounts (testnet faucet funds sit in an HTLC), so `tx.from` is often not
  // the user's own address. What makes the funding trustworthy is that the
  // money reached escrow, carried this bounty's memo, and covers the reward.
  // Anyone may fund a bounty; nobody can redirect where it pays out.
  const originator = await resolveOriginator(tx)

  const problems: string[] = []
  if (!addressesMatch(tx.to, bounty.escrowAddress)) problems.push('recipient is not the escrow address')
  if (memo !== fundingMemo(bountyId)) problems.push('memo does not match this bounty')
  if (tx.value < bounty.rewardLuna) problems.push('amount is less than the promised reward')
  if (tx.blockNumber <= 0) problems.push('transaction is not yet in a block')

  if (problems.length) {
    await record({
      fromAddress: originator,
      toAddress: tx.to,
      valueLuna: tx.value,
      memo,
      status: 'rejected',
      blockNumber: tx.blockNumber,
      rejectedReason: problems.join('; '),
    })

    await logEscrow({
      bountyId,
      event: 'funding.rejected',
      detail: problems.join('; '),
      amountLuna: tx.value,
      txHash: tx.hash,
    })

    throw createError({ statusCode: 400, statusMessage: `Funding rejected: ${problems.join('; ')}` })
  }

  const now = Math.floor(Date.now() / 1000)

  await record({
    fromAddress: originator,
    toAddress: tx.to,
    valueLuna: tx.value,
    memo,
    status: 'verified',
    blockNumber: tx.blockNumber,
    rejectedReason: null,
    verifiedAt: now,
  })

  // Compare-and-set: only the call that finds the bounty still awaiting
  // funding activates it. Parallel callers see zero rows changed and report
  // the bounty as already funded rather than re-crediting it.
  const activated = await db.update(bounties)
    .set({
      status: 'active',
      fundedLuna: tx.value,
      fundingTxHash: tx.hash,
      fundedAt: now,
    })
    .where(and(eq(bounties.id, bountyId), eq(bounties.status, 'awaiting_funding')))
    .returning({ id: bounties.id })

  if (!activated.length) {
    return { status: 'already_funded', bountyId, fundedLuna: tx.value }
  }

  await logEscrow({
    bountyId,
    event: 'funding.verified',
    amountLuna: tx.value,
    txHash: tx.hash,
  })

  return {
    status: 'verified',
    bountyId,
    fundedLuna: tx.value,
    fundedNim: lunaToNim(tx.value),
    blockNumber: tx.blockNumber,
    txHash: tx.hash,
    explorerUrl: `${useRuntimeConfig().public.explorerBase}/#${tx.hash}`,
  }
})
