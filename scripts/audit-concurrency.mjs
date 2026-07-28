/**
 * Fires genuinely parallel requests at the money paths.
 *
 * The database constraints are only a guarantee if the code paths that touch
 * them actually collide correctly under load. This exercises that rather than
 * assuming it.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as Nimiq from '@nimiq/core'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const RPC = 'https://rpc.testnet.nimiqwatch.com/'
const NETWORK_ID = 5
const LUNA = 100_000
const REWARD = 1 * LUNA

const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const readEnv = key => raw.split('\n').find(l => l.startsWith(`${key}=`))?.slice(key.length + 1).trim()

let problems = 0
function check(label, ok, detail = '') {
  if (!ok) problems++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

function signedMessageBytes(message) {
  const enc = new TextEncoder()
  const rawBytes = enc.encode(message)
  return new Uint8Array(
    createHash('sha256').update(enc.encode(`\x16Nimiq Signed Message:\n${rawBytes.length}${message}`)).digest(),
  )
}

async function rpc(method, params = []) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(`${method}: ${json.error.data || json.error.message}`)
  return json.result.data
}

function makeClient() {
  let cookie = ''
  return async function call(path, options = {}) {
    const res = await fetch(BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    const text = await res.text()
    try { return { status: res.status, body: JSON.parse(text) } }
    catch { return { status: res.status, body: text } }
  }
}

async function signIn(client, keyPair) {
  const address = keyPair.toAddress().toUserFriendlyAddress()
  const challenge = await client('/api/auth/nonce', { method: 'POST', body: { address } })
  const signature = keyPair.sign(signedMessageBytes(challenge.body.message))
  await client('/api/auth/verify', {
    method: 'POST',
    body: { address, nonce: challenge.body.nonce, publicKey: keyPair.publicKey.toHex(), signature: signature.toHex() },
  })
  return address
}

async function send(keyPair, recipient, valueLuna, memo) {
  const height = await rpc('getBlockNumber')
  const tx = Nimiq.TransactionBuilder.newBasicWithData(
    keyPair.toAddress(), Nimiq.Address.fromAny(recipient),
    new TextEncoder().encode(memo), BigInt(valueLuna), BigInt(0), height, NETWORK_ID,
  )
  keyPair.signTransaction(tx)
  return rpc('sendRawTransaction', [tx.toHex()])
}

async function waitFor(hash) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const tx = await rpc('getTransactionByHash', [hash])
      if (tx?.blockNumber > 0) return tx
    }
    catch { /* not indexed */ }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('never landed')
}

const escrowKey = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(readEnv('NUXT_ESCROW_PRIVATE_KEY')))
const escrowAddress = escrowKey.toAddress().toUserFriendlyAddress()

const creator = Nimiq.KeyPair.generate()
const hunter = Nimiq.KeyPair.generate()
const hunterAddress = hunter.toAddress().toUserFriendlyAddress()
const clientA = makeClient()
const clientB = makeClient()

console.log('--- setup: one funded bounty with one submission ---')
await signIn(clientA, creator)
await signIn(clientB, hunter)

const created = await clientA('/api/bounties', {
  method: 'POST',
  body: {
    title: 'Concurrency audit bounty',
    description: 'Used to prove parallel requests cannot double-spend.',
    category: 'other',
    rewardNim: 1,
    deadlineAt: Math.floor(Date.now() / 1000) + 86400,
  },
})
const bountyId = created.body.id

await waitFor(await send(escrowKey, creator.toAddress().toUserFriendlyAddress(), REWARD, 'nqb:audit'))
const fundingHash = await send(creator, escrowAddress, REWARD, created.body.memo)
await waitFor(fundingHash)

console.log('\n--- 1. parallel funding credits of the SAME transaction ---')
const fundingResults = await Promise.all(
  Array.from({ length: 5 }, () =>
    clientA(`/api/bounties/${bountyId}/fund`, { method: 'POST', body: { txHash: fundingHash } })),
)
const fundStatuses = fundingResults.map(r => r.body?.status ?? `HTTP ${r.status}`)
console.log(`  statuses: ${fundStatuses.join(', ')}`)
const serverErrors = fundingResults.filter(r => r.status >= 500)
check('no 5xx under parallel funding', serverErrors.length === 0, `${serverErrors.length} server errors`)

const detail = await clientA(`/api/bounties/${bountyId}`)
check('bounty funded exactly once', detail.body?.fundedNim === 1, `${detail.body?.fundedNim} NIM`)

const submitRes = await clientB(`/api/bounties/${bountyId}/submissions`, {
  method: 'POST', body: { content: 'audit submission' },
})
check('hunter submitted', submitRes.status === 200)

