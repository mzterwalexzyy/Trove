import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { bounties, escrowLog, payouts, referralPayouts, referrals, transactions, useDb } from '../db'
import {
  addressesMatch,
  decodeMemo,
  fetchTransaction,
  getNimiqCore,
  lunaToNim,
  NETWORK_ID,
  nimiqRpc,
} from './nimiq'

export function fundingMemo(bountyId: string): string {
  return `nqb:fund:${bountyId}`
}

export function payoutMemo(bountyId: string): string {
  return `nqb:pay:${bountyId}`
}

export function referralMemo(bountyId: string): string {
  return `nqb:ref:${bountyId}`
}

/** A referrer earns this share of a won bounty, taken out of the reward. */
export const REFERRAL_PERCENT = 5

/**
 * Splits a reward into a referral cut and the winner's remainder, in integer
 * Luna. The remainder always absorbs the rounding, so the two legs reconstruct
 * the base exactly. Computing each independently could lose or invent a Luna;
 * this asserts the invariant rather than trusting it, and the assertion sits on
 * the payout path, not only in a test.
 */
export function referralSplit(baseLuna: number): { referralLuna: number, winnerLuna: number } {
  const referralLuna = Math.floor((baseLuna * REFERRAL_PERCENT) / 100)
  const winnerLuna = baseLuna - referralLuna
  if (referralLuna + winnerLuna !== baseLuna) {
    throw new Error(`referral split does not reconstruct base: ${referralLuna} + ${winnerLuna} != ${baseLuna}`)
  }
  if (referralLuna < 0 || winnerLuna < 0) {
    throw new Error(`referral split produced a negative leg for base ${baseLuna}`)
  }
  return { referralLuna, winnerLuna }
}

export async function logEscrow(entry: {
  bountyId?: string | null
  event: string
  detail?: string
  amountLuna?: number | null
  txHash?: string | null
}) {
  await useDb().insert(escrowLog).values({
    id: randomUUID(),
    bountyId: entry.bountyId ?? null,
    event: entry.event,
    detail: entry.detail ?? '',
    amountLuna: entry.amountLuna ?? null,
    txHash: entry.txHash ?? null,
  })
}

async function escrowKeyPair() {
  const Nimiq = await getNimiqCore()
  const key = useRuntimeConfig().escrowPrivateKey
  if (!key) throw new Error('Escrow key is not configured')
  return Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(key))
}

let cachedEscrowAddress: string | null = null

/**
 * The escrow address, derived from the private key rather than read from
 * configuration.
 *
 * A separately configured copy is a second source of truth that can drift. A
 * Nimiq address contains spaces, so an unquoted env var silently truncates at
 * the first one, and every funding check would then compare against the wrong
 * address and reject legitimate payments. Deriving it removes that failure
 * mode: if the key is right, the address is right.
 */
export async function getEscrowAddress(): Promise<string> {
  if (!cachedEscrowAddress) {
    const keyPair = await escrowKeyPair()
    cachedEscrowAddress = keyPair.toAddress().toUserFriendlyAddress()
  }
  return cachedEscrowAddress
}

/**
 * Looks for a payout we may have already broadcast carrying this memo. Used to
 * recover from a crash between broadcasting and recording the hash, so a
 * retry adopts the existing transaction instead of paying twice. Takes the
 * memo rather than deriving it, so it serves the winner and referral legs
 * alike.
 */
async function findExistingPayoutOnChain(escrowAddress: string, memo: string): Promise<string | null> {
  try {
    const history = await nimiqRpc<any[]>('getTransactionsByAddress', [escrowAddress, 50, null])
    for (const tx of history ?? []) {
      const data = tx.data ?? tx.recipientData ?? ''
      if (decodeMemo(data) === memo) return tx.hash
    }
  }
  catch {
    // History is unavailable on some nodes. The database claim below is still
    // the primary guard; this is defence in depth, not the only defence.
  }
  return null
}

/**
 * Resolves how a bounty's verified funds are divided between the winner and,
 * if the winner was referred, the referrer.
 *
 * The base is the chain-verified funded amount capped by the advertised
 * reward, exactly as the winner-only payout has always computed it. A referral
 * is owed only when a `referrals` row exists for this bounty's selected winner;
 * the split then holds back the referral cut and the winner receives the
 * remainder. With no referral the winner receives the whole base and the
 * referral leg is zero.
 */
