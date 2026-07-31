import { useAuthSession } from '../../utils/session'

/**
 * Clears the sealed session cookie. This is a local disconnect only: it forgets
 * the wallet on this device and nothing more. It never touches the wallet, the
 * chain, or any funded bounty, so a creator who disconnects can reconnect the
 * same wallet later and find everything exactly as it was.
 */
export default defineEventHandler(async (event) => {
  const session = await useAuthSession(event)
  await session.clear()
  return { ok: true }
})
