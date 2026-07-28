import { randomUUID } from 'node:crypto'
import { bounties, useDb } from '../../db'
// Imported explicitly rather than auto-imported: Nitro's scanner silently
// omitted nimToLuna, which failed at runtime instead of at build time. Money
// helpers should break loudly.
import { fundingMemo, getEscrowAddress } from '../../utils/escrow'
import { nimToLuna } from '../../utils/nimiq'
import { requireAddress } from '../../utils/session'

const CATEGORIES = ['coding', 'security', 'design', 'content', 'research', 'community', 'other']

const MIN_REWARD_NIM = 1
const MAX_TITLE = 120
const MAX_DESCRIPTION = 4000

/**
 * Creates a bounty in `awaiting_funding`. It is deliberately not visible to
 * hunters yet: nothing is published until the reward has actually arrived and
 * been confirmed on chain.
 */
export default defineEventHandler(async (event) => {
  const creatorAddress = await requireAddress(event)
  const body = await readBody<{
    title?: string
    description?: string
    requirements?: string
    category?: string
    rewardNim?: number
    deadlineAt?: number
  }>(event)

  const title = body?.title?.trim() ?? ''
  const description = body?.description?.trim() ?? ''
  const requirements = body?.requirements?.trim() ?? ''
  const category = body?.category ?? ''
  const rewardNim = Number(body?.rewardNim)
  const deadlineAt = Number(body?.deadlineAt)

  if (!title || title.length > MAX_TITLE) {
    throw createError({ statusCode: 400, statusMessage: `Title must be 1 to ${MAX_TITLE} characters` })
  }
  if (!description || description.length > MAX_DESCRIPTION) {
    throw createError({ statusCode: 400, statusMessage: `Description must be 1 to ${MAX_DESCRIPTION} characters` })
  }
  if (!CATEGORIES.includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown category' })
  }
  if (!Number.isFinite(rewardNim) || rewardNim < MIN_REWARD_NIM) {
    throw createError({ statusCode: 400, statusMessage: `Reward must be at least ${MIN_REWARD_NIM} NIM` })
  }

  const now = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(deadlineAt) || deadlineAt <= now) {
    throw createError({ statusCode: 400, statusMessage: 'Deadline must be in the future' })
  }

  const id = randomUUID()
  const escrowAddress = await getEscrowAddress()

  await useDb().insert(bounties).values({
    id,
    creatorAddress,
    title,
    description,
    requirements,
    category,
    rewardLuna: nimToLuna(rewardNim),
    fundedLuna: 0,
    status: 'awaiting_funding',
    deadlineAt,
    escrowAddress,
  })

  return {
    id,
    status: 'awaiting_funding',
    escrowAddress,
    rewardLuna: nimToLuna(rewardNim),
    // The client sends exactly this memo so the funding transaction can be
    // matched back to this bounty on chain.
    memo: fundingMemo(id),
  }
})
