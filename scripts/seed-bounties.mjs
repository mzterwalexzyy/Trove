/**
 * Seeds the app with real, genuinely funded bounties.
 *
 * Every bounty here is backed by an actual on-chain transfer into escrow and
 * verified by the server exactly like a user's would be. Nothing is inserted
 * straight into the database, because a bounty that says "verified" without a
 * transaction behind it would make the product's core claim false.
 *
 * Escrow must hold at least the total of all rewards for the platform to be
 * solvent. The script refuses to run otherwise.
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

const BOUNTIES = [
  {
    title: 'Build a Nimiq Pay Mini App starter',
    description: 'Create a minimal but polished Mini App starter that connects to the Nimiq provider, reads the wallet address, and sends a NIM payment. It should work on a phone inside Nimiq Pay with no setup beyond npm install.',
    requirements: 'A public repo, a short README, and a screen recording of it running inside Nimiq Pay.',
    category: 'coding',
    rewardNim: 150,
    days: 6,
  },
  {
    title: 'Design a hero banner for a Nimiq community page',
    description: 'We need a modern hero banner that communicates speed and simplicity. It should work at 1200x600 and degrade well on mobile. Use the Nimiq palette but avoid the usual crypto cliches.',
    requirements: 'Source file plus exported PNG and SVG. Two concepts preferred.',
    category: 'design',
    rewardNim: 80,
    days: 4,
  },
  {
    title: 'Write clear docs for the Nimiq provider API',
    description: 'Turn the Nimiq provider method list into documentation a newcomer can actually follow, with a worked example for sending a transaction and handling user rejection.',
    requirements: 'Markdown file with runnable code samples.',
    category: 'content',
    rewardNim: 60,
    days: 5,
  },
  {
    title: 'Find a security flaw in this escrow flow',
    description: 'Our escrow settlement is custodial and testnet-only. Read the payout path and tell us how you would break it: double payouts, replay, race conditions, or accounting errors. Concrete reproductions beat speculation.',
    requirements: 'A written report with steps to reproduce. Responsible disclosure only.',
    category: 'security',
    rewardNim: 250,
    days: 7,
  },
  {
    title: 'Research: what makes wallet mini apps stick?',
    description: 'Survey mini app ecosystems (Telegram, LINE, WeChat, Base) and summarise what drives repeat use. We want patterns we can apply, not a feature list.',
    requirements: 'A short written summary with sources. Two pages is plenty.',
    category: 'research',
    rewardNim: 100,
    days: 8,
  },
  {
    title: 'Explain NIM to a complete beginner in 200 words',
    description: 'No jargon, no hype, no price talk. Explain what NIM is and why sending it feels different from a bank transfer, in language a fifteen year old would follow.',
    requirements: 'Plain text, 200 words or fewer.',
    category: 'content',
    rewardNim: 40,
    days: 3,
  },
  {
    title: 'Build a reusable NIM amount input component',
    description: 'A mobile-first input that handles NIM and Luna conversion without floating point errors, formats as you type, and refuses invalid amounts gracefully.',
    requirements: 'Vue or vanilla, with tests covering the rounding edge cases.',
    category: 'coding',
    rewardNim: 120,
    days: 6,
  },
  {
    title: 'Design an icon set for bounty categories',
    description: 'Seven category icons that read clearly at 20px on a phone: coding, security, design, content, research, community, other. Consistent stroke weight and optical sizing.',
    requirements: 'SVG set, single stroke weight, 24x24 grid.',
    category: 'design',
    rewardNim: 75,
    days: 5,
  },
  {
    title: 'Run a community challenge and report what happened',
    description: 'Organise a small challenge in a Nimiq community space, get at least ten people to take part, and write up what worked and what did not.',
    requirements: 'A write-up with links and rough participation numbers.',
    category: 'community',
    rewardNim: 200,
    days: 10,
  },
]

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
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    const text = await res.text()
    try { return { status: res.status, body: JSON.parse(text) } }
    catch { return { status: res.status, body: text } }
  }
}

async function send(keyPair, recipient, valueLuna, memo) {
  const height = await rpc('getBlockNumber')
  const tx = Nimiq.TransactionBuilder.newBasicWithData(
    keyPair.toAddress(),
    Nimiq.Address.fromAny(recipient),
    new TextEncoder().encode(memo),
    BigInt(valueLuna),
    BigInt(0),
    height,
    NETWORK_ID,
  )
  keyPair.signTransaction(tx)
  return rpc('sendRawTransaction', [tx.toHex()])
}

async function waitForInclusion(hash) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const tx = await rpc('getTransactionByHash', [hash])
      if (tx?.blockNumber > 0) return tx
    }
    catch { /* not indexed yet */ }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  throw new Error('transaction never landed')
}

