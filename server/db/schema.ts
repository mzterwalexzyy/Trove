import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * All NIM amounts are stored as integer Luna (1 NIM = 100,000 Luna).
 * Floating point never touches a balance.
 */

export const users = sqliteTable('users', {
  address: text('address').primaryKey(),
  displayName: text('display_name'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  lastSeenAt: integer('last_seen_at').notNull().default(sql`(unixepoch())`),
})

/**
 * Bounty lifecycle:
 *   draft -> awaiting_funding -> active -> reviewing -> completed
 *                            \-> expired
 *                            \-> cancelled
 *
 * A bounty is only ever `active` once its funding transaction has been
 * independently confirmed against the chain.
 */
export const bounties = sqliteTable('bounties', {
  id: text('id').primaryKey(),
  creatorAddress: text('creator_address').notNull().references(() => users.address),
  title: text('title').notNull(),
  description: text('description').notNull(),
  requirements: text('requirements').notNull().default(''),
  category: text('category').notNull(),

  /** What the creator promised. */
  rewardLuna: integer('reward_luna').notNull(),
  /** What the chain confirmed actually arrived. Authoritative for payout. */
  fundedLuna: integer('funded_luna').notNull().default(0),

  status: text('status').notNull().default('draft'),
  deadlineAt: integer('deadline_at').notNull(),

  escrowAddress: text('escrow_address').notNull(),
  fundingTxHash: text('funding_tx_hash'),
  winnerAddress: text('winner_address'),

  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  fundedAt: integer('funded_at'),
  completedAt: integer('completed_at'),
}, table => [
  index('bounties_status_idx').on(table.status),
  index('bounties_creator_idx').on(table.creatorAddress),
  index('bounties_deadline_idx').on(table.deadlineAt),
])

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(),
  bountyId: text('bounty_id').notNull().references(() => bounties.id),
  participantAddress: text('participant_address').notNull().references(() => users.address),
  content: text('content').notNull(),
  link: text('link'),
  status: text('status').notNull().default('submitted'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, table => [
  // One submission per wallet per bounty. Revisions edit in place.
  uniqueIndex('submissions_unique_participant').on(table.bountyId, table.participantAddress),
  index('submissions_bounty_idx').on(table.bountyId),
  // Profile page: "bounties I entered".
  index('submissions_participant_idx').on(table.participantAddress),
])

/**
 * Ledger of every on-chain movement we know about. `txHash` is unique, so the
 * same transaction can never be credited twice however many times it is
 * submitted for verification.
 */
export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  txHash: text('tx_hash').notNull(),
  bountyId: text('bounty_id').references(() => bounties.id),
  type: text('type').notNull(), // 'fund' | 'payout'
  fromAddress: text('from_address').notNull(),
  toAddress: text('to_address').notNull(),
  valueLuna: integer('value_luna').notNull(),
  memo: text('memo').notNull().default(''),
  status: text('status').notNull().default('pending'), // pending | verified | rejected
  blockNumber: integer('block_number'),
  rejectedReason: text('rejected_reason'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  verifiedAt: integer('verified_at'),
}, table => [
  uniqueIndex('transactions_hash_unique').on(table.txHash),
  index('transactions_bounty_idx').on(table.bountyId),
  // Profile page: transaction history for one wallet.
  index('transactions_from_idx').on(table.fromAddress),
])

/**
 * Structural guarantee against double payout: the primary key is the bounty
 * id, so at most one payout can ever exist per bounty. The row is claimed
 * before any NIM moves, and a claim collision aborts the payout.
 */
export const payouts = sqliteTable('payouts', {
  bountyId: text('bounty_id').primaryKey().references(() => bounties.id),
  winnerAddress: text('winner_address').notNull(),
  amountLuna: integer('amount_luna').notNull(),
  status: text('status').notNull().default('claimed'), // claimed | broadcast | verified | failed
  txHash: text('tx_hash'),
  claimedAt: integer('claimed_at').notNull().default(sql`(unixepoch())`),
  verifiedAt: integer('verified_at'),
  failureReason: text('failure_reason'),
}, table => [
  // Profile page: "bounties I won".
  index('payouts_winner_idx').on(table.winnerAddress),
])

/** Append-only audit trail. Every escrow movement lands here, success or not. */
export const escrowLog = sqliteTable('escrow_log', {
  id: text('id').primaryKey(),
  bountyId: text('bounty_id'),
  event: text('event').notNull(),
  detail: text('detail').notNull().default(''),
  amountLuna: integer('amount_luna'),
  txHash: text('tx_hash'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, table => [
  index('escrow_log_bounty_idx').on(table.bountyId),
])

export const reputationEvents = sqliteTable('reputation_events', {
  id: text('id').primaryKey(),
  address: text('address').notNull().references(() => users.address),
  type: text('type').notNull(),
  bountyId: text('bounty_id').references(() => bounties.id),
  amountLuna: integer('amount_luna'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, table => [
  index('reputation_address_idx').on(table.address),
])

export const authNonces = sqliteTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  address: text('address').notNull(),
  used: integer('used').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
})
