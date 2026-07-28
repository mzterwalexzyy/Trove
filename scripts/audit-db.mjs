/**
 * Production-safety audit of the hosted Turso database.
 * Read-only. Reports what is actually there, not what the schema file claims.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'

const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const readEnv = key => raw.split('\n').find(l => l.startsWith(`${key}=`))?.slice(key.length + 1).trim()

const db = createClient({
  url: readEnv('TURSO_DATABASE_URL'),
  authToken: readEnv('TURSO_AUTH_TOKEN'),
})

let problems = 0
function check(label, ok, detail = '') {
  if (!ok) problems++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
}

const started = Date.now()
const tables = (await db.execute(
  "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name",
)).rows.map(r => r.name)
console.log(`connected in ${Date.now() - started}ms\n--- tables ---`)
console.log(tables.join(', '))

const expected = ['auth_nonces', 'bounties', 'escrow_log', 'payouts', 'reputation_events', 'submissions', 'transactions', 'users']
check('all expected tables exist', expected.every(t => tables.includes(t)),
  expected.filter(t => !tables.includes(t)).join(',') || '')

console.log('\n--- indexes ---')
const indexes = (await db.execute(
  "select name, tbl_name, sql from sqlite_master where type='index' order by tbl_name, name",
)).rows
for (const index of indexes) {
  const unique = /unique/i.test(index.sql ?? '') ? 'UNIQUE ' : ''
  console.log(`  ${unique}${index.tbl_name}.${index.name}`)
}

const hasIndex = name => indexes.some(i => i.name === name)
const isUnique = name => {
  const found = indexes.find(i => i.name === name)
  return found ? /unique/i.test(found.sql ?? '') : false
}

console.log('\n--- money-safety constraints ---')
check('transactions.tx_hash is UNIQUE', isUnique('transactions_hash_unique'))
check('submissions one-per-wallet is UNIQUE', isUnique('submissions_unique_participant'))

const payoutsPk = (await db.execute('pragma table_info(payouts)')).rows.find(r => r.pk === 1)
check('payouts primary key is bounty_id', payoutsPk?.name === 'bounty_id', payoutsPk?.name ?? 'none')

const usersPk = (await db.execute('pragma table_info(users)')).rows.find(r => r.pk === 1)
check('users primary key is address', usersPk?.name === 'address', usersPk?.name ?? 'none')

console.log('\n--- query indexes ---')
for (const name of ['bounties_status_idx', 'bounties_creator_idx', 'bounties_deadline_idx', 'submissions_bounty_idx', 'transactions_bounty_idx', 'escrow_log_bounty_idx', 'reputation_address_idx']) {
  check(`${name} exists`, hasIndex(name))
}

console.log('\n--- query plans for hot paths ---')
async function plan(label, sql) {
  const rows = (await db.execute(`explain query plan ${sql}`)).rows
  const detail = rows.map(r => r.detail).join(' | ')
  const scans = /SCAN/.test(detail) && !/SCAN (?:CONSTANT|SUBQUERY)/.test(detail)
  console.log(`  ${scans ? 'SCAN' : 'ok  '}  ${label}: ${detail}`)
  return scans
}

const feedScan = await plan('public feed', "select * from bounties where status='active' and deadline_at > 0 order by created_at desc limit 60")
const historyScan = await plan('my transactions', "select * from transactions where from_address='x' order by created_at desc limit 25")
const wonScan = await plan('my wins', "select * from payouts where winner_address='x'")
const enteredScan = await plan('my submissions', "select * from submissions where participant_address='x'")

console.log('\n--- data integrity ---')
const [{ c: orphanTx }] = (await db.execute(
  'select count(*) as c from transactions where bounty_id is not null and bounty_id not in (select id from bounties)',
)).rows
check('no transactions orphaned from bounties', Number(orphanTx) === 0, String(orphanTx))

const [{ c: dupHash }] = (await db.execute(
  'select count(*) as c from (select tx_hash from transactions group by tx_hash having count(*) > 1)',
)).rows
check('no duplicate tx hashes', Number(dupHash) === 0, String(dupHash))

const [{ c: overpaid }] = (await db.execute(
  'select count(*) as c from payouts p join bounties b on b.id = p.bounty_id where p.amount_luna > b.funded_luna',
)).rows
check('no payout exceeds its verified funding', Number(overpaid) === 0, String(overpaid))

const [{ c: unfundedActive }] = (await db.execute(
  "select count(*) as c from bounties where status='active' and (funded_luna <= 0 or funding_tx_hash is null)",
)).rows
check('no active bounty is unfunded', Number(unfundedActive) === 0, String(unfundedActive))

const [{ c: completedUnverified }] = (await db.execute(
  "select count(*) as c from bounties b left join payouts p on p.bounty_id = b.id where b.status='completed' and (p.status is null or p.status <> 'verified')",
)).rows
check('no completed bounty without a verified payout', Number(completedUnverified) === 0, String(completedUnverified))

console.log('\n--- solvency ---')
const [{ owed }] = (await db.execute(
  "select coalesce(sum(funded_luna), 0) as owed from bounties where status in ('active','payout_pending')",
)).rows
console.log(`  outstanding obligations: ${Number(owed) / 100000} NIM`)

console.log(`\n${problems === 0 ? 'NO SCHEMA PROBLEMS' : `${problems} PROBLEM(S)`}`)
console.log(`missing indexes on hot paths: ${[
  historyScan && 'transactions.from_address',
  wonScan && 'payouts.winner_address',
  enteredScan && 'submissions.participant_address',
  feedScan && 'bounties feed',
].filter(Boolean).join(', ') || 'none'}`)