const escrowKey = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(env.NUXT_ESCROW_PRIVATE_KEY))
const escrowAddress = escrowKey.toAddress().toUserFriendlyAddress()
const account = await rpc('getAccountByAddress', [escrowAddress])
const totalNim = BOUNTIES.reduce((sum, b) => sum + b.rewardNim, 0)

console.log(`escrow  ${escrowAddress}`)
console.log(`balance ${account.balance / LUNA} NIM`)
console.log(`seeding ${BOUNTIES.length} bounties totalling ${totalNim} NIM\n`)

// Solvency gate. Escrow must be able to honour every bounty it advertises.
if (account.balance < totalNim * LUNA) {
  console.log(`Refusing to seed: escrow holds ${account.balance / LUNA} NIM but would owe ${totalNim} NIM.`)
  console.log(`Top up ${escrowAddress} and run this again.`)
  process.exit(1)
}

let seeded = 0
for (const spec of BOUNTIES) {
  const creator = Nimiq.KeyPair.generate()
  const client = makeClient()
  const address = creator.toAddress().toUserFriendlyAddress()

  try {
    const challenge = await client('/api/auth/nonce', { method: 'POST', body: { address } })
    const signature = creator.sign(signedMessageBytes(challenge.body.message))
    await client('/api/auth/verify', {
      method: 'POST',
      body: {
        address,
        nonce: challenge.body.nonce,
        publicKey: creator.publicKey.toHex(),
        signature: signature.toHex(),
      },
    })

    const created = await client('/api/bounties', {
      method: 'POST',
      body: {
        title: spec.title,
        description: spec.description,
        requirements: spec.requirements,
        category: spec.category,
        rewardNim: spec.rewardNim,
        deadlineAt: Math.floor(Date.now() / 1000) + spec.days * 86400,
      },
    })
    if (created.status !== 200) throw new Error(JSON.stringify(created.body))

    const rewardLuna = spec.rewardNim * LUNA
    // Nimiq will not include a transaction sent to its own address, so the
    // seed creator is staked first and funds the bounty as a real third party.
    await waitForInclusion(await send(escrowKey, address, rewardLuna, 'nqb:seed'))
    const fundingHash = await send(creator, escrowAddress, rewardLuna, created.body.memo)
    await waitForInclusion(fundingHash)

    let funded = false
    for (let attempt = 0; attempt < 15; attempt++) {
      const result = await client(`/api/bounties/${created.body.id}/fund`, {
        method: 'POST',
        body: { txHash: fundingHash },
      })
      if (result.body?.status === 'verified' || result.body?.status === 'already_funded') {
        funded = true
        break
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    if (!funded) throw new Error('funding never verified')

    seeded++
    console.log(`  ok  ${spec.rewardNim.toString().padStart(3)} NIM  ${spec.title}`)
  }
  catch (error) {
    console.log(`  FAILED  ${spec.title}: ${error.message}`)
  }
}

const after = await rpc('getAccountByAddress', [escrowAddress])
console.log(`\nseeded ${seeded}/${BOUNTIES.length}`)
console.log(`escrow now ${after.balance / LUNA} NIM, owing ${totalNim} NIM`)
