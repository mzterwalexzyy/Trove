<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string

const { isConnected, isInsideNimiqPay, connect, connecting } = useWallet()
const toast = useToast()
const { data: bounty, pending, error, refresh } = await useFetch<any>(`/api/bounties/${id}`)

useHead(() => ({ title: bounty.value?.title ?? 'Bounty' }))

const meta = computed(() => category(bounty.value?.category ?? 'other'))
const remaining = computed(() => bounty.value ? timeLeft(bounty.value.deadlineAt) : null)
const isOpen = computed(() => bounty.value?.status === 'active' && remaining.value)
const payAmount = computed(() =>
  bounty.value ? Math.min(bounty.value.rewardNim, bounty.value.fundedNim) : 0)

/** Proof of Reward, rendered as a lifecycle the user can audit. */
const checklist = computed(() => {
  const b = bounty.value
  if (!b) return []
  return [
    { label: 'Funding confirmed on chain', done: b.verified },
    { label: 'Submission received', done: b.submissionCount > 0 },
    { label: 'Winner selected', done: Boolean(b.winnerAddress) },
    { label: 'Payment sent from escrow', done: Boolean(b.payout?.txHash) },
    { label: 'Payout verified on chain', done: b.payout?.status === 'verified' },
  ]
})

// Submitting
const submission = reactive({ content: '', link: '' })
const submitting = ref(false)
const submitError = ref('')
const showSubmit = ref(false)

async function submitWork() {
  if (submitting.value) return
  submitError.value = ''
  if (!isConnected.value && !(await connect())) return

  submitting.value = true
  try {
    await $fetch(`/api/bounties/${id}/submissions`, {
      method: 'POST',
      body: { content: submission.content.trim(), link: submission.link.trim() || undefined },
      timeout: 20_000,
    })
    showSubmit.value = false
    toast.success('Submission sent. It is now under review.')
    await refresh()
  }
  catch (err: any) {
    submitError.value = err?.statusMessage ?? describeError(err)
  }
  finally {
    submitting.value = false
  }
}

// Winner selection and payout
const confirming = ref<{ submissionId: string, address: string } | null>(null)
const paying = ref(false)
const payStage = ref<TxStage>('idle')
const payError = ref('')

async function confirmWinner() {
  if (!confirming.value || paying.value) return
  paying.value = true
  payError.value = ''

  try {
    payStage.value = 'preparing'
    await $fetch(`/api/bounties/${id}/winner`, {
      method: 'POST',
      body: { submissionId: confirming.value.submissionId },
      timeout: 20_000,
    })

    payStage.value = 'wallet'
    await $fetch(`/api/bounties/${id}/payout`, { method: 'POST', timeout: 30_000 })

    payStage.value = 'verifying'
    await pollPayout()

    payStage.value = 'confirmed'
    toast.success('Reward released and verified on chain.')
    await new Promise(resolve => setTimeout(resolve, 750))
    confirming.value = null
    payStage.value = 'idle'
    await refresh()
  }
  catch (err: any) {
    payStage.value = 'failed'
    payError.value = err?.statusMessage ?? describeError(err)
  }
  finally {
    paying.value = false
  }
}

async function pollPayout() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const result = await $fetch<{ status: string }>(`/api/bounties/${id}/payout`, { timeout: 20_000 })
    if (result.status === 'verified') return
    if (result.status === 'rejected') throw new Error('The payout did not match what we expected')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error('Not confirmed yet. Reopen this page to re-check; the reward is not sent twice.')
}
</script>

