import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * All NIM amounts are stored as integer Luna (1 NIM = 100,000 Luna).
 * Floating point never touches a balance.
 */

/**
 * Handles are self-declared, not verified. Nothing here proves the wallet
 * owner controls the account, so the UI says "linked", never "verified":
 * overstating it would undercut the one claim this product does prove.
 *
 * The cooldown is what gives them any weight at all. A handle that cannot be
 * swapped for two weeks is a weak commitment rather than a free-form field,
 * and it stops someone cycling through identities between bounties.
 */
export const users = sqliteTable('users', {
  address: text('address').primaryKey(),
  displayName: text('display_name'),
  xHandle: text('x_handle'),
  githubHandle: text('github_handle'),
  handlesChangedAt: integer('handles_changed_at'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  lastSeenAt: integer('last_seen_at').notNull().default(sql`(unixepoch())`),
}, table => [
  // One handle per wallet, and one wallet per handle. Without these a single
  // account could back several wallets and inherit their reputation.
  uniqueIndex('users_x_handle_unique').on(table.xHandle),
  uniqueIndex('users_github_handle_unique').on(table.githubHandle),
])

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
  type: text('type').notNull(), // 'fund' | 'payout' | 'referral'
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

/**
 * Records who referred a hunter to a bounty. The referrer earns a cut only if
 * the hunter they referred actually wins.
 *
 * The (bounty, hunter) pair is unique, so the first referrer recorded wins and
 * can never be overwritten by a later attribution. All the anti-abuse rules
 * (no self-referral, the creator is excluded, it must predate the submission)
 * are enforced server-side in `recordReferral`, never in the UI.
 */
export const referrals = sqliteTable('referrals', {
  id: text('id').primaryKey(),
  bountyId: text('bounty_id').notNull().references(() => bounties.id),
  hunterAddress: text('hunter_address').notNull(),
  referrerAddress: text('referrer_address').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, table => [
  uniqueIndex('referrals_unique_hunter').on(table.bountyId, table.hunterAddress),
  index('referrals_referrer_idx').on(table.referrerAddress),
])

/**
 * The referral leg of a payout. Keyed by bounty id exactly like `payouts`, so
 * at most one referral payment can ever exist per bounty. The row is claimed
 * before any NIM moves; a concurrent call collides on the primary key and
 * aborts. A bounty is only `completed` once both this leg and the winner leg
 * are confirmed on chain.
 */
export const referralPayouts = sqliteTable('referral_payouts', {
  bountyId: text('bounty_id').primaryKey().references(() => bounties.id),
  referrerAddress: text('referrer_address').notNull(),
  amountLuna: integer('amount_luna').notNull(),
  status: text('status').notNull().default('claimed'), // claimed | broadcast | verified | failed
  txHash: text('tx_hash'),
  claimedAt: integer('claimed_at').notNull().default(sql`(unixepoch())`),
  verifiedAt: integer('verified_at'),
  failureReason: text('failure_reason'),
}, table => [
  index('referral_payouts_referrer_idx').on(table.referrerAddress),
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
