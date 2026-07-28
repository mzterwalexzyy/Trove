import { users, useDb } from '../../db'
import { consumeNonce, nonceMessage } from '../../utils/nonces'
import { normalizeAddress, verifyWalletSignature } from '../../utils/nimiq'
import { useAuthSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    address?: string
    nonce?: string
    publicKey?: string
    signature?: string
  }>(event)

  if (!body?.address || !body.nonce || !body.publicKey || !body.signature) {
    throw createError({
      statusCode: 400,
      statusMessage: 'address, nonce, publicKey and signature are required',
    })
  }

  // Consume first: a nonce is single-use whether or not the signature checks
  // out, so a failed attempt cannot be retried against the same challenge.
  const fresh = await consumeNonce(body.nonce, body.address)
  if (!fresh) {
    throw createError({ statusCode: 401, statusMessage: 'nonce is unknown, expired, or already used' })
  }

  const check = await verifyWalletSignature({
    message: nonceMessage(body.nonce),
    publicKey: body.publicKey,
    signature: body.signature,
    address: body.address,
  })

  const authenticated = check.valid && check.boundToAddress

  if (authenticated) {
    const address = normalizeAddress(body.address)
    const db = useDb()
    await db.insert(users)
      .values({ address })
      .onConflictDoUpdate({
        target: users.address,
        set: { lastSeenAt: Math.floor(Date.now() / 1000) },
      })

    const session = await useAuthSession(event)
    await session.update({ address, authenticatedAt: Date.now() })
  }

  return {
    authenticated,
    signatureValid: check.valid,
    boundToAddress: check.boundToAddress,
    encoding: check.encoding,
    attempted: check.attempted,
  }
})
