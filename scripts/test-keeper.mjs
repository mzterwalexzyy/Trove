/** Signs in, then asks Keeper for a draft through the real endpoint. */
import { createHash } from 'node:crypto'
import * as Nimiq from '@nimiq/core'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
let cookie = ''
async function call(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]
  const text = await res.text()
  try { return { status: res.status, body: JSON.parse(text) } } catch { return { status: res.status, body: text } }
}
function bytes(m) {
  const e = new TextEncoder(); const raw = e.encode(m)
  return new Uint8Array(createHash('sha256').update(e.encode(`\x16Nimiq Signed Message:\n${raw.length}${m}`)).digest())
}
const kp = Nimiq.KeyPair.generate()
const address = kp.toAddress().toUserFriendlyAddress()
const ch = await call('/api/auth/nonce', { method: 'POST', body: { address } })
const sig = kp.sign(bytes(ch.body.message))
await call('/api/auth/verify', { method: 'POST', body: { address, nonce: ch.body.nonce, publicKey: kp.publicKey.toHex(), signature: sig.toHex() } })

const started = Date.now()
const r = await call('/api/ai/draft', { method: 'POST', body: { prompt: 'I need someone to design a logo for my DeFi project. Budget around 500 NIM, 5 days.' } })
console.log(`status ${r.status}  ${Date.now() - started}ms`)
console.log(JSON.stringify(r.body, null, 2).slice(0, 900))
