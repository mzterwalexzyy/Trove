<script setup lang="ts">
import { getHostLanguage, init, type NimiqProvider } from '@nimiq/mini-app-sdk'

type Status = 'idle' | 'running' | 'pass' | 'fail'

interface Check {
  id: number
  label: string
  status: Status
  detail: string
}

const config = useRuntimeConfig()
// Derived server-side from the escrow key rather than read from config.
const { data: escrow } = await useFetch<{ address: string }>('/api/escrow/status')
const escrowAddress = computed(() => escrow.value?.address ?? '')

const checks = reactive<Check[]>([
  { id: 1, label: 'Runs inside Nimiq Pay', status: 'idle', detail: '' },
  { id: 2, label: 'Nimiq provider initializes', status: 'idle', detail: '' },
  { id: 3, label: 'Wallet address is readable', status: 'idle', detail: '' },
  { id: 4, label: 'Wallet signs a login nonce', status: 'idle', detail: '' },
  { id: 5, label: 'Server verifies the signature', status: 'idle', detail: '' },
  { id: 6, label: 'Signing encoding identified', status: 'idle', detail: '' },
  { id: 7, label: 'Testnet NIM reaches escrow', status: 'idle', detail: '' },
  { id: 8, label: 'Server verifies funding on chain', status: 'idle', detail: '' },
])

function set(id: number, status: Status, detail = '') {
  const check = checks.find(c => c.id === id)!
  check.status = status
  check.detail = detail
}

const provider = shallowRef<NimiqProvider | null>(null)
const address = ref('')
const fundingHash = ref('')
const busy = ref(false)
const fatal = ref('')

/** SDK calls resolve to either the value or an `{ error }` object. */
function unwrap<T>(result: T | { error: { type: string, message: string } }): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as any).error.message || (result as any).error.type)
  }
  return result as T
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/reject|denied|cancel/i.test(message)) return 'Cancelled in the wallet'
  return message
}

onMounted(async () => {
  const language = getHostLanguage()
  if (!language && !window.nimiq) {
    set(1, 'fail', 'No Nimiq Pay host detected. Open this URL from Mini Apps inside Nimiq Pay.')
    fatal.value = 'Not running inside Nimiq Pay.'
    return
  }
  set(1, 'pass', `Host language: ${language ?? 'unknown'}`)

  set(2, 'running')
  try {
    provider.value = await init({ timeout: 10_000 })
    const [consensus, height] = await Promise.all([
      provider.value.isConsensusEstablished(),
      provider.value.getBlockNumber(),
    ])
    set(2, 'pass', `Consensus: ${consensus} · Block ${height.toLocaleString()}`)
  }
  catch (err) {
    set(2, 'fail', describe(err))
    fatal.value = 'The provider did not initialize.'
  }
})

async function connect() {
  if (!provider.value || busy.value) return
  busy.value = true
  set(3, 'running')
  try {
    const accounts = unwrap(await provider.value.listAccounts())
    if (!accounts.length) throw new Error('The wallet returned no accounts')
    address.value = accounts[0]!
    set(3, 'pass', accounts[0]!)
  }
  catch (err) {
    set(3, 'fail', describe(err))
  }
  finally {
    busy.value = false
  }
}

async function signIn() {
  if (!provider.value || !address.value || busy.value) return
  busy.value = true
  set(4, 'running')

  let challenge: { nonce: string, message: string }
  let signed: { publicKey: string, signature: string }

  // Signing is its own step: a later server failure must not retroactively
  // mark a signature that the wallet actually produced as failed.
  try {
    challenge = await $fetch('/api/auth/nonce', {
      method: 'POST',
      body: { address: address.value },
      timeout: 20_000,
    })
    signed = unwrap(await provider.value.sign(challenge.message))
    set(4, 'pass', `Signature ${signed.signature.slice(0, 16)}…`)
  }
  catch (err) {
    set(4, 'fail', describe(err))
    busy.value = false
    return
  }

  set(5, 'running')
  set(6, 'running')
  try {
    const result = await $fetch<{
      authenticated: boolean
      signatureValid: boolean
      boundToAddress: boolean
      encoding: string | null
      attempted: string[]
    }>('/api/auth/verify', {
      method: 'POST',
      body: {
        address: address.value,
        nonce: challenge.nonce,
        publicKey: signed.publicKey,
        signature: signed.signature,
      },
      timeout: 20_000,
    })

    if (result.authenticated) {
      set(5, 'pass', 'Signature verified and bound to this address')
      set(6, 'pass', `Encoding: ${result.encoding}`)
    }
    else if (result.signatureValid) {
      set(5, 'fail', 'Signature is valid but does not belong to this address')
      set(6, 'pass', `Encoding: ${result.encoding}`)
    }
    else {
      set(5, 'fail', 'No encoding matched. Tap again to retry.')
      set(6, 'fail', `Tried: ${result.attempted.join(', ')}`)
    }
  }
  catch (err) {
    // A nonce is single-use, so a retry needs a fresh one. Tapping again does
    // exactly that rather than replaying a spent challenge.
    set(5, 'fail', `${describe(err)} · Tap "Sign login nonce" again to retry`)
    set(6, 'idle', '')
  }
  finally {
    busy.value = false
  }
}

