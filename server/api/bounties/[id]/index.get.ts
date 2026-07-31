import { and, eq } from 'drizzle-orm'
import { bounties, payouts, referralPayouts, referrals, submissions, useDb } from '../../../db'
import { REFERRAL_PERCENT, referralSplit } from '../../../utils/escrow'
import { addressesMatch, lunaToNim, normalizeAddress } from '../../../utils/nimiq'
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
  const explorer = (hash?: string | null) => hash ? `${config.public.explorerBase}/#${hash}` : null

  // Only the viewer's own referral, never anyone else's. Exposing the full
  // list would leak who referred whom, and the public bounty card is meant to
  // show the headline reward without the split cluttering it.
  const myReferral = viewer
    ? await db.query.referrals.findFirst({
        where: and(eq(referrals.bountyId, id), eq(referrals.hunterAddress, normalizeAddress(viewer))),
      })
    : null

  // Disclosure: what a referred hunter would actually receive. A hunter who
  // reads "250 NIM" and is paid 237.5 has been misled, and that would undercut
  // the whole verified-reward claim.
  const base = Math.min(bounty.rewardLuna, bounty.fundedLuna)
  const split = referralSplit(base)

  const referralPayout = await db.query.referralPayouts.findFirst({
    where: eq(referralPayouts.bountyId, id),
  })

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

    referral: {
      percent: REFERRAL_PERCENT,
      // What a referred hunter nets, versus the headline reward.
      winnerNim: lunaToNim(split.winnerLuna),
      referrerNim: lunaToNim(split.referralLuna),
      // The viewer's own accepted referral, if any.
      mine: myReferral
        ? { referrerAddress: myReferral.referrerAddress, acceptedAt: myReferral.createdAt }
        : null,
      payout: referralPayout
        ? {
            status: referralPayout.status,
            amountNim: lunaToNim(referralPayout.amountLuna),
            referrerAddress: referralPayout.referrerAddress,
            txHash: referralPayout.txHash,
            explorerUrl: explorer(referralPayout.txHash),
          }
        : null,
    },
  }
})
