# Nimiq Bounty

Turn tasks into funded opportunities.

A Nimiq Pay Mini App where anyone can post a task, fund it with NIM, receive
submissions, pick a winner, and pay them. Built for the Nimiq Mini Apps
Competition.

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

## How it works

```
create → fund with NIM → verify on chain → active → submissions
       → creator picks a winner → escrow pays → verify on chain → completed
```

Every step is visible on the bounty page as an auditable checklist.

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
- `payouts` is keyed by bounty id, so at most one payout can exist per bounty.
  The row is claimed before any NIM moves; a concurrent call collides and aborts.
- Winner selection is a compare-and-set on the bounty row, so concurrent
  requests cannot name different winners.
- Funding activation is a compare-and-set, so parallel confirmations cannot
  re-credit a bounty.
- Payout is capped by the chain-verified funded amount, never the advertised
  reward.
- Before broadcasting, the escrow scans its own outgoing history for the
  bounty's payout memo, so a crash mid-flight cannot double-send.
- All amounts are integer Luna (1 NIM = 100,000 Luna). No float touches a balance.
- The escrow address is derived from the private key rather than configured
  separately, so the two cannot drift apart.

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

The dev server binds to `0.0.0.0:5173`. Open the LAN URL from Nimiq Pay's Mini
Apps section on a phone (both on the same network). Switch Nimiq Pay to testnet
by long-pressing the settings button for ten seconds, then use "Get free NIM".

Environment variables are listed in `HANDOFF.md`.

## Tests

All run against the live Nimiq testnet. The dev server must be running.

```bash
node scripts/e2e-slice.mjs
```

```bash
node scripts/audit-concurrency.mjs
```

```bash
node scripts/audit-db.mjs
```

`e2e-slice` drives the whole lifecycle with two wallets and asserts the
winner's on-chain balance actually changed. `audit-concurrency` fires parallel
funding, winner-selection and payout requests and asserts no duplicate payment
occurs. `audit-db` checks schema constraints, query plans and solvency.

## Known limitations

- Testnet only. Real NIM is never at risk, and equally never at stake.
- Custodial escrow, as described above.
- The public RPC endpoints have no uptime guarantee.
- No dispute resolution. If a creator never selects a winner, the funds stay in
  escrow until they do.

## Licence

MIT. See [LICENSE](LICENSE).