async function resolvePayoutPlan(bountyId: string): Promise<
  | { ok: false, reason: string }
  | {
    ok: true
    baseLuna: number
    winnerAddress: string
    winnerLuna: number
    referrerAddress: string | null
    referralLuna: number
  }
> {
  const db = useDb()
  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) return { ok: false, reason: 'bounty not found' }
  if (!bounty.winnerAddress) return { ok: false, reason: 'no winner selected' }
  if (bounty.fundedLuna <= 0) return { ok: false, reason: 'bounty was never funded' }

  const baseLuna = Math.min(bounty.rewardLuna, bounty.fundedLuna)
  if (baseLuna <= 0) return { ok: false, reason: 'nothing to pay' }

  const referral = await db.query.referrals.findFirst({
    where: and(eq(referrals.bountyId, bountyId), eq(referrals.hunterAddress, bounty.winnerAddress)),
  })

  if (!referral) {
    return {
      ok: true,
      baseLuna,
      winnerAddress: bounty.winnerAddress,
      winnerLuna: baseLuna,
      referrerAddress: null,
      referralLuna: 0,
    }
  }

  const { referralLuna, winnerLuna } = referralSplit(baseLuna)
  return {
    ok: true,
    baseLuna,
    winnerAddress: bounty.winnerAddress,
    winnerLuna,
    referrerAddress: referral.referrerAddress,
    referralLuna,
  }
}

/**
 * Completes a bounty only once every payout leg it owes is verified on chain.
 * The winner leg is always owed; the referral leg is owed only when the winner
 * was referred. Called after either leg verifies, so whichever confirms last
 * flips the bounty to `completed`. A half-settled bounty stays open and
 * resumable rather than being silently treated as done.
 */
async function maybeCompleteBounty(bountyId: string) {
  const db = useDb()
  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty || bounty.status === 'completed') return

  const payout = await db.query.payouts.findFirst({ where: eq(payouts.bountyId, bountyId) })
  if (payout?.status !== 'verified') return

  // A referral is owed iff the selected winner was referred.
  const referral = bounty.winnerAddress
    ? await db.query.referrals.findFirst({
        where: and(eq(referrals.bountyId, bountyId), eq(referrals.hunterAddress, bounty.winnerAddress)),
      })
    : null

  if (referral) {
    const refPayout = await db.query.referralPayouts.findFirst({
      where: eq(referralPayouts.bountyId, bountyId),
    })
    if (refPayout?.status !== 'verified') return
  }

  const now = Math.floor(Date.now() / 1000)
  await db.update(bounties)
    .set({ status: 'completed', completedAt: now })
    .where(eq(bounties.id, bountyId))
  await logEscrow({ bountyId, event: 'bounty.completed' })
}

/**
 * Confirms a broadcast payout against the chain and, only then, completes the
 * bounty. Symmetrical with funding: a returned hash is a claim, the RPC is the
 * authority.
 */
export async function verifyPayout(bountyId: string) {
  const db = useDb()
  const payout = await db.query.payouts.findFirst({ where: eq(payouts.bountyId, bountyId) })
  if (!payout?.txHash) return { status: 'not_started' as const }
  if (payout.status === 'verified') return { status: 'verified' as const, txHash: payout.txHash }

  const tx = await fetchTransaction(payout.txHash)
  if (!tx || tx.blockNumber <= 0) return { status: 'pending' as const, txHash: payout.txHash }

  const problems: string[] = []
  if (!addressesMatch(tx.to, payout.winnerAddress)) problems.push('recipient is not the selected winner')
  if (tx.value !== payout.amountLuna) problems.push('amount does not match the claimed payout')
  if (decodeMemo(tx.data) !== payoutMemo(bountyId)) problems.push('memo does not match this bounty')

  if (problems.length) {
    await db.update(payouts)
      .set({ status: 'failed', failureReason: problems.join('; ') })
      .where(eq(payouts.bountyId, bountyId))
    await logEscrow({ bountyId, event: 'payout.verification_failed', detail: problems.join('; '), txHash: tx.hash })
    return { status: 'rejected' as const, problems, txHash: tx.hash }
  }

  const now = Math.floor(Date.now() / 1000)
  await db.update(payouts)
    .set({ status: 'verified', verifiedAt: now })
    .where(eq(payouts.bountyId, bountyId))
  await db.update(transactions)
    .set({ status: 'verified', blockNumber: tx.blockNumber, verifiedAt: now })
    .where(eq(transactions.txHash, tx.hash))

  await logEscrow({ bountyId, event: 'payout.verified', amountLuna: tx.value, txHash: tx.hash })

  // The winner leg is verified, but the bounty completes only when every leg
  // it owes does. If a referral is outstanding, this is a no-op until that
  // leg confirms too.
  await maybeCompleteBounty(bountyId)

  return {
    status: 'verified' as const,
    txHash: tx.hash,
    blockNumber: tx.blockNumber,
    amountNim: lunaToNim(tx.value),
  }
}