// A second entrant, so concurrent selection has two genuinely different
// outcomes to race between. Selecting the same submission twice is meant to be
// idempotent and proves nothing on its own.
const rival = Nimiq.KeyPair.generate()
const rivalAddress = rival.toAddress().toUserFriendlyAddress()
const clientC = makeClient()
await signIn(clientC, rival)
await clientC(`/api/bounties/${bountyId}/submissions`, {
  method: 'POST', body: { content: 'rival audit submission' },
})

console.log('\n--- 2. parallel selection of DIFFERENT winners ---')
const fresh = await clientA(`/api/bounties/${bountyId}`)
check('two submissions present', fresh.body.submissions.length === 2, String(fresh.body.submissions.length))
const [first, second] = fresh.body.submissions

const winnerResults = await Promise.all([
  clientA(`/api/bounties/${bountyId}/winner`, { method: 'POST', body: { submissionId: first.id } }),
  clientA(`/api/bounties/${bountyId}/winner`, { method: 'POST', body: { submissionId: second.id } }),
  clientA(`/api/bounties/${bountyId}/winner`, { method: 'POST', body: { submissionId: first.id } }),
  clientA(`/api/bounties/${bountyId}/winner`, { method: 'POST', body: { submissionId: second.id } }),
])
const accepted = winnerResults.filter(r => r.status === 200)
const conflicted = winnerResults.filter(r => r.status === 409)
console.log(`  ${accepted.length} accepted, ${conflicted.length} rejected as conflicting`)

const distinctWinners = new Set(accepted.map(r => r.body?.winnerAddress).filter(Boolean))
check('exactly one wallet is ever named the winner', distinctWinners.size === 1,
  `${distinctWinners.size} distinct`)

const settled = await clientA(`/api/bounties/${bountyId}`)
const winnerRow = settled.body.submissions.filter(s => s.status === 'winner')
check('exactly one submission is marked winner', winnerRow.length === 1, String(winnerRow.length))
check('the stored winner matches the accepted one',
  distinctWinners.size === 1 && winnerRow[0]
  && winnerRow[0].participantAddress.replace(/\s/g, '') === [...distinctWinners][0].replace(/\s/g, ''))

console.log('\n--- 3. parallel payout requests (the critical one) ---')
const winnerAddr = [...distinctWinners][0]
const balanceBefore = (await rpc("getAccountByAddress", [winnerAddr])).balance
const payoutResults = await Promise.all(
  Array.from({ length: 6 }, () => clientA(`/api/bounties/${bountyId}/payout`, { method: 'POST' })),
)
const ok = payoutResults.filter(r => r.status === 200)
const refused = payoutResults.filter(r => r.status === 409)
console.log(`  ${ok.length} succeeded, ${refused.length} refused, ${payoutResults.length - ok.length - refused.length} other`)
check('at most one payout request succeeds', ok.length <= 1, `${ok.length} succeeded`)

const hashes = new Set(ok.map(r => r.body?.txHash).filter(Boolean))
check('at most one payout transaction broadcast', hashes.size <= 1, `${hashes.size} distinct hashes`)

if (hashes.size === 1) await waitFor([...hashes][0])
// Let any stray broadcast settle before measuring.
await new Promise(r => setTimeout(r, 6000))

const balanceAfter = (await rpc("getAccountByAddress", [winnerAddr])).balance
const delta = balanceAfter - balanceBefore
check('winner received the reward exactly once', delta === REWARD, `${delta / LUNA} NIM`)

console.log('\n--- 4. payout after completion ---')
const afterComplete = await clientA(`/api/bounties/${bountyId}/payout`, { method: 'POST' })
check('payout on a completed bounty is refused', afterComplete.status === 409, String(afterComplete.status))

console.log('\n--- 5. nonce replay under parallel use ---')
const probe = Nimiq.KeyPair.generate()
const probeAddress = probe.toAddress().toUserFriendlyAddress()
const probeClient = makeClient()
const challenge = await probeClient('/api/auth/nonce', { method: 'POST', body: { address: probeAddress } })
const signature = probe.sign(signedMessageBytes(challenge.body.message))
const authResults = await Promise.all(
  Array.from({ length: 5 }, () =>
    probeClient('/api/auth/verify', {
      method: 'POST',
      body: {
        address: probeAddress,
        nonce: challenge.body.nonce,
        publicKey: probe.publicKey.toHex(),
        signature: signature.toHex(),
      },
    })),
)
const authOk = authResults.filter(r => r.body?.authenticated === true).length
check('a nonce authenticates at most once', authOk <= 1, `${authOk} accepted`)

console.log(`\n${problems === 0 ? 'ALL CONCURRENCY CHECKS PASSED' : `${problems} PROBLEM(S)`}`)
process.exit(problems === 0 ? 0 : 1)