async function fundEscrow() {
  if (!provider.value || !address.value || busy.value) return
  busy.value = true
  set(7, 'running')

  const memo = "nqb:probe:phase1"
  let hash: string

  // Already sent once. Re-check the existing transaction rather than sending
  // a second one: retrying a confirmation must never move more money.
  if (fundingHash.value) {
    set(8, 'running', 'Re-checking on chain…')
    try {
      const verified = await pollFunding(fundingHash.value, memo)
      set(8, verified ? 'pass' : 'fail', verified ?? 'Still not confirmed. Tap again to re-check.')
    }
    catch (err) {
      set(8, 'fail', describe(err))
    }
    busy.value = false
    return
  }

  // Sending and confirming are separate outcomes. A confirmation failure must
  // not mask the fact that the wallet really did broadcast.
  try {
    hash = unwrap(await provider.value.sendBasicTransactionWithData({
      recipient: escrowAddress.value,
      value: 10 * 100_000, // 10 NIM in Luna
      data: memo,
    }))
    fundingHash.value = hash
    set(7, 'pass', `Submitted ${hash.slice(0, 16)}…`)
  }
  catch (err) {
    set(7, 'fail', describe(err))
    busy.value = false
    return
  }

  set(8, 'running', 'Waiting for the transaction to appear on chain…')
  try {
    const verified = await pollFunding(hash, memo)
    set(8, verified ? 'pass' : 'fail', verified
      ?? 'Not confirmed within 90 seconds. It may still land; tap again to re-check.')
  }
  catch (err) {
    set(8, 'fail', `${describe(err)} · tap again to re-check`)
  }
  finally {
    busy.value = false
  }
}

async function pollFunding(hash: string, memo: string): Promise<string | null> {
  for (let attempt = 0; attempt < 18; attempt++) {
    const result = await $fetch<any>('/api/funding/verify', {
      method: 'POST',
      body: {
        txHash: hash,
        expectedFrom: address.value,
        expectedAmountLuna: 10 * 100_000,
        expectedMemo: memo,
      },
      timeout: 20_000,
    })
    if (result.status === 'verified') {
      return `${result.tx.valueNim} NIM confirmed in block ${result.tx.blockNumber.toLocaleString()}`
    }
    if (result.status === 'rejected') {
      // Surface why it was refused. Reporting a rejection as a timeout sent me
      // looking in the wrong place once already.
      throw new Error(`Rejected: ${result.failedChecks.join(', ')}`)
    }
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  return null
}

const explorerUrl = computed(() =>
  fundingHash.value ? `${config.public.explorerBase}/${fundingHash.value}` : '',
)

const passed = computed(() => checks.filter(c => c.status === 'pass').length)
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-8">
    <header>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">
        Trove
      </p>
      <h1 class="mt-1 text-2xl font-bold">
        Phase 1 verification
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-slate-400">
        Proves the wallet, signing and on-chain verification path end to end before
        any product code is written.
      </p>
      <p class="mt-3 text-sm font-semibold text-slate-300">
        {{ passed }} of {{ checks.length }} checks passing
      </p>
    </header>

    <p v-if="fatal" class="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
      {{ fatal }}
    </p>

    <ol class="flex flex-col gap-2">
      <li
        v-for="check in checks"
        :key="check.id"
        class="rounded-xl bg-white/5 px-4 py-3"
      >
        <div class="flex items-start gap-3">
          <span
            class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            :class="{
              'bg-slate-700 text-slate-400': check.status === 'idle',
              'bg-sky-500/20 text-sky-300': check.status === 'running',
              'bg-emerald-500 text-slate-950': check.status === 'pass',
              'bg-rose-500 text-white': check.status === 'fail',
            }"
          >
            {{ check.status === 'pass' ? '✓' : check.status === 'fail' ? '✕' : check.id }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">{{ check.label }}</p>
            <p v-if="check.detail" class="mt-1 break-words text-xs leading-relaxed text-slate-400">
              {{ check.detail }}
            </p>
          </div>
        </div>
      </li>
    </ol>

    <div class="flex flex-col gap-3">
      <button
        class="min-h-[52px] rounded-xl bg-sky-500 px-5 font-semibold text-slate-950 disabled:opacity-40"
        :disabled="busy || !provider || !!address"
        @click="connect"
      >
        1 · Connect wallet
      </button>
      <button
        class="min-h-[52px] rounded-xl bg-sky-500 px-5 font-semibold text-slate-950 disabled:opacity-40"
        :disabled="busy || !address"
        @click="signIn"
      >
        2 · Sign login nonce
      </button>
      <button
        class="min-h-[52px] rounded-xl bg-emerald-500 px-5 font-semibold text-slate-950 disabled:opacity-40"
        :disabled="busy || !address"
        @click="fundEscrow"
      >
        3 · Send 10 testnet NIM to escrow
      </button>
    </div>

    <section class="rounded-xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-slate-400">
      <p class="font-semibold text-slate-300">Escrow address</p>
      <p class="mt-1 break-all font-mono">{{ escrowAddress }}</p>
      <p class="mt-3">Testnet only. This wallet holds no real value.</p>
      <a
        v-if="explorerUrl"
        :href="explorerUrl"
        target="_blank"
        rel="noopener"
        class="mt-3 inline-block text-sky-400 underline"
      >
        View funding transaction
      </a>
    </section>
  </main>
</template>
