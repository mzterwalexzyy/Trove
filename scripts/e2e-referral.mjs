/**
 * End-to-end test of the referral leg against the real Nimiq testnet.
 *
 * Three wallets: A creates and funds, C refers, B is referred and wins. Both
 * payout legs are genuine escrow-signed transactions, verified against the
 * chain, and the test asserts the two legs sum to exactly the funded amount.
 *
 * Kept separate from e2e-slice.mjs so the passing P0 suite is not put at risk
 * by edits to it.
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
    .map((line) => {
      const index = line.indexOf('=')
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
    }),
)

let failures = 0
function check(label, condition, detail = '') {
  if (!condition) failures++
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
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
    try { body = JSON.parse(text) }
    catch { body = text }
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

console.log('--- setup ---')
const escrowKey = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(env.NUXT_ESCROW_PRIVATE_KEY))
const escrowAddress = escrowKey.toAddress().toUserFriendlyAddress()
const creator = Nimiq.KeyPair.generate()
const hunter = Nimiq.KeyPair.generate()
const referrer = Nimiq.KeyPair.generate()
const outsider = Nimiq.KeyPair.generate()

const hunterAddress = hunter.toAddress().toUserFriendlyAddress()
const referrerAddress = referrer.toAddress().toUserFriendlyAddress()

const escrowStart = await rpc('getAccountByAddress', [escrowAddress])
console.log(`escrow    ${escrowAddress}  ${escrowStart.balance / LUNA} NIM`)
console.log(`hunter    ${hunterAddress}`)
console.log(`referrer  ${referrerAddress}`)

// 20 NIM splits cleanly at 5%: 19 to the winner, 1 to the referrer.
const REWARD_NIM = 20
const REWARD_LUNA = REWARD_NIM * LUNA
if (escrowStart.balance < REWARD_LUNA * 2) {
  console.log('\nEscrow needs at least 40 NIM to run this test.')
  process.exit(1)
}

const clientA = makeClient()
const clientB = makeClient()
const clientC = makeClient()
const clientD = makeClient()

const sessionA = await signIn(clientA, creator)
const sessionB = await signIn(clientB, hunter)
const sessionC = await signIn(clientC, referrer)
await signIn(clientD, outsider)
check('all wallets authenticate', sessionA.authenticated && sessionB.authenticated && sessionC.authenticated)

console.log('\n--- create and fund ---')
const created = await clientA('/api/bounties', {
  method: 'POST',
  body: {
    title: 'E2E referral: write a NIM explainer',
    description: 'Automated end-to-end test bounty exercising the referral split.',
    requirements: 'Explain NIM in 200 words.',
    category: 'content',
    rewardNim: REWARD_NIM,
    deadlineAt: Math.floor(Date.now() / 1000) + 7 * 86400,
  },
})
check('bounty created', created.status === 200, created.body?.id ?? JSON.stringify(created.body))
const bountyId = created.body.id
const memo = created.body.memo

// Stake the creator from escrow, then fund: Nimiq never includes a
// transaction whose sender and recipient are the same address.
const stakeHash = await sendFrom(escrowKey, creator.toAddress().toUserFriendlyAddress(), REWARD_LUNA, 'nqb:e2e:stake')
await waitForInclusion(stakeHash, 'creator staking')
const fundHash = await sendFrom(creator, escrowAddress, REWARD_LUNA, memo)
await waitForInclusion(fundHash, 'funding')

const funded = await clientA(`/api/bounties/${bountyId}/fund`, { method: 'POST', body: { txHash: fundHash } })
check('funding verified on chain', funded.body?.status === 'verified', JSON.stringify(funded.body?.status))

console.log('\n--- anti-abuse rules ---')
const selfRefer = await clientB(`/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  body: { referrer: hunterAddress },
})
check('self-referral is rejected', selfRefer.status === 400, String(selfRefer.status))

const creatorRefer = await clientA(`/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  body: { referrer: referrerAddress },
})
check('creator cannot be referred', creatorRefer.status === 403, String(creatorRefer.status))

const unknownRefer = await clientB(`/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  body: { referrer: 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000' },
})
check('unknown referrer is rejected', unknownRefer.status === 400, String(unknownRefer.status))

const anonRefer = await fetch(`${BASE}/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ referrer: referrerAddress }),
})
check('referral requires a session', anonRefer.status === 401, String(anonRefer.status))

console.log('\n--- accept referral ---')
const accepted = await clientB(`/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  body: { referrer: referrerAddress },
})
check('referral recorded', accepted.body?.status === 'recorded', JSON.stringify(accepted.body?.status))
check('split is disclosed to the hunter',
  accepted.body?.winnerNim === 19 && accepted.body?.referralNim === 1,
  `winner ${accepted.body?.winnerNim} / referrer ${accepted.body?.referralNim}`)

// Rule: the referrer can never be swapped for another one.
const swap = await clientB(`/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  body: { referrer: outsider.toAddress().toUserFriendlyAddress() },
})
check('referrer cannot be replaced',
  swap.body?.status === 'already_recorded' && swap.body?.referrerAddress.replace(/\s/g, '') === referrerAddress.replace(/\s/g, ''),
  JSON.stringify(swap.body?.status))

console.log('\n--- submit, then try to attach a referral late ---')
const submitted = await clientB(`/api/bounties/${bountyId}/submissions`, {
  method: 'POST',
  body: { content: 'Here is my 200-word explainer.', link: 'https://example.com/entry' },
})
check('hunter submits', submitted.status === 200, String(submitted.status))

const lateRefer = await clientD(`/api/bounties/${bountyId}/refer`, {
  method: 'POST',
  body: { referrer: referrerAddress },
})
// The outsider has not submitted, so this one is allowed; the rule is
// specifically that *your own* submission closes the window.
check('a hunter who has not submitted can still accept', lateRefer.status === 200, String(lateRefer.status))

const detail = await clientB(`/api/bounties/${bountyId}`)
check('hunter sees their own referral', detail.body?.referral?.mine?.referrerAddress?.replace(/\s/g, '') === referrerAddress.replace(/\s/g, ''))
check('net-to-winner is disclosed', detail.body?.referral?.winnerNim === 19, String(detail.body?.referral?.winnerNim))

console.log('\n--- select winner and pay both legs ---')
const submissionId = detail.body.submissions[0].id
const winner = await clientA(`/api/bounties/${bountyId}/winner`, {
  method: 'POST',
  body: { submissionId },
})
check('winner selected', winner.status === 200, String(winner.status))

const paid = await clientA(`/api/bounties/${bountyId}/payout`, { method: 'POST' })
check('winner leg broadcast', paid.status === 200 && Boolean(paid.body?.txHash), String(paid.status))
check('referral leg broadcast', Boolean(paid.body?.referral?.txHash), JSON.stringify(paid.body?.referralError))

check('legs sum to exactly the funded amount',
  paid.body?.amountNim + paid.body?.referral?.amountNim === REWARD_NIM,
  `${paid.body?.amountNim} + ${paid.body?.referral?.amountNim} = ${REWARD_NIM}`)

await waitForInclusion(paid.body.txHash, 'winner payout')
await waitForInclusion(paid.body.referral.txHash, 'referral payout')

console.log('\n--- verify both legs on chain ---')
let settled = null
for (let attempt = 0; attempt < 20; attempt++) {
  settled = await clientA(`/api/bounties/${bountyId}/payout`)
  if (settled.body?.status === 'verified' && settled.body?.referral?.status === 'verified') break
  await new Promise(resolve => setTimeout(resolve, 3000))
}
check('winner payout verified', settled.body?.status === 'verified', String(settled.body?.status))
check('referral payout verified', settled.body?.referral?.status === 'verified', String(settled.body?.referral?.status))

const final = await clientA(`/api/bounties/${bountyId}`)
check('bounty completed only after both legs', final.body?.status === 'completed', String(final.body?.status))

console.log('\n--- idempotency ---')
const replay = await clientA(`/api/bounties/${bountyId}/payout`, { method: 'POST' })
check('a second payout is refused', replay.status === 409, String(replay.status))

const [winnerAcct, referrerAcct] = await Promise.all([
  rpc('getAccountByAddress', [hunterAddress]),
  rpc('getAccountByAddress', [referrerAddress]),
])
check('winner received 19 NIM', winnerAcct.balance === 19 * LUNA, `${winnerAcct.balance / LUNA} NIM`)
check('referrer received 1 NIM', referrerAcct.balance === 1 * LUNA, `${referrerAcct.balance / LUNA} NIM`)

console.log(`\n${failures === 0 ? 'ALL REFERRAL CHECKS PASSED' : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
