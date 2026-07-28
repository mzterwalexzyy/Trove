/**
 * End-to-end test of the P0 vertical slice against the real Nimiq testnet.
 *
 * Two simulated wallets drive the whole lifecycle:
 *   A creates and funds a bounty -> B submits -> A picks B -> escrow pays B.
 *
 * Funding is a genuine on-chain transfer carrying the bounty's memo, and the
 * payout is a genuine escrow-signed transaction. Nothing here is mocked; the
 * only thing simulated is the wallet UI.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import * as Nimiq from '@nimiq/core'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173'
const RPC = 'https://rpc.testnet.nimiqwatch.com/'
const NETWORK_ID = 5
const LUNA = 100_000

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter(line => line.includes('=') && !line.trim().startsWith('#'))
    .map(line => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    }),
)

let failures = 0
function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL'
  if (!condition) failures++
  console.log(`${status}  ${label}${detail ? `  ${detail}` : ''}`)
}

function signedMessageBytes(message) {
  const enc = new TextEncoder()
  const raw = enc.encode(message)
  return new Uint8Array(
    createHash('sha256').update(enc.encode(`\x16Nimiq Signed Message:\n${raw.length}${message}`)).digest(),
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

/** A browser-ish client that keeps its own cookie, so the two wallets stay separate. */
function makeClient() {
  let cookie = ''
  return async function call(path, options = {}) {
    const res = await fetch(BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { cookie } : {}),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    const text = await res.text()
    let body = null
    try { body = JSON.parse(text) } catch { body = text }
    return { status: res.status, body }
  }
}

async function signIn(client, keyPair) {
  const address = keyPair.toAddress().toUserFriendlyAddress()
  const challenge = await client('/api/auth/nonce', { method: 'POST', body: { address } })
  const signature = keyPair.sign(signedMessageBytes(challenge.body.message))
  const result = await client('/api/auth/verify', {
    method: 'POST',
    body: {
      address,
      nonce: challenge.body.nonce,
      publicKey: keyPair.publicKey.toHex(),
      signature: signature.toHex(),
    },
  })
  return { address, authenticated: result.body?.authenticated === true }
}

async function waitForInclusion(hash, label) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const tx = await rpc('getTransactionByHash', [hash])
      if (tx?.blockNumber > 0) return tx
    }
    catch { /* not yet indexed */ }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error(`${label} never landed on chain`)
}

console.log('--- setup ---')
const escrowKey = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(env.NUXT_ESCROW_PRIVATE_KEY))
const escrowAddress = escrowKey.toAddress().toUserFriendlyAddress()
const creator = Nimiq.KeyPair.generate()
const hunter = Nimiq.KeyPair.generate()
const hunterAddress = hunter.toAddress().toUserFriendlyAddress()

const escrowStart = await rpc('getAccountByAddress', [escrowAddress])
console.log(`escrow  ${escrowAddress}  ${escrowStart.balance / LUNA} NIM`)
console.log(`hunter  ${hunterAddress}`)

const REWARD_NIM = 1
const REWARD_LUNA = REWARD_NIM * LUNA
if (escrowStart.balance < REWARD_LUNA * 2) {
  console.log('\nEscrow needs at least 2 NIM to run this test.')
  process.exit(1)
}

console.log('\n--- wallet A: create and fund ---')
const clientA = makeClient()
const sessionA = await signIn(clientA, creator)
check('creator authenticates', sessionA.authenticated)

const createRes = await clientA('/api/bounties', {
  method: 'POST',
  body: {
    title: 'E2E slice: find the off-by-one',
    description: 'Automated end-to-end test bounty exercising the full lifecycle.',
    requirements: 'Explain the bug and link a fix.',
    category: 'coding',
    rewardNim: REWARD_NIM,
    deadlineAt: Math.floor(Date.now() / 1000) + 7 * 86400,
  },
})
check('bounty created', createRes.status === 200, createRes.body?.id ?? JSON.stringify(createRes.body))
const bountyId = createRes.body.id
const memo = createRes.body.memo

const hidden = await clientA(`/api/bounties`)
check('unfunded bounty is not listed publicly', !hidden.body.some(b => b.id === bountyId))

/** Builds, signs and broadcasts a basic transaction with an attached memo. */
async function sendFrom(keyPair, recipient, valueLuna, memoText) {
  const height = await rpc('getBlockNumber')
  const tx = Nimiq.TransactionBuilder.newBasicWithData(
    keyPair.toAddress(),
    Nimiq.Address.fromAny(recipient),
    new TextEncoder().encode(memoText),
    BigInt(valueLuna),
    BigInt(0),
    height,
    NETWORK_ID,
  )
  keyPair.signTransaction(tx)
  return rpc('sendRawTransaction', [tx.toHex()])
}

// Nimiq never includes a transaction whose sender and recipient are the same
// address, so the creator is staked from escrow first and then funds the
// bounty as a genuinely separate wallet.
const stakeHash = await sendFrom(escrowKey, creator.toAddress().toUserFriendlyAddress(), REWARD_LUNA, 'nqb:e2e:stake')
console.log(`staking the test creator ${stakeHash}`)
await waitForInclusion(stakeHash, 'creator staking')

