import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { bounties, referrals, submissions, useDb, users } from '../../../db'
import { REFERRAL_PERCENT, referralSplit } from '../../../utils/escrow'
import { addressesMatch, lunaToNim, normalizeAddress } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

/**
 * Records that the signed-in hunter accepted a referral for this bounty.
 *
 * Every rule below is enforced here rather than in the UI, because the UI is
 * just a suggestion: anyone can post to this endpoint directly. The referrer
 * is taken from the request, but who is being referred is taken from the
 * session, so a caller can only ever attribute *themselves*.
 */
export default defineEventHandler(async (event) => {
  const hunterAddress = await requireAddress(event)
  const bountyId = getRouterParam(event, 'id')!
  const body = await readBody<{ referrer?: string }>(event)

  if (!body?.referrer) {
    throw createError({ statusCode: 400, statusMessage: 'referrer is required' })
  }

  const db = useDb()

  // A well-formed Nimiq address, and one we have actually seen before. An
  // arbitrary string here would create a referral owed to a wallet that can
  // never claim it.
  const referrerAddress = normalizeAddress(body.referrer)
  const referrer = await db.query.users.findFirst({ where: eq(users.address, referrerAddress) })
  if (!referrer) {
    throw createError({ statusCode: 400, statusMessage: 'That referrer is not a known wallet' })
  }

  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })
  if (bounty.status !== 'active') {
    throw createError({ statusCode: 409, statusMessage: 'This bounty is not open for entries' })
  }

  // Rule 1: no self-referral.
  if (addressesMatch(referrerAddress, hunterAddress)) {
    throw createError({ statusCode: 400, statusMessage: 'You cannot refer yourself' })
  }

  // Rule 2: the creator cannot attribute referrals, in either direction.
  // Otherwise a creator refers themselves through a second wallet and skims
  // the cut off their own bounty.
  if (addressesMatch(bounty.creatorAddress, referrerAddress)
    || addressesMatch(bounty.creatorAddress, hunterAddress)) {
    throw createError({ statusCode: 403, statusMessage: 'The bounty creator cannot take part in referrals' })
  }

  // Rule 3: the referral must predate the submission. Accepting one after
  // submitting means a hunter could shop for a referrer once they were already
  // in the running.
  const existingSubmission = await db.query.submissions.findFirst({
    where: and(
      eq(submissions.bountyId, bountyId),
      eq(submissions.participantAddress, hunterAddress),
    ),
  })
  if (existingSubmission) {
    throw createError({
      statusCode: 409,
      statusMessage: 'You have already submitted to this bounty, so a referral can no longer be attached',
    })
  }

  const { referralLuna, winnerLuna } = referralSplit(Math.min(bounty.rewardLuna, bounty.fundedLuna))

  // Rules 4 and 5: one referrer per (bounty, hunter), and it can never be
  // replaced. The unique index is what enforces this; a losing race lands in
  // the catch and reports the referrer that won, rather than overwriting it.
  try {
    await db.insert(referrals).values({
      id: randomUUID(),
      bountyId,
      hunterAddress: normalizeAddress(hunterAddress),
      referrerAddress,
    })
  }
  catch {
    const existing = await db.query.referrals.findFirst({
      where: and(eq(referrals.bountyId, bountyId), eq(referrals.hunterAddress, normalizeAddress(hunterAddress))),
    })
    return {
      status: 'already_recorded' as const,
      referrerAddress: existing?.referrerAddress ?? referrerAddress,
      referralPercent: REFERRAL_PERCENT,
      referralNim: lunaToNim(referralLuna),
      winnerNim: lunaToNim(winnerLuna),
    }
  }

  return {
    status: 'recorded' as const,
    referrerAddress,
    referralPercent: REFERRAL_PERCENT,
    referralNim: lunaToNim(referralLuna),
    winnerNim: lunaToNim(winnerLuna),
  }
})
