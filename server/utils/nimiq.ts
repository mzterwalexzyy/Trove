import { createHash } from 'node:crypto'

export const LUNA_PER_NIM = 100_000

/** Albatross network ids, confirmed empirically against the public RPC. */
export const NETWORK_ID = { test: 5, main: 24 } as const

export function nimToLuna(nim: number): number {
  return Math.round(nim * LUNA_PER_NIM)
}

export function lunaToNim(luna: number): number {
  return luna / LUNA_PER_NIM
}

type RpcOk<T> = { result: { data: T, metadata: unknown } }
type RpcErr = { error: { code: number, message: string, data?: string } }

/**
 * Calls the public Albatross JSON-RPC. This is the only source of truth for
 * whether money actually moved. Wallet-returned hashes are never trusted on
 * their own.
 */
export async function nimiqRpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const url = useRuntimeConfig().nimiqRpcUrl
  const res = await $fetch<RpcOk<T> & Partial<RpcErr>>(url, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: Date.now(), method, params },
    timeout: 15_000,
  })
  if (res.error) {
    throw new Error(`RPC ${method} failed: ${res.error.data || res.error.message}`)
  }
  return res.result.data
}

/**
 * The WASM bundle is cached on globalThis rather than in a module variable.
 *
 * Nitro replaces the module graph on hot reload, which would otherwise
 * instantiate a second copy of the Nimiq WASM module in the same process. That
 * segfaulted the dev server twice (exit 139). Keying off globalThis survives
 * reloads, so exactly one instance ever exists per process.
 */
const CORE_KEY = Symbol.for('nimiq-bounty.core')

interface CoreHolder {
  [CORE_KEY]?: Promise<typeof import('@nimiq/core')>
}

export async function getNimiqCore() {
  const holder = globalThis as CoreHolder
  if (!holder[CORE_KEY]) holder[CORE_KEY] = import('@nimiq/core')
  return holder[CORE_KEY]
}

const SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

export const SIGNING_ENCODING = 'sha256(prefix+length+message)'

/**
 * The exact bytes Nimiq Pay signs over, confirmed on a real device during
 * Phase 1: SHA-256 of the Nimiq signed-message prefix, the message's UTF-8
 * byte length as decimal, then the message.
 *
 * This is deliberately the only accepted encoding. A local key signing raw
 * UTF-8 produces a different result, so accepting several encodings would
 * widen the surface for no benefit.
 */
export function signedMessageBytes(message: string): Uint8Array {
  const enc = new TextEncoder()
  const raw = enc.encode(message)
  const payload = enc.encode(SIGNED_MESSAGE_PREFIX + raw.length + message)
  return new Uint8Array(createHash('sha256').update(payload).digest())
}

export interface SignatureCheck {
  valid: boolean
  encoding: string | null
  boundToAddress: boolean
}

/**
 * Verifies a wallet signature and confirms the signer really is `address`.
 * Both must hold: a valid signature over a key we did not choose proves
 * nothing on its own.
 */
export async function verifyWalletSignature(opts: {
  message: string
  publicKey: string
  signature: string
  address: string
}): Promise<SignatureCheck> {
  const Nimiq = await getNimiqCore()

  let publicKey, signature, claimed
  try {
    publicKey = Nimiq.PublicKey.fromHex(opts.publicKey)
    signature = Nimiq.Signature.fromHex(opts.signature)
    claimed = Nimiq.Address.fromAny(opts.address)
  }
  catch {
    return { valid: false, encoding: null, boundToAddress: false }
  }

  if (!publicKey.verify(signature, signedMessageBytes(opts.message))) {
    return { valid: false, encoding: null, boundToAddress: false }
  }

  // A valid signature proves someone holds *a* key. This proves it is the key
  // behind the address being claimed.
  const proof = Nimiq.SignatureProof.singleSig(publicKey, signature)
  return {
    valid: true,
    encoding: SIGNING_ENCODING,
    boundToAddress: proof.isSignedBy(claimed),
  }
}

/** Nimiq account types as reported by the RPC. 0 is a plain wallet address. */
export const ACCOUNT_TYPE_BASIC = 0

export interface OnChainTransaction {
  hash: string
  from: string
  fromType: number
  to: string
  value: number
  fee: number
  blockNumber: number
  timestamp: number
  confirmations: number
  data: string
}

/** Fetches a transaction from the chain. Returns null while it is unknown. */
export async function fetchTransaction(hash: string): Promise<OnChainTransaction | null> {
  try {
    const tx = await nimiqRpc<any>('getTransactionByHash', [hash])
    if (!tx) return null
    return {
      hash: tx.hash,
      from: tx.from ?? tx.fromAddress,
      fromType: Number(tx.fromType ?? ACCOUNT_TYPE_BASIC),
      to: tx.to ?? tx.toAddress,
      value: Number(tx.value),
      fee: Number(tx.fee),
      blockNumber: Number(tx.blockNumber ?? 0),
      timestamp: Number(tx.timestamp ?? 0),
      confirmations: Number(tx.confirmations ?? 0),
      // getTransactionByHash returns the memo as `recipientData`; `data` is null.
      data: tx.data ?? tx.recipientData ?? '',
    }
  }
  catch {
    // An unknown hash is a normal pending state, not an error.
    return null
  }
}

/**
 * Resolves who is really behind a transaction's sender.
 *
 * Nimiq Pay does not necessarily spend from the address `listAccounts()`
 * returns. Testnet faucet funds arrive in an HTLC contract, and payments are
 * spent straight out of it, so `tx.from` is the contract address. The contract
 * records the user's own address in its `sender` field, which is what we
 * surface for display and reputation.
 *
 * This is informational only. Funding is never gated on it, because a contract
 * layout we have not seen would otherwise reject a payment that genuinely
 * arrived.
 */
export async function resolveOriginator(tx: OnChainTransaction): Promise<string> {
  if (tx.fromType === ACCOUNT_TYPE_BASIC) return tx.from
  try {
    const account = await nimiqRpc<{ sender?: string }>('getAccountByAddress', [tx.from])
    return account.sender ?? tx.from
  }
  catch {
    return tx.from
  }
}

/** Decodes the hex `data` field a Nimiq transaction carries as its memo. */
export function decodeMemo(data: string): string {
  if (!data) return ''
  try {
    return Buffer.from(data.replace(/^0x/, ''), 'hex').toString('utf8')
  }
  catch {
    return ''
  }
}

export function normalizeAddress(address: string): string {
  return address.replace(/\s+/g, '').toUpperCase()
}

export function addressesMatch(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b)
}
