import { getNimiqCore } from '../../utils/nimiq'
import { issueNonce, nonceMessage } from '../../utils/nonces'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ address?: string }>(event)
  if (!body?.address) {
    throw createError({ statusCode: 400, statusMessage: 'address is required' })
  }

  // Reject anything that is not a real Nimiq address before it reaches the
  // rest of the system.
  const Nimiq = await getNimiqCore()
  try {
    Nimiq.Address.fromAny(body.address)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'not a valid Nimiq address' })
  }

  const nonce = await issueNonce(body.address)
  return { nonce, message: nonceMessage(nonce) }
})
