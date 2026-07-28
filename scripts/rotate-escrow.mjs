/**
 * Rotates the escrow wallet to a fresh keypair and moves the balance across.
 *
 * The new private key is written straight into .env and never printed, so it
 * does not end up in a terminal scrollback or a chat log. Only the new public
 * address is shown.
 *
 * Run this before seeding: bounties record the escrow address they were funded
 * into, so rotating afterwards would leave them pointing at the old wallet.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import * as Nimiq from '@nimiq/core'

const RPC = 'https://rpc.testnet.nimiqwatch.com/'
const NETWORK_ID = 5
const LUNA = 100_000
const ENV_PATH = new URL('../.env', import.meta.url)

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

const raw = readFileSync(ENV_PATH, 'utf8')
const readEnv = key => raw.split('\n').find(l => l.startsWith(`${key}=`))?.slice(key.length + 1).trim()

const oldKey = Nimiq.KeyPair.derive(Nimiq.PrivateKey.fromHex(readEnv('NUXT_ESCROW_PRIVATE_KEY')))
const oldAddress = oldKey.toAddress().toUserFriendlyAddress()
const account = await rpc('getAccountByAddress', [oldAddress])

console.log(`old escrow ${oldAddress}`)
console.log(`balance    ${account.balance / LUNA} NIM`)

if (account.balance === 0) {
  console.log('Nothing to move. Rotating the key anyway.')
}

const newKey = Nimiq.KeyPair.generate()
const newAddress = newKey.toAddress().toUserFriendlyAddress()
console.log(`new escrow ${newAddress}`)

if (account.balance > 0) {
  const height = await rpc('getBlockNumber')
  const tx = Nimiq.TransactionBuilder.newBasicWithData(
    oldKey.toAddress(),
    newKey.toAddress(),
    new TextEncoder().encode('nqb:escrow:rotate'),
    BigInt(account.balance),
    BigInt(0),
    height,
    NETWORK_ID,
  )
  oldKey.signTransaction(tx)
  tx.verify(NETWORK_ID)
  const hash = await rpc('sendRawTransaction', [tx.toHex()])
  console.log(`transfer   ${hash}`)

  let landed = false
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const found = await rpc('getTransactionByHash', [hash])
      if (found?.blockNumber > 0) { landed = true; break }
    }
    catch { /* not indexed yet */ }
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  if (!landed) {
    console.log('\nThe transfer has not confirmed. .env was NOT changed; re-run once it lands.')
    process.exit(1)
  }
}

// Only rewrite .env after the funds have actually arrived.
const updated = raw
  .replace(/^NUXT_ESCROW_PRIVATE_KEY=.*$/m, `NUXT_ESCROW_PRIVATE_KEY=${newKey.privateKey.toHex()}`)
  .replace(/^NUXT_PUBLIC_ESCROW_ADDRESS=.*$/m, `NUXT_PUBLIC_ESCROW_ADDRESS=${newAddress}`)
writeFileSync(ENV_PATH, updated)

const after = await rpc('getAccountByAddress', [newAddress])
console.log(`\n.env updated. New escrow holds ${after.balance / LUNA} NIM.`)
console.log('Restart the dev server so it picks up the new key.')
