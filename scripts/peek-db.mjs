import { createClient } from '@libsql/client'

const db = createClient({ url: 'file:./.data/nimiq-bounty.db' })

async function show(label, sql) {
  const result = await db.execute(sql)
  console.log(`\n--- ${label} ---`)
  if (!result.rows.length) return console.log('(empty)')
  for (const row of result.rows) console.log(JSON.stringify(row))
}

await show('bounties', 'select id, title, status, reward_luna, funded_luna, funding_tx_hash from bounties order by created_at desc limit 5')
await show('transactions', 'select tx_hash, type, status, value_luna, memo, rejected_reason, from_address, to_address from transactions order by created_at desc limit 5')
await show('escrow_log', 'select event, detail, amount_luna, tx_hash from escrow_log order by created_at desc limit 10')
await show('payouts', 'select bounty_id, status, amount_luna, tx_hash, failure_reason from payouts order by claimed_at desc limit 5')
