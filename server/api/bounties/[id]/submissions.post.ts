import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { bounties, submissions, useDb } from '../../../db'
import { addressesMatch } from '../../../utils/nimiq'
import { requireAddress } from '../../../utils/session'

const MAX_CONTENT = 4000
// Roughly 1.4MB of base64, which is ~1MB of actual image. The client downscales
// before upload; this cap is the backstop against a hand-crafted request, not
// the normal path. Anything larger belongs in a blob store this stack lacks.
const MAX_IMAGE = 1_400_000
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i

export default defineEventHandler(async (event) => {
  const address = await requireAddress(event)
  const bountyId = getRouterParam(event, 'id')!
  const body = await readBody<{ content?: string, link?: string, image?: string }>(event)

  const content = body?.content?.trim() ?? ''
  const link = body?.link?.trim() || null
  const image = body?.image?.trim() || null

  if (!content || content.length > MAX_CONTENT) {
    throw createError({ statusCode: 400, statusMessage: `Submission must be 1 to ${MAX_CONTENT} characters` })
  }
  if (link && !/^https?:\/\//i.test(link)) {
    throw createError({ statusCode: 400, statusMessage: 'Link must start with http:// or https://' })
  }
  if (image) {
    if (!IMAGE_DATA_URL.test(image)) {
      throw createError({ statusCode: 400, statusMessage: 'Image must be a PNG, JPEG, WebP or GIF' })
    }
    if (image.length > MAX_IMAGE) {
      throw createError({ statusCode: 400, statusMessage: 'Image is too large. Please use one under 1MB' })
    }
  }
  // Proof of work is required: a bounty pays real NIM, so the creator needs
  // something to judge against, whether that is a link to the code or writing,
  // or an image of the design.
  if (!link && !image) {
    throw createError({ statusCode: 400, statusMessage: 'Attach a link or an image of your work' })
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
      .set({ content, link, image })
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
    image,
    status: 'submitted',
  })

  return { id, updated: false }
})