export type PayoutResult =
  | { ok: true, txHash: string, amountLuna: number, adopted: boolean }
  | { ok: false, reason: string }

/**
 * Pays a bounty winner from escrow.
 *
 * Safety properties, in order of application:
 *  1. The payout row is keyed by bounty id, so a second concurrent call
 *     collides on insert and aborts before any NIM moves.
 *  2. The amount is capped by the chain-verified funded amount, never by the
 *     advertised reward.
 *  3. Before broadcasting we look for an existing payout carrying this
 *     bounty's memo, so a crash mid-flight cannot cause a double send.
 *  4. Every outcome is written to the append-only escrow log.
 */
export async function payWinner(bountyId: string): Promise<PayoutResult> {
  const db = useDb()
  const config = useRuntimeConfig()

  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) return { ok: false, reason: 'bounty not found' }
  if (bounty.status === 'completed') return { ok: false, reason: 'bounty already completed' }

  // The plan decides how the verified funds split. When the winner was
  // referred, the winner leg is the remainder after the referral cut, not the
  // whole reward, so the two legs sum to exactly the base.
  const plan = await resolvePayoutPlan(bountyId)
  if (!plan.ok) return { ok: false, reason: plan.reason }
  const { winnerAddress, winnerLuna: amountLuna } = plan
  if (amountLuna <= 0) return { ok: false, reason: 'nothing to pay the winner' }

  // Step 1: claim. A duplicate call fails here, before money moves.
  try {
    await db.insert(payouts).values({
      bountyId,
      winnerAddress,
      amountLuna,
      status: 'claimed',
    })
  }
  catch {
    const existing = await db.query.payouts.findFirst({ where: eq(payouts.bountyId, bountyId) })
    await logEscrow({
      bountyId,
      event: 'payout.duplicate_blocked',
      detail: `existing status=${existing?.status ?? 'unknown'}`,
    })
    return { ok: false, reason: 'a payout for this bounty already exists' }
  }

  await logEscrow({ bountyId, event: 'payout.claimed', amountLuna })

  try {
    const Nimiq = await getNimiqCore()
    const keyPair = await escrowKeyPair()
    const escrowAddress = keyPair.toAddress().toUserFriendlyAddress()

    // Step 3: has this payout already gone out?
    const already = await findExistingPayoutOnChain(escrowAddress, payoutMemo(bountyId))
    if (already) {
      await db.update(payouts)
        .set({ status: 'broadcast', txHash: already })
        .where(eq(payouts.bountyId, bountyId))
      await logEscrow({ bountyId, event: 'payout.adopted_existing', txHash: already, amountLuna })
      return { ok: true, txHash: already, amountLuna, adopted: true }
    }

    const account = await nimiqRpc<{ balance: number }>('getAccountByAddress', [escrowAddress])
    if (account.balance < amountLuna) {
      throw new Error(`escrow holds ${account.balance} Luna, needs ${amountLuna}`)
    }

    const height = await nimiqRpc<number>('getBlockNumber')
    const networkId = NETWORK_ID[config.public.nimiqNetwork as 'test' | 'main']

    const tx = Nimiq.TransactionBuilder.newBasicWithData(
      Nimiq.Address.fromAny(escrowAddress),
      Nimiq.Address.fromAny(bounty.winnerAddress),
      new TextEncoder().encode(payoutMemo(bountyId)),
      BigInt(amountLuna),
      BigInt(0),
      height,
      networkId,
    )
    keyPair.signTransaction(tx)
    tx.verify(networkId)

    const txHash = await nimiqRpc<string>('sendRawTransaction', [tx.toHex()])

    await db.update(payouts)
      .set({ status: 'broadcast', txHash })
      .where(eq(payouts.bountyId, bountyId))

    await db.insert(transactions).values({
      id: randomUUID(),
      txHash,
      bountyId,
      type: 'payout',
      fromAddress: escrowAddress,
      toAddress: bounty.winnerAddress,
      valueLuna: amountLuna,
      memo: payoutMemo(bountyId),
      status: 'pending',
    })

    await logEscrow({ bountyId, event: 'payout.broadcast', amountLuna, txHash })
    return { ok: true, txHash, amountLuna, adopted: false }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // The claim row is deliberately left in place. If the broadcast outcome is
    // genuinely unknown, retrying blind risks paying twice; this needs a human.
    await db.update(payouts)
      .set({ status: 'failed', failureReason: reason })
      .where(eq(payouts.bountyId, bountyId))
    await logEscrow({ bountyId, event: 'payout.failed', detail: reason, amountLuna })
    return { ok: false, reason }
  }
}

