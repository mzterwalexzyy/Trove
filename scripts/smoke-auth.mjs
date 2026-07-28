/**
 * Proves the server-side signature verification path without a phone.
 * Signs a nonce locally with a generated key, then checks that the server
 * accepts it, binds it to the right address, and refuses a replay.
 */
import { createHash } from 'node:crypto'
import * as Nimiq from '@nimiq/core'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'

/**
 * Mirrors what Nimiq Pay actually signs, confirmed on a real device:
 * sha256(prefix + utf8 byte length + message).
 */
function signedMessageBytes(message) {
  const enc = new TextEncoder()
  const raw = enc.encode(message)
  const payload = enc.encode(`\x16Nimiq Signed Message:\n${raw.length}${message}`)
  return new Uint8Array(createHash('sha256').update(payload).digest())
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const kp = Nimiq.KeyPair.generate()
const address = kp.toAddress().toUserFriendlyAddress()
console.log('test address:', address)

const challenge = await post('/api/auth/nonce', { address })
console.log('nonce issued:', challenge.body.nonce)

const bytes = signedMessageBytes(challenge.body.message)
const signature = kp.sign(bytes)

const verified = await post('/api/auth/verify', {
  address,
  nonce: challenge.body.nonce,
  publicKey: kp.publicKey.toHex(),
  signature: signature.toHex(),
})
console.log('verify ->', JSON.stringify(verified.body))

const replay = await post('/api/auth/verify', {
  address,
  nonce: challenge.body.nonce,
  publicKey: kp.publicKey.toHex(),
  signature: signature.toHex(),
})
console.log('replay ->', replay.status, JSON.stringify(replay.body?.statusMessage ?? replay.body))

// A signature that is valid but produced by a different key must not
// authenticate the claimed address.
const impostor = Nimiq.KeyPair.generate()
const challenge2 = await post('/api/auth/nonce', { address })
const bytes2 = signedMessageBytes(challenge2.body.message)
const forged = impostor.sign(bytes2)
const spoof = await post('/api/auth/verify', {
  address,
  nonce: challenge2.body.nonce,
  publicKey: impostor.publicKey.toHex(),
  signature: forged.toHex(),
})
console.log('wrong-key ->', JSON.stringify(spoof.body))