const fundingHash = await sendFrom(creator, escrowAddress, REWARD_LUNA, memo)
console.log(`funding tx ${fundingHash}`)

// Testnet blocks land in about a second, so this call can legitimately race
// ahead to `verified`. What must never happen is the bounty going live off an
// unconfirmed hash, which the status values below both rule out.
const pendingRes = await clientA(`/api/bounties/${bountyId}/fund`, {
  method: 'POST',
  body: { txHash: fundingHash },
})
check('funding is never credited without a chain check',
  ['pending', 'verified'].includes(pendingRes.body?.status), pendingRes.body?.status)

await waitForInclusion(fundingHash, 'funding')

let fundRes
for (let attempt = 0; attempt < 20; attempt++) {
  fundRes = await clientA(`/api/bounties/${bountyId}/fund`, {
    method: 'POST',
    body: { txHash: fundingHash },
  })
  if (['verified', 'already_funded'].includes(fundRes.body?.status)) break
  await new Promise(resolve => setTimeout(resolve, 2000))
}
check('funding verified on chain',
  ['verified', 'already_funded'].includes(fundRes.body?.status), fundRes.body?.status)

const listed = await clientA('/api/bounties')
check('funded bounty appears in the public feed', listed.body.some(b => b.id === bountyId))
check('feed marks it verified', listed.body.find(b => b.id === bountyId)?.verified === true)

const replayFund = await clientA(`/api/bounties/${bountyId}/fund`, {
  method: 'POST',
  body: { txHash: fundingHash },
})
check('re-submitting the same funding tx does not double-credit',
  replayFund.body?.status === 'already_funded', replayFund.body?.status)

console.log('\n--- wallet B: discover and submit ---')
const clientB = makeClient()
const sessionB = await signIn(clientB, hunter)
check('hunter authenticates', sessionB.authenticated)

const detailB = await clientB(`/api/bounties/${bountyId}`)
check('hunter can view the bounty', detailB.status === 200)
check('hunter is not treated as the creator', detailB.body?.isCreator === false)

const submitRes = await clientB(`/api/bounties/${bountyId}/submissions`, {
  method: 'POST',
  body: { content: 'The loop bound should be < not <=. Fix linked.', link: 'https://example.com/fix' },
})
check('hunter submits work', submitRes.status === 200)

const selfSubmit = await clientA(`/api/bounties/${bountyId}/submissions`, {
  method: 'POST',
  body: { content: 'creator trying to enter their own bounty' },
})
check('creator cannot submit to their own bounty', selfSubmit.status === 403, String(selfSubmit.status))

console.log('\n--- wallet A: review, select, pay ---')
const detailA = await clientA(`/api/bounties/${bountyId}`)
check('creator sees the submission', detailA.body?.submissions?.length === 1)
const submissionId = detailA.body.submissions[0].id

const outsiderPay = await clientB(`/api/bounties/${bountyId}/winner`, {
  method: 'POST',
  body: { submissionId },
})
check('non-creator cannot select a winner', outsiderPay.status === 403, String(outsiderPay.status))

const winnerRes = await clientA(`/api/bounties/${bountyId}/winner`, {
  method: 'POST',
  body: { submissionId },
})
check('creator selects the winner', winnerRes.status === 200, winnerRes.body?.winnerAddress)

const hunterBefore = await rpc('getAccountByAddress', [hunterAddress])

const payRes = await clientA(`/api/bounties/${bountyId}/payout`, { method: 'POST' })
check('escrow broadcasts the payout', payRes.status === 200, payRes.body?.txHash)
const payoutHash = payRes.body?.txHash

// The critical safety property: a second payout must never happen.
const doublePay = await clientA(`/api/bounties/${bountyId}/payout`, { method: 'POST' })
check('second payout attempt is refused', doublePay.status === 409, String(doublePay.status))

await waitForInclusion(payoutHash, 'payout')

let verified
for (let attempt = 0; attempt < 20; attempt++) {
  verified = await clientA(`/api/bounties/${bountyId}/payout`)
  if (verified.body?.status === 'verified') break
  await new Promise(resolve => setTimeout(resolve, 2000))
}
check('payout verified on chain', verified.body?.status === 'verified', verified.body?.status)

console.log('\n--- final state ---')
const finalDetail = await clientA(`/api/bounties/${bountyId}`)
check('bounty is completed', finalDetail.body?.status === 'completed', finalDetail.body?.status)
check('payout recorded as verified', finalDetail.body?.payout?.status === 'verified')

const hunterAfter = await rpc('getAccountByAddress', [hunterAddress])
const delta = hunterAfter.balance - hunterBefore.balance
check('winner actually received the NIM', delta === REWARD_LUNA, `${delta / LUNA} NIM`)

const meB = await clientB('/api/me')
check('winner sees the reward in their history', meB.body?.stats?.earnedNim === REWARD_NIM,
  `${meB.body?.stats?.earnedNim} NIM`)

const escrowEnd = await rpc('getAccountByAddress', [escrowAddress])
console.log(`\nescrow ${escrowStart.balance / LUNA} -> ${escrowEnd.balance / LUNA} NIM`)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
