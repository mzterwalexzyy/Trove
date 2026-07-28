import { getHostLanguage, init, type NimiqProvider } from '@nimiq/mini-app-sdk'

type ProviderState = 'unknown' | 'ready' | 'unavailable'

interface SdkError { error: { type: string, message: string } }

/** SDK calls resolve to either the value or an `{ error }` object. */
export function unwrap<T>(result: T | SdkError): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as SdkError).error.message || (result as SdkError).error.type)
  }
  return result as T
}

/** Turns provider and network failures into something a person can act on. */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  if (/reject|denied|cancel/i.test(raw)) return 'Cancelled in your wallet'
  if (/insufficient|balance|funds/i.test(raw)) return 'Not enough NIM in your wallet'
  if (/timeout|timed out/i.test(raw)) return 'The wallet took too long to respond'
  if (/network|fetch|failed to fetch/i.test(raw)) return 'Network problem. Check your connection and try again'
  return raw
}

let providerPromise: Promise<NimiqProvider> | null = null

export function useWallet() {
  const address = useState<string | null>('wallet.address', () => null)
  const providerState = useState<ProviderState>('wallet.provider', () => 'unknown')
  const connecting = useState('wallet.connecting', () => false)
  const error = useState<string | null>('wallet.error', () => null)

  const isInsideNimiqPay = computed(() => providerState.value === 'ready')
  const isConnected = computed(() => Boolean(address.value))

  async function provider(): Promise<NimiqProvider> {
    if (!providerPromise) providerPromise = init({ timeout: 10_000 })
    return providerPromise
  }

  /** Detects the host without triggering any approval dialog. */
  async function detect() {
    if (import.meta.server) return
    if (!getHostLanguage() && !window.nimiq) {
      providerState.value = 'unavailable'
      return
    }
    try {
      await provider()
      providerState.value = 'ready'
    }
    catch {
      providerState.value = 'unavailable'
    }
  }

  /** Restores an existing session cookie. No wallet interaction. */
  async function restore() {
    try {
      const me = await $fetch<{ address: string | null }>('/api/me')
      address.value = me.address
    }
    catch {
      address.value = null
    }
  }

  /**
   * Connects and proves ownership: read the address, sign a server-issued
   * nonce, and let the server bind the two. Two approval dialogs, both driven
   * by an explicit tap, never fired on page load.
   */
  async function connect(): Promise<boolean> {
    if (connecting.value) return isConnected.value
    connecting.value = true
    error.value = null

    try {
      const nimiq = await provider()
      const accounts = unwrap(await nimiq.listAccounts())
      const claimed = accounts[0]
      if (!claimed) throw new Error('Your wallet returned no accounts')

      const challenge = await $fetch<{ nonce: string, message: string }>('/api/auth/nonce', {
        method: 'POST',
        body: { address: claimed },
        timeout: 20_000,
      })

      const signed = unwrap(await nimiq.sign(challenge.message))

      const result = await $fetch<{ authenticated: boolean }>('/api/auth/verify', {
        method: 'POST',
        body: {
          address: claimed,
          nonce: challenge.nonce,
          publicKey: signed.publicKey,
          signature: signed.signature,
        },
        timeout: 20_000,
      })

      if (!result.authenticated) throw new Error('We could not verify that signature')
      address.value = claimed
      return true
    }
    catch (err) {
      error.value = describeError(err)
      return false
    }
    finally {
      connecting.value = false
    }
  }

  /** Sends NIM with an attached memo. Requires wallet approval. */
  async function sendWithMemo(opts: { recipient: string, valueLuna: number, memo: string }) {
    const nimiq = await provider()
    return unwrap(await nimiq.sendBasicTransactionWithData({
      recipient: opts.recipient,
      value: opts.valueLuna,
      data: opts.memo,
    }))
  }

  return {
    address,
    providerState,
    connecting,
    error,
    isInsideNimiqPay,
    isConnected,
    detect,
    restore,
    connect,
    sendWithMemo,
  }
}
