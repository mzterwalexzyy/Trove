import type { H3Event } from 'h3'

interface SessionData {
  address?: string
  authenticatedAt?: number
}

/**
 * Sessions are sealed cookies. The wallet address inside one is only ever
 * written after a signature has been verified and bound to that address, so
 * downstream code can treat `requireAddress` as proof of ownership.
 */
export function useAuthSession(event: H3Event) {
  return useSession<SessionData>(event, {
    password: useRuntimeConfig().sessionPassword,
    name: 'nqb_session',
    cookie: {
      sameSite: 'lax',
      secure: !import.meta.dev,
    },
  })
}

export async function getAddress(event: H3Event): Promise<string | null> {
  const session = await useAuthSession(event)
  return session.data.address ?? null
}

export async function requireAddress(event: H3Event): Promise<string> {
  const address = await getAddress(event)
  if (!address) {
    throw createError({ statusCode: 401, statusMessage: 'Connect your wallet first' })
  }
  return address
}
