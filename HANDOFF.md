# Nimiq Bounty — Handoff

Written 2026-07-28. Competition Cycle I closes **July 30**.

This file is the single source of truth for resuming work in a fresh session
with no prior context. Read it fully before changing anything.

---

## 1. What this is

A Nimiq Pay Mini App for the Nimiq Mini Apps Competition. Tagline: turn tasks
into funded opportunities. The differentiator is **Proof of Reward**: a bounty
cannot go live until its NIM reward has actually arrived in escrow and been
independently confirmed against the Nimiq testnet RPC.

Positioning: funded micro-bounties that live inside the wallet. Gitcoin,
Superteam Earn, Layer3 and Dework are all desktop apps targeting large bounties.
Nobody serves a 50–250 NIM task on a phone, and Nimiq's negligible fees make
that viable.

**Trust model, stated honestly everywhere:** Nimiq has no smart contracts, so
escrow is custodial, on testnet, with the key in a server env var. The platform
never picks winners or resolves disputes. Never describe this as trustless.

---

## 2. Status

### Done and verified

- **Phase 1: 8/8 on a real device inside Nimiq Pay.** Do not re-run or re-audit.
- **P0 vertical slice: 22/22 automated checks against the live testnet.**
  Run `node scripts/e2e-slice.mjs` to reproduce (dev server must be running).

The slice covers: create → fund → RPC-verify → activate → submit → review →
select winner → escrow payout → RPC-verify → completed, plus permission and
idempotency negative cases.

- **Light-theme UI shipped** across Home, Bounties, Create, Bounty detail,
  Submissions, Profile. Bottom nav has a raised Create button. All tap targets
  are >= 44px; no horizontal overflow at 375px.
- **Nine bounties seeded** (1075 NIM total), each backed by a real on-chain
  funding transaction. `scripts/seed-bounties.mjs` refuses to run if escrow
  cannot cover the total, so the app can never advertise more than it holds.

### Not done

- P1 polish: OG images, share links, toasts, richer empty/skeleton states.
- P2: AI Bounty Builder, winner share cards, leaderboards, reputation.
- Deployment, README, MIT licence, demo video, submission.

---

## 3. Hard-won facts. Do not re-derive these.

These cost real time to discover. Trust them.

1. **Nimiq Pay signs `sha256(prefix + utf8ByteLength + message)`**, where
   prefix is `\x16Nimiq Signed Message:\n`. Not raw UTF-8. Confirmed on device.
   See `signedMessageBytes()` in `server/utils/nimiq.ts`.
2. **`tx.from` is often NOT the user's wallet address.** Testnet faucet NIM
   lands in an HTLC contract and Nimiq Pay spends straight from it, so the
   sender is the contract. The contract's `sender` field holds the real user
   address. `resolveOriginator()` handles this. **Never gate funding on the
   sender** — it rejects every legitimate payment.
3. **Network ids: testnet = 5, mainnet = 24.** Values 1 and 42 are rejected.
4. **A transaction from an address to itself is never included.** Test funding
   must route through a separate wallet.
5. **`getTransactionByHash` returns the memo in `recipientData`; `data` is
   null.** `fetchTransaction()` normalises this.
6. **1 NIM = 100,000 Luna.** All amounts stored as integer Luna. No floats.
7. **Nitro auto-import silently omitted `nimToLuna`** from its generated
   exports, failing at runtime. All server routes now use **explicit imports**.
   Keep it that way for anything touching money.
8. **`@nimiq/core` WASM can segfault the dev server (exit 139) on hot reload.**
   It is cached on `globalThis` via a Symbol key, which reduced but did not
   eliminate this. It has only ever happened during a Nitro hot reload while
   editing server files, never while serving traffic, so it is a dev-loop
   annoyance rather than a production risk. If it becomes one, move the WASM
   load into a Nitro plugin with an explicit lifecycle. Just restart the dev
   server when it happens.
9. Public RPC endpoints (no uptime guarantee):
   testnet `https://rpc.testnet.nimiqwatch.com/`, mainnet `https://rpc.nimiqwatch.com/`.
   Explorer: `https://test.nimiq.watch/<txhash>`.
10. `npm install` fails with an arborist `edgesOut` crash on this npm version.
    **Always use `npm install --legacy-peer-deps`.**

---

## 4. Architecture

Nuxt 4 (Vue 3, TS) + Nitro server routes + Drizzle + libsql/SQLite + Tailwind 4.

```
server/utils/nimiq.ts      RPC client, signature verification, tx fetch, originator resolution
server/utils/escrow.ts     payWinner(), verifyPayout(), memos, escrow audit log
server/utils/session.ts    sealed-cookie sessions
server/utils/nonces.ts     single-use login nonces
server/db/schema.ts        8 tables
app/pages/                 index (browse), create, bounties/[id], me, probe
app/composables/useWallet.ts  provider init, connect+sign-in, sendWithMemo
scripts/e2e-slice.mjs      full lifecycle test against live testnet
scripts/smoke-auth.mjs     auth-only test
scripts/peek-db.mjs        dump recent DB rows
```

### Money-safety invariants. Do not weaken these.

- `transactions.tx_hash` is **unique** — one transaction can never be credited
  twice, or to two bounties.