/**
 * Pays the referrer of a bounty's winner from escrow, if there is one.
 *
 * This is the winner payout's twin, not a parallel payment system: same
 * claim-before-broadcast discipline, same on-chain adoption on crash recovery,
 * same append-only log, with its own table keyed by bounty id so a second
 * referral payment is structurally impossible. The amount comes from the shared
 * `resolvePayoutPlan`, so the referral cut and the winner remainder are always
 * two halves of the same split and can never drift apart.
 *
 * When the winner was not referred this is a well-defined no-op: it returns
 * `skipped` without touching escrow, so callers can invoke it unconditionally.
 */
export type ReferralPayoutResult =
  | { ok: true, txHash: string, amountLuna: number, adopted: boolean }
  | { ok: true, skipped: true }
  | { ok: false, reason: string }

export async function payReferrer(bountyId: string): Promise<ReferralPayoutResult> {
  const db = useDb()
  const config = useRuntimeConfig()

  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) return { ok: false, reason: 'bounty not found' }
  if (bounty.status === 'completed') return { ok: false, reason: 'bounty already completed' }

  const plan = await resolvePayoutPlan(bountyId)
  if (!plan.ok) return { ok: false, reason: plan.reason }
  // No referral attached to the winner: nothing is owed, and that is not an
  // error. Returning here means the winner leg alone completes the bounty.
  if (!plan.referrerAddress || plan.referralLuna <= 0) return { ok: true, skipped: true }
  const { referrerAddress, referralLuna: amountLuna } = plan

  // Step 1: claim. A duplicate call collides on the bounty-id primary key and
  // aborts here, before any NIM moves.
  try {
    await db.insert(referralPayouts).values({
      bountyId,
      referrerAddress,
      amountLuna,
      status: 'claimed',
    })
  }
  catch {
    const existing = await db.query.referralPayouts.findFirst({ where: eq(referralPayouts.bountyId, bountyId) })
    await logEscrow({
      bountyId,
      event: 'referral.duplicate_blocked',
      detail: `existing status=${existing?.status ?? 'unknown'}`,
    })
    return { ok: false, reason: 'a referral payout for this bounty already exists' }
  }

  await logEscrow({ bountyId, event: 'referral.claimed', amountLuna })

  try {
    const Nimiq = await getNimiqCore()
    const keyPair = await escrowKeyPair()
    const escrowAddress = keyPair.toAddress().toUserFriendlyAddress()

    // Adopt an already-broadcast referral tx rather than sending twice.
    const already = await findExistingPayoutOnChain(escrowAddress, referralMemo(bountyId))
    if (already) {
      await db.update(referralPayouts)
        .set({ status: 'broadcast', txHash: already })
        .where(eq(referralPayouts.bountyId, bountyId))
      await logEscrow({ bountyId, event: 'referral.adopted_existing', txHash: already, amountLuna })
      return { ok: true, txHash: already, amountLuna, adopted: true }
    }

    const account = await nimiqRpc<{ balance: number }>('getAccountByAddress', [escrowAddress])
    if (account.balance < amountLuna) {
      throw new Error(`escrow holds ${account.balance} Luna, needs ${amountLuna}`)
    }

    const height = await nimiqRpc<number>('getBlockNumber')
    const networkId = NETWORK_ID[config.public.nimiqNetwork as 'test' | 'main']

    const tx = Nimiq.TransactionBuilder.newBasicWithData(
      Nimiq.Address.fromAny(escrowAddress),
      Nimiq.Address.fromAny(referrerAddress),
      new TextEncoder().encode(referralMemo(bountyId)),
      BigInt(amountLuna),
      BigInt(0),
      height,
      networkId,
    )
    keyPair.signTransaction(tx)
    tx.verify(networkId)

    const txHash = await nimiqRpc<string>('sendRawTransaction', [tx.toHex()])

    await db.update(referralPayouts)
      .set({ status: 'broadcast', txHash })
      .where(eq(referralPayouts.bountyId, bountyId))

    await db.insert(transactions).values({
      id: randomUUID(),
      txHash,
      bountyId,
      type: 'referral',
      fromAddress: escrowAddress,
      toAddress: referrerAddress,
      valueLuna: amountLuna,
      memo: referralMemo(bountyId),
      status: 'pending',
    })

    await logEscrow({ bountyId, event: 'referral.broadcast', amountLuna, txHash })
    return { ok: true, txHash, amountLuna, adopted: false }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    // Same reasoning as the winner leg: an unknown broadcast outcome is left
    // failed rather than retried blind, because a blind retry risks paying the
    // referrer twice.
    await db.update(referralPayouts)
      .set({ status: 'failed', failureReason: reason })
      .where(eq(referralPayouts.bountyId, bountyId))
    await logEscrow({ bountyId, event: 'referral.failed', detail: reason, amountLuna })
    return { ok: false, reason }
  }
}

