import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { bounties, submissions, useDb } from '../../../db'
import { addressesMatch } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

const MAX_CONTENT = 4000

export default defineEventHandler(async (event) => {
  const address = await requireAddress(event)
  const bountyId = getRouterParam(event, 'id')!
  const body = await readBody<{ content?: string, link?: string }>(event)

  const content = body?.content?.trim() ?? ''
  const link = body?.link?.trim() || null

  if (!content || content.length > MAX_CONTENT) {
    throw createError({ statusCode: 400, statusMessage: `Submission must be 1 to ${MAX_CONTENT} characters` })
  }
  if (link && !/^https?:\/\//i.test(link)) {
    throw createError({ statusCode: 400, statusMessage: 'Link must start with http:// or https://' })
  }

  const db = useDb()
  const bounty = await db.query.bounties.findFirst({ where: eq(bounties.id, bountyId) })
  if (!bounty) throw createError({ statusCode: 404, statusMessage: 'Bounty not found' })

  if (bounty.status !== 'active') {
    throw createError({ statusCode: 409, statusMessage: 'This bounty is not accepting submissions' })
  }
  if (bounty.deadlineAt <= Math.floor(Date.now() / 1000)) {
    throw createError({ statusCode: 409, statusMessage: 'The deadline for this bounty has passed' })
  }
  if (addressesMatch(bounty.creatorAddress, address)) {
    throw createError({ statusCode: 403, statusMessage: 'You cannot submit to your own bounty' })
  }

  const existing = await db.query.submissions.findFirst({
    where: and(eq(submissions.bountyId, bountyId), eq(submissions.participantAddress, address)),
  })

  // One submission per wallet. A resubmission edits in place rather than
  // stuffing the creator's review queue with duplicates.
  if (existing) {
    if (existing.status === 'winner') {
      throw createError({ statusCode: 409, statusMessage: 'Your submission already won this bounty' })
    }
    await db.update(submissions)
      .set({ content, link })
      .where(eq(submissions.id, existing.id))
    return { id: existing.id, updated: true }
  }

  const id = randomUUID()
  await db.insert(submissions).values({
    id,
    bountyId,
    participantAddress: address,
    content,
    link,
    status: 'submitted',
  })

  return { id, updated: false }
})