- `payouts` is keyed by **bounty_id** — at most one payout per bounty, ever.
  The row is claimed *before* any NIM moves; a concurrent call collides and aborts.
- Payout amount is capped by chain-verified `fundedLuna`, never by `rewardLuna`.
- Before broadcasting, `payWinner` scans escrow's outgoing history for the
  bounty's payout memo and adopts an existing transaction rather than sending
  twice (crash recovery).
- On an unknown broadcast outcome the payout is marked failed and stops. It
  does **not** retry blind. That needs a human.
- Ledger rows are **upserted by tx_hash**, never re-inserted. Re-inserting was
  a real bug: the `pending` row collided with its own unique index once the
  transaction confirmed, permanently blocking activation.
- Memos bind money to intent: `nqb:fund:<bountyId>`, `nqb:pay:<bountyId>`.

---

## 5. Running it

```bash
cd nimiq-bounty
npm install --legacy-peer-deps
npm run dev            # binds 0.0.0.0:5173
```

Phone testing: PC is on the phone's hotspot at **172.19.118.42**. A firewall
rule named `Nimiq Bounty dev 5173` already exists. In Nimiq Pay: long-press
settings 10s → Testnet → "Get free NIM" (110,000 NIM) → Mini Apps →
`http://172.19.118.42:5173`.

`/probe` is the Phase 1 diagnostic page. Keep it; it is useful and harmless.

### Environment (`.env`, gitignored)

`NUXT_ESCROW_PRIVATE_KEY`, `NUXT_PUBLIC_ESCROW_ADDRESS`, `NUXT_NIMIQ_RPC_URL`,
`NUXT_PUBLIC_NIMIQ_NETWORK=test`, `NUXT_PUBLIC_EXPLORER_BASE`,
`NUXT_SESSION_PASSWORD`.

Escrow address `NQ58 0VK8 B79C DLSB PDCX 7RL3 L5C9 B3L0 E3RP`, testnet only,
holding ~3065 NIM against 1075 NIM of seeded obligations. Rotated on 2026-07-28
via `scripts/rotate-escrow.mjs`, which moves the balance and rewrites `.env`
without ever printing the private key. The previous key leaked into a chat
transcript and now controls an empty wallet. **Rotate again before any mainnet
use.**

### Hosted database

Turso, free tier, `libsql://nimiq-bounty-mzterwalexzyy.aws-eu-west-1.turso.io`
(AWS EU West, Ireland). Schema pushed, nine bounties seeded, full E2E green
against it. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in the deployment
environment alongside the `NUXT_*` vars.

**The Turso auth token leaked into a chat transcript on 2026-07-28.** Rotate it
in the Turso dashboard once deployment is stable.

---

## 6. Immediate next steps, in order

1. **Restyle to the light design direction (§7).** Highest remaining value:
   Design & UX is 25 of 105 competition points.
2. Two-phone manual run of the full lifecycle (wallet A creator, wallet B hunter).
3. Deploy: needs a hosted DB. Set `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`
   (libsql works on serverless; a local file does not persist on Vercel).
4. Public GitHub repo, **MIT licence** (a competition requirement), README
   documenting the custodial testnet trust model honestly.
5. Seed 8–10 good bounties so the app is never empty.
6. Submission: ≤250-word description, screenshots, demo video.
   Share via deeplink `nimiqpay://miniapp?url=<https url>`.

---

## 7. Design direction (from the user's references)

- **Light reference = the visual language.** White/near-white background,
  indigo/violet primary, soft rounded cards, pastel category tiles, a stats row,
  a "How it works" strip, bottom nav with a raised centre Create button.
- **Dark reference = page inventory only, not its visuals.** Screens: Home,
  Create (3 steps), Fund, Browse (Active / My Bounties / All), Bounty detail
  with submissions, Review submission, Select winner / Confirm payout,
  Completed, Profile.
- Worth stealing from the dark mock: escrow QR code, copyable memo field, and
  the completion checklist (Funding Confirmed → Submission Received → Winner
  Selected → Payment Sent → Verified On-Chain). That checklist *is* Proof of
  Reward made visible.
- **Keep the direct wallet call as the primary funding path.** The mock shows a
  QR and manual memo entry; inside Nimiq Pay we call
  `sendBasicTransactionWithData` directly, which is far better. Offer the
  QR/address/memo only as a fallback outside Nimiq Pay.
- Branding in the mocks ("PlayNimiq", "NimiqBounty") is not ours. Use
  **Nimiq Bounty**.

Constraints: mobile-first, 44px minimum tap targets, no horizontal scroll,
readable at 375px width.

---

## 8. Competition rules that constrain us

MIT licence in a public GitHub repo. No hardcoded credentials (env vars are
fine). Must be "fully functional, not a prototype". Description max 250 words.
Must support NIM or USDT; NIM earns bonus points. Scoring is 105 points across
Design & UX, Functionality, Usefulness & Originality, Marketing & Distribution,
plus 5 bonus.

**Open risk:** the rules do not address testnet vs mainnet. Testnet-only may
cost points on "distinct wallets that interacted" and on the "not a prototype"
requirement. The user chose testnet-only knowingly. Flag it in the README rather
than let a judge discover it.