<template>
  <div v-if="pending" class="flex flex-col gap-3 px-4 pt-6">
    <div class="skeleton h-7 w-2/3" />
    <div class="skeleton h-44" />
    <div class="skeleton h-32" />
  </div>

  <div v-else-if="error" class="px-4 pt-6">
    <div class="card px-6 py-10 text-center">
      <p class="text-[15px] font-semibold">This bounty is not available</p>
      <p class="mt-1 text-[13px] text-muted">It may have been removed, or it is not funded yet.</p>
      <NuxtLink to="/bounties" class="mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-brand px-6 text-sm font-semibold text-white">
        Browse bounties
      </NuxtLink>
    </div>
  </div>

  <div v-else-if="bounty" class="px-4 pt-4">
    <NuxtLink to="/bounties" class="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-muted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
        <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Bounties
    </NuxtLink>

    <header class="mt-1 px-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-md px-2 py-0.5 text-[11px] font-medium" :class="meta.tint">{{ meta.label }}</span>
        <span v-if="remaining" class="text-[11px] font-medium text-muted">{{ remaining }} left</span>
        <span v-else class="text-[11px] font-medium text-muted">Closed</span>
      </div>
      <h1 class="mt-2 text-[22px] leading-tight font-bold tracking-tight">{{ bounty.title }}</h1>
      <p class="mt-1.5 text-[12px] text-muted">
        By {{ shortAddress(bounty.creatorAddress) }} ·
        {{ bounty.submissionCount }} {{ bounty.submissionCount === 1 ? 'entry' : 'entries' }}
      </p>
    </header>

    <div class="mt-4">
      <ProofOfReward
        :reward-nim="bounty.rewardNim"
        :funded-nim="bounty.fundedNim"
        :verified="bounty.verified"
        :explorer-url="bounty.fundingExplorerUrl"
        :escrow-address="bounty.escrowAddress"
      />
    </div>

    <!-- Completed -->
    <section v-if="bounty.payout?.status === 'verified'" class="card pop-in mt-3 px-5 py-6 text-center">
      <span class="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" class="size-8 text-success">
          <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <p class="mt-3 text-[17px] font-bold">Bounty completed</p>
      <p class="mt-1 text-xl font-bold text-success tabular-nums">
        {{ formatNim(bounty.payout.amountNim) }} NIM sent
      </p>
      <p class="mt-1 text-[12px] text-muted">
        Paid to <span class="font-mono">{{ shortAddress(bounty.payout.winnerAddress) }}</span>
      </p>
      <a
        v-if="bounty.payout.explorerUrl"
        :href="bounty.payout.explorerUrl"
        target="_blank"
        rel="noopener"
        class="mt-4 flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-brand-soft text-[13px] font-semibold text-brand"
      >
        View on explorer
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
          <path d="M7 17 17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
    </section>

    <!-- Lifecycle audit trail -->
    <section class="card mt-3 px-5 py-4">
      <h2 class="text-[13px] font-bold">Proof of reward</h2>
      <ul class="mt-3 flex flex-col gap-2.5">
        <li v-for="(item, index) in checklist" :key="item.label" v-reveal="index" class="flex items-center gap-2.5 text-[13px]">
          <span
            class="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
            :class="item.done ? 'bg-success text-white' : 'bg-[#e6e4ee] text-transparent'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" class="size-2.5">
              <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span :class="item.done ? 'font-medium' : 'text-muted'">{{ item.label }}</span>
        </li>
      </ul>
    </section>

    <section v-reveal="0" class="card mt-3 px-5 py-4">
      <h2 class="text-[13px] font-bold">Description</h2>
      <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ bounty.description }}</p>

      <template v-if="bounty.requirements">
        <h2 class="mt-4 border-t border-line pt-4 text-[13px] font-bold">Requirements</h2>
        <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ bounty.requirements }}</p>
      </template>
    </section>

    <!-- Creator review -->
    <section v-if="bounty.isCreator" class="mt-4">
      <h2 class="px-1 text-[15px] font-bold">Submissions ({{ bounty.submissions.length }})</h2>

      <p v-if="!bounty.submissions.length" class="card mt-2 px-6 py-8 text-center text-[13px] leading-relaxed text-muted">
        No submissions yet.<br>Share the bounty to get eyes on it.
      </p>

      <div v-else class="mt-2 flex flex-col gap-2.5">
        <article
          v-for="(entry, index) in bounty.submissions"
          :key="entry.id"
          v-reveal="index"
          class="card px-4 py-4"
          :class="entry.status === 'winner' ? 'ring-1 ring-success/30' : ''"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-mono text-[12px] text-muted">{{ shortAddress(entry.participantAddress) }}</p>
            <span
              v-if="entry.status === 'winner'"
              class="rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success"
            >
              Winner
            </span>
          </div>
          <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ entry.content }}</p>
          <a
            v-if="entry.link"
            :href="entry.link"
            target="_blank"
            rel="noopener"
            class="mt-2 inline-block break-all text-[12px] font-medium text-brand underline"
          >
            {{ entry.link }}
          </a>

          <button
            v-if="bounty.status !== 'completed' && !bounty.payout && bounty.fundedNim > 0"
            class="mt-3 min-h-[48px] w-full rounded-xl bg-brand text-[13px] font-bold text-white"
            @click="confirming = { submissionId: entry.id, address: entry.participantAddress }"
          >
            Pay {{ formatNim(payAmount) }} NIM to this wallet
          </button>
        </article>
      </div>
    </section>

    <!-- Hunter view -->
    <section v-else-if="isOpen" class="mt-4">
      <div v-if="bounty.mySubmission" class="card px-4 py-4">
        <p class="text-[13px] font-bold">Your submission</p>
        <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ bounty.mySubmission.content }}</p>
        <p class="mt-3 text-[12px] text-muted">
          {{ bounty.mySubmission.status === 'winner' ? 'You won this bounty.' : 'Waiting for the creator to review.' }}
        </p>
        <button
          v-if="bounty.mySubmission.status !== 'winner'"
          class="mt-3 min-h-[48px] w-full rounded-xl bg-canvas text-[13px] font-semibold text-muted"
          @click="showSubmit = true; submission.content = bounty.mySubmission.content; submission.link = bounty.mySubmission.link ?? ''"
        >
          Edit submission
        </button>
      </div>

      <button
        v-else-if="!showSubmit"
        class="pressable min-h-[52px] w-full rounded-xl bg-brand text-sm font-bold text-white"
        @click="showSubmit = true"
      >
        Submit your solution
      </button>

      <div v-if="showSubmit" class="card mt-2.5 flex flex-col gap-3 px-4 py-4">
        <textarea
          v-model="submission.content"
          rows="5"
          maxlength="4000"
          placeholder="Describe what you did and why it solves the task."
          class="rounded-xl border border-line bg-canvas p-4 text-sm outline-none focus:border-brand"
        />
        <input
          v-model="submission.link"
          type="url"
          inputmode="url"
          placeholder="Link to your work (optional)"
          class="min-h-[48px] rounded-xl border border-line bg-canvas px-4 text-sm outline-none focus:border-brand"
        >
        <p v-if="submitError" class="rounded-xl bg-[#fdeaea] px-3 py-2.5 text-[13px] text-[#c0392b]">
          {{ submitError }}
        </p>
        <div class="flex gap-2.5">
          <button
            class="min-h-[52px] rounded-xl bg-canvas px-6 text-[13px] font-semibold text-muted"
            :disabled="submitting"
            @click="showSubmit = false"
          >
            Cancel
          </button>
          <button
            class="pressable min-h-[52px] flex-1 rounded-xl bg-brand text-[13px] font-bold text-white disabled:opacity-40"
            :disabled="submitting || connecting || submission.content.trim().length < 3 || !isInsideNimiqPay"
            @click="submitWork"
          >
            {{ submitting ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
        <p v-if="!isInsideNimiqPay" class="text-[12px] text-[#8a5d05]">
          Open in Nimiq Pay to submit and get paid.
        </p>
      </div>
    </section>

    <p
      v-else-if="bounty.status !== 'completed'"
      class="card mt-4 px-6 py-8 text-center text-[13px] text-muted"
    >
      This bounty is closed to new submissions.
    </p>

    <!-- Payout confirmation -->
    <Transition name="sheet">
      <div
        v-if="confirming"
        class="fixed inset-0 z-50 flex items-end bg-black/40 p-3"
        @click.self="!paying && (confirming = null)"
      >
        <div class="sheet-panel mx-auto w-full max-w-lg rounded-2xl bg-surface px-5 py-6">
        <h3 class="text-[17px] font-bold">Release the reward?</h3>
        <p class="mt-2 text-[14px] leading-relaxed text-muted">
          Escrow will send
          <span class="font-bold text-ink">{{ formatNim(payAmount) }} NIM</span>
          to <span class="font-mono text-ink">{{ shortAddress(confirming.address) }}</span>.
        </p>
        <p class="mt-2 rounded-xl bg-[#fdf6e8] px-3 py-2.5 text-[12px] leading-relaxed text-[#8a5d05]">
          This cannot be undone. A bounty can only ever pay out once.
        </p>

        <Transition name="expand">
          <div v-if="payStage !== 'idle'" class="mt-4 rounded-xl bg-canvas px-4 py-3.5">
            <TxProgress
              :stage="payStage"
              :error="payError || null"
              :labels="{
                preparing: 'Recording your choice',
                wallet: 'Releasing NIM from escrow',
                submitted: 'Payout broadcast',
                verifying: 'Verifying on the Nimiq testnet',
                confirmed: 'Reward distributed',
              }"
            />
          </div>
        </Transition>

        <div class="mt-4 flex gap-2.5">
          <button
            class="pressable min-h-[52px] flex-1 rounded-xl bg-canvas text-[13px] font-semibold text-muted disabled:opacity-40"
            :disabled="paying"
            @click="confirming = null"
          >
            {{ payStage === 'failed' ? 'Close' : 'Cancel' }}
          </button>
          <button
            class="pressable min-h-[52px] flex-1 rounded-xl bg-brand text-[13px] font-bold text-white disabled:opacity-40"
            :disabled="paying"
            @click="confirmWinner"
          >
            {{ paying ? 'Paying…' : payStage === 'failed' ? 'Try again' : 'Confirm payout' }}
          </button>
        </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