/**
 * Confirms a broadcast referral payout against the chain, then completes the
 * bounty only if the winner leg is also verified. Mirrors `verifyPayout`.
 */
export async function verifyReferralPayout(bountyId: string) {
  const db = useDb()
  const payout = await db.query.referralPayouts.findFirst({ where: eq(referralPayouts.bountyId, bountyId) })
  if (!payout?.txHash) return { status: 'not_started' as const }
  if (payout.status === 'verified') return { status: 'verified' as const, txHash: payout.txHash }

  const tx = await fetchTransaction(payout.txHash)
  if (!tx || tx.blockNumber <= 0) return { status: 'pending' as const, txHash: payout.txHash }

  const problems: string[] = []
  if (!addressesMatch(tx.to, payout.referrerAddress)) problems.push('recipient is not the recorded referrer')
  if (tx.value !== payout.amountLuna) problems.push('amount does not match the claimed referral payout')
  if (decodeMemo(tx.data) !== referralMemo(bountyId)) problems.push('memo does not match this bounty')

  if (problems.length) {
    await db.update(referralPayouts)
      .set({ status: 'failed', failureReason: problems.join('; ') })
      .where(eq(referralPayouts.bountyId, bountyId))
    await logEscrow({ bountyId, event: 'referral.verification_failed', detail: problems.join('; '), txHash: tx.hash })
    return { status: 'rejected' as const, problems, txHash: tx.hash }
  }

  const now = Math.floor(Date.now() / 1000)
  await db.update(referralPayouts)
    .set({ status: 'verified', verifiedAt: now })
    .where(eq(referralPayouts.bountyId, bountyId))
  await db.update(transactions)
    .set({ status: 'verified', blockNumber: tx.blockNumber, verifiedAt: now })
    .where(eq(transactions.txHash, tx.hash))

  await logEscrow({ bountyId, event: 'referral.verified', amountLuna: tx.value, txHash: tx.hash })

  // Whichever leg confirms last flips the bounty to completed.
  await maybeCompleteBounty(bountyId)

  return {
    status: 'verified' as const,
    txHash: tx.hash,
    blockNumber: tx.blockNumber,
    amountNim: lunaToNim(tx.value),
  }
}
