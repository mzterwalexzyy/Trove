# Trove

Turn tasks into funded opportunities.

A Nimiq Pay Mini App where anyone can post a task, fund it with NIM, receive
submissions, pick a winner, and pay them. Built for the Nimiq Mini Apps
Competition.

**Live:** https://trove-nimiq.vercel.app · **In the wallet:**
`nimiqpay://miniapp?url=trove-nimiq.vercel.app`

`/` is the landing page for the web. `/app` is the Mini App. A Nimiq Pay
deeplink can only carry a bare domain, so `/` forwards to `/app` when it
detects the wallet.

## Proof of Reward

Most bounty boards ask you to trust that the money exists. This one doesn't.

A bounty cannot go live until its reward has actually arrived in escrow and the
server has independently confirmed the transaction against the Nimiq testnet
RPC. The interface keeps three facts separate that other platforms blur into
one number:

- **Reward** — what the creator promised
- **Funded** — what actually arrived on chain
- **Verified** — that we confirmed it ourselves, with a transaction hash and an
  explorer link

A hash returned by a wallet is only a claim. Nothing is marked funded or paid
until the chain says so.

## The lifecycle

```
create → fund with NIM → verify on chain → active → submissions
       → entries close → creator picks a winner → escrow pays
       → verify on chain → completed
```

Every step is visible on the bounty page as an auditable checklist.

Entries close before a winner can be chosen. Awarding while a bounty is still
open would let a creator end it under someone who is midway through their
submission, with no warning and no recourse.

## Features

### Bounties

Post a task with a title, description, requirements, category, NIM reward and
deadline. It stays private until funding confirms, so the feed never advertises
a reward that isn't there. Browse by category, sort by ending soonest or
highest reward.

### Referrals

A hunter can share a bounty and earn 5% of the reward if the person they
referred goes on to win.

The split is integer Luna with the remainder to the winner, so the two legs sum
to exactly the verified funded amount and no Luna is lost to rounding. Both
figures are disclosed to the referred hunter *before* they accept, because
someone who sees "250 NIM" and receives 237.5 has been misled.

Payment is two transactions with two verifications. The referral leg has its
own claim row keyed by bounty id, exactly like the winner leg, so a second
referral payment is structurally impossible. A bounty only reaches `completed`
once both legs confirm on chain; a half-settled payout stays open and
resumable rather than looking finished.

Anti-abuse rules are enforced server-side, never in the UI:

- a wallet cannot refer itself
- the bounty creator can neither refer nor be referred
- the referral must be recorded before the hunter submits
- one referrer per (bounty, hunter), and it can never be replaced
- the referrer must be a wallet the system has seen before

### Keeper

An assistant that turns a sentence into a structured bounty draft: title,
description, requirements, category, suggested reward and deadline.

Keeper lives in a draggable bubble available across the app, so a task can be
captured the moment it occurs to someone. It hands the draft to the create
form, where the creator edits every field and submits it themselves.

**Keeper never publishes, funds, pays, or picks winners.** It drafts and stops.
That boundary is what makes it safe to put an assistant next to a payment
product. Model output is clamped to what the create endpoint would accept
anyway, so a bad draft cannot produce an invalid bounty or an absurd reward.

The API key is server-side only. Two providers are tried in order, and with no
key configured the create form simply stays manual rather than erroring —
Keeper being unavailable is a supported state, not a broken one.

### Leaderboards

Top earners, funders and referrers, counted only from payouts confirmed on
chain. A leaderboard built on unverified intent would be the easiest place in
the product to quietly overstate activity.

### Profiles

Wallet identity with created, entered and won history, plus transaction
receipts linking to the explorer. Wallets can record an X and a GitHub
username, unique per wallet so one account cannot back several, changeable once
every 14 days.

These handles are **self-declared, not verified**. Nothing proves the wallet
owner controls the account, and the API says `verified: false` explicitly. The
cooldown is what gives them weight: a handle that cannot be swapped for two
weeks is a weak commitment rather than a free-form field.

### Interface

Mobile-first, built for the Nimiq Pay WebView. Light and dark themes from one
set of semantic tokens, resolved before first paint so the page never flashes.
Motion is transform and opacity only and collapses under
`prefers-reduced-motion`.

## Trust model, stated plainly

Nimiq has no smart contracts, so this escrow is **custodial**, running on
**testnet only**. The escrow key lives in a server-side environment variable.

This is not trustless escrow and is not described as such anywhere in the
product. The platform never picks winners and never resolves disputes: the
creator explicitly selects a winner and explicitly confirms the payout. What
the platform does guarantee is that the money is really there, really arrived,
and that a bounty can only ever pay out once.

## Money-safety design

The constraints below are structural, not conventions, and are covered by
automated tests that fire genuinely parallel requests at the live testnet.

- `transactions.tx_hash` is unique, so one transaction can never be credited
  twice or to two different bounties.
- `payouts` and `referral_payouts` are each keyed by bounty id, so at most one
  of each can exist per bounty. The row is claimed before any NIM moves; a
  concurrent call collides and aborts.
- Winner selection is a compare-and-set on the bounty row, so concurrent
  requests cannot name different winners.
- Funding activation is a compare-and-set, so parallel confirmations cannot
  re-credit a bounty.
- Payout is capped by the chain-verified funded amount, never the advertised
  reward.
- Before broadcasting, the escrow scans its own outgoing history for the
  bounty's payout memo, so a crash mid-flight cannot double-send.
- On an unknown broadcast outcome the payout is marked failed and stops. It
  does not retry blind.
- All amounts are integer Luna (1 NIM = 100,000 Luna). No float touches a balance.
- The escrow address is derived from the private key rather than configured
  separately, so the two cannot drift apart.
- Wallet login is a signed nonce, single-use and consumed before the signature
  is checked, verified server-side and bound to the claiming address.

## Stack

Nuxt 4 (Vue 3, TypeScript), Nitro server routes, Drizzle ORM, Turso (libSQL),
Tailwind CSS 4, `@nimiq/mini-app-sdk` for the wallet and `@nimiq/core` for
server-side signature verification and transaction signing.

## Running locally

```bash
npm install --legacy-peer-deps
```

```bash
npm run dev
```

Copy `.env.example` to `.env` and fill it in. The dev server binds to
`0.0.0.0:5173`. Open the LAN URL from Nimiq Pay's Mini Apps section on a phone
(both on the same network). Switch Nimiq Pay to testnet by long-pressing the
settings button for ten seconds, then use "Get free NIM".

## Tests

All run against the live Nimiq testnet with real transactions. The dev server
must be running.

```bash
node scripts/e2e-slice.mjs
```

```bash
node scripts/e2e-referral.mjs
```

```bash
node scripts/audit-concurrency.mjs
```

```bash
node scripts/audit-db.mjs
```

`e2e-slice` drives the whole lifecycle with two wallets and asserts the
winner's on-chain balance actually changed. `e2e-referral` adds a third wallet,
exercises every anti-abuse rule, settles both payout legs and asserts the split
sums to exactly the funded amount. `audit-concurrency` fires parallel funding,
winner-selection and payout requests and asserts no duplicate payment occurs.
`audit-db` checks schema constraints, query plans and solvency.

Both end-to-end suites create a bounty with a short entry window and wait for
it to close, because a winner cannot be selected while a bounty is still open.

## Known limitations

- Testnet only. Real NIM is never at risk, and equally never at stake.
- Custodial escrow, as described above.
- Social handles are self-declared; there is no OAuth ownership check.
- Keeper drafts one bounty at a time and holds no conversation history.
- The public RPC endpoints have no uptime guarantee.
- No dispute resolution. If a creator never selects a winner, the funds stay in
  escrow until they do.

## Licence

MIT. See [LICENSE](LICENSE).
