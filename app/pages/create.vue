<script setup lang="ts">
useHead({ title: 'Create a bounty' })

const { isConnected, isInsideNimiqPay, connect, connecting, sendWithMemo } = useWallet()

const step = ref(1)
const form = reactive({
  title: '',
  description: '',
  requirements: '',
  category: 'coding',
  rewardNim: 50,
  days: 7,
})

const toast = useToast()

/** Keeper fills the form; it never submits it. */
function applyDraft(draft: {
  title: string
  description: string
  requirements: string
  category: string
  suggestedRewardNim: number
  suggestedDays: number
}) {
  form.title = draft.title
  form.description = draft.description
  form.requirements = draft.requirements
  form.category = draft.category
  form.rewardNim = draft.suggestedRewardNim
  form.days = draft.suggestedDays
}

type Stage = 'idle' | 'creating' | 'awaiting_wallet' | 'verifying' | 'confirmed' | 'error'
const stage = ref<Stage>('idle')
const problem = ref('')
const created = ref<{ id: string, memo: string, escrowAddress: string, rewardLuna: number } | null>(null)
const txHash = ref('')
const copied = ref('')

const deadlineAt = computed(() => Math.floor(Date.now() / 1000) + form.days * 86400)

const stepValid = computed(() => {
  if (step.value === 1) return form.title.trim().length > 2 && form.description.trim().length > 9
  if (step.value === 3) return form.rewardNim >= 1 && form.days >= 1
  return true
})

const busy = computed(() => ['creating', 'awaiting_wallet', 'verifying'].includes(stage.value))

/** Maps this flow's internal stages onto the shared transaction timeline. */
const txStage = computed<TxStage>(() => {
  if (stage.value === 'creating') return 'preparing'
  if (stage.value === 'awaiting_wallet') return 'wallet'
  if (stage.value === 'verifying') return txHash.value ? 'verifying' : 'submitted'
  if (stage.value === 'confirmed') return 'confirmed'
  if (stage.value === 'error') return 'failed'
  return 'idle'
})

async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    setTimeout(() => (copied.value = ''), 1600)
  }
  catch { /* clipboard unavailable over plain http on LAN */ }
}

/**
 * Creates the bounty, then funds it. The bounty is saved first so a wallet
 * failure does not lose the work, and funding can be retried against the same
 * memo without creating a duplicate.
 */
async function publish() {
  if (busy.value) return
  problem.value = ''

  if (!isConnected.value && !(await connect())) return

  try {
    if (!created.value) {
      stage.value = 'creating'
      created.value = await $fetch('/api/bounties', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim(),
          requirements: form.requirements.trim(),
          category: form.category,
          rewardNim: form.rewardNim,
          deadlineAt: deadlineAt.value,
        },
        timeout: 20_000,
      })
    }

    if (!txHash.value) {
      stage.value = 'awaiting_wallet'
      txHash.value = await sendWithMemo({
        recipient: created.value!.escrowAddress,
        valueLuna: created.value!.rewardLuna,
        memo: created.value!.memo,
      })
    }

    stage.value = 'verifying'
    await confirmFunding()
  }
  catch (err) {
    stage.value = 'error'
    problem.value = describeError(err)
  }
}

/** Polls until the chain confirms. Never re-sends; it only re-checks. */
async function confirmFunding() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const result = await $fetch<{ status: string }>(`/api/bounties/${created.value!.id}/fund`, {
      method: 'POST',
      body: { txHash: txHash.value },
      timeout: 20_000,
    })
    if (result.status === 'verified' || result.status === 'already_funded') {
      stage.value = 'confirmed'
      toast.success('Reward secured. Your bounty is live.')
      // Let the final tick land before navigating away.
      await new Promise(resolve => setTimeout(resolve, 650))
      return navigateTo(`/bounties/${created.value!.id}?funded=1`)
    }
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  stage.value = 'error'
  problem.value = 'Your transfer has not appeared on chain yet. It may still land, so tap again to re-check rather than sending twice.'
}
</script>

<template>
  <div class="px-4 pt-6">
    <header class="px-1">
      <h1 class="text-2xl font-bold tracking-tight">Create a bounty</h1>
      <p class="mt-1 text-[13px] text-muted">Step {{ step }} of 4</p>
    </header>

    <div class="mt-4 flex gap-1.5 px-1">
      <div
        v-for="n in 4"
        :key="n"
        class="h-1.5 flex-1 rounded-full transition-colors"
        :class="n <= step ? 'bg-brand' : 'bg-track'"
      />
    </div>

    <!-- Step 1: basics -->
    <!-- Keeper drafts into the same form the creator would fill by hand, so
         everything below stays editable and nothing is skipped. -->
    <div v-if="step === 1" class="mt-4">
      <KeeperDraft @applied="applyDraft" />
    </div>

    <div v-if="step === 1" class="card mt-3 flex flex-col gap-4 px-4 py-5">
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold">What needs doing?</span>
        <input
          v-model="form.title"
          maxlength="120"
          placeholder="Design a social media banner"
          class="min-h-[48px] rounded-xl border border-line bg-canvas px-4 text-sm outline-none focus:border-brand"
        >
      </label>
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold">Describe it</span>
        <textarea
          v-model="form.description"
          rows="5"
          maxlength="4000"
          placeholder="Explain the task, the context, and what a good result looks like."
          class="rounded-xl border border-line bg-canvas p-4 text-sm outline-none focus:border-brand"
        />
      </label>
      <div class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold">Category</span>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in CATEGORIES"
            :key="option.value"
            class="min-h-[44px] rounded-xl px-3.5 text-[13px] font-semibold"
            :class="form.category === option.value ? 'bg-brand text-white' : option.tint"
            @click="form.category = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- Step 2: requirements -->
    <div v-else-if="step === 2" class="card mt-4 px-4 py-5">
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold">What must a submission include?</span>
        <span class="text-[12px] leading-relaxed text-muted">
          Optional, but clear requirements get better submissions.
        </span>
        <textarea
          v-model="form.requirements"
          rows="6"
          maxlength="2000"
          placeholder="A link to the work, a short write-up, and steps to reproduce."
          class="mt-1 rounded-xl border border-line bg-canvas p-4 text-sm outline-none focus:border-brand"
        />
      </label>
    </div>

    <!-- Step 3: reward -->
    <div v-else-if="step === 3" class="card mt-4 flex flex-col gap-5 px-4 py-5">
      <label class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold">Reward in NIM</span>
        <div class="relative">
          <input
            v-model.number="form.rewardNim"
            type="number"
            min="1"
            inputmode="decimal"
            class="min-h-[60px] w-full rounded-xl border border-line bg-canvas px-4 pr-16 text-2xl font-bold tabular-nums outline-none focus:border-brand"
          >
          <span class="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-muted">NIM</span>
        </div>
        <span class="text-[12px] leading-relaxed text-muted">
          You transfer this to escrow now. It is released only when you pick a winner.
        </span>
      </label>
      <div class="flex flex-col gap-1.5">
        <span class="text-[13px] font-semibold">Open for</span>
        <div class="flex gap-2">
          <button
            v-for="option in [3, 7, 14, 30]"
            :key="option"
            class="min-h-[48px] flex-1 rounded-xl text-sm font-semibold"
            :class="form.days === option ? 'bg-brand text-white' : 'bg-canvas text-muted'"
            @click="form.days = option"
          >
            {{ option }}d
          </button>
        </div>
      </div>
    </div>

    <!-- Step 4: review and fund -->
    <div v-else class="mt-4 flex flex-col gap-3">
      <div class="card px-4 py-4">
        <span class="inline-block rounded-md px-2 py-0.5 text-[11px] font-medium" :class="category(form.category).tint">
          {{ categoryLabel(form.category) }}
        </span>
        <h2 class="mt-2 text-[17px] leading-snug font-bold">{{ form.title }}</h2>
        <p class="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-muted">{{ form.description }}</p>
        <p v-if="form.requirements" class="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed whitespace-pre-line text-muted">
          {{ form.requirements }}
        </p>
      </div>

      <div class="card px-4 py-4 text-[13px]">
        <div class="flex justify-between py-1.5">
          <span class="text-muted">Reward</span>
          <span class="font-semibold tabular-nums">{{ formatNim(form.rewardNim) }} NIM</span>
        </div>
        <div class="flex justify-between py-1.5">
          <span class="text-muted">Platform fee</span>
          <span class="font-semibold text-success">None</span>
        </div>
        <div class="mt-1 flex justify-between border-t border-line pt-2.5">
          <span class="font-semibold">You transfer now</span>
          <span class="text-base font-bold tabular-nums">{{ formatNim(form.rewardNim) }} NIM</span>
        </div>
      </div>

      <!-- Fallback path for anyone outside Nimiq Pay -->
      <div v-if="created && !isInsideNimiqPay" class="card px-4 py-4">
        <p class="text-[13px] font-semibold">Send manually</p>
        <p class="mt-1 text-[12px] leading-relaxed text-muted">
          Transfer exactly {{ formatNim(form.rewardNim) }} NIM to this address with the memo below.
          Both must match or the funding will not verify.
        </p>
        <button
          class="mt-3 flex w-full items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-3 text-left"
          @click="copy(created.escrowAddress, 'address')"
        >
          <span class="font-mono text-[11px] break-all">{{ created.escrowAddress }}</span>
          <span class="shrink-0 text-[11px] font-semibold text-brand">{{ copied === 'address' ? 'Copied' : 'Copy' }}</span>
        </button>
        <button
          class="mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-3 text-left"
          @click="copy(created.memo, 'memo')"
        >
          <span class="font-mono text-[11px] break-all">{{ created.memo }}</span>
          <span class="shrink-0 text-[11px] font-semibold text-brand">{{ copied === 'memo' ? 'Copied' : 'Copy' }}</span>
        </button>
      </div>

      <p class="rounded-xl bg-brand-soft px-4 py-3 text-[12px] leading-relaxed text-brand-ink">
        Your NIM goes to a platform escrow wallet on the Nimiq testnet, and the bounty
        goes live only once we confirm the transfer on chain. Nimiq has no smart
        contracts, so this escrow is custodial rather than trustless. You alone choose
        the winner, and nothing is released until you confirm.
      </p>

      <Transition name="expand">
        <div v-if="txStage !== 'idle'" class="card px-4 py-4">
          <TxProgress
            :stage="txStage"
            :error="problem || null"
            :labels="{
              preparing: 'Saving your bounty',
              wallet: 'Confirm the transfer in your wallet',
              submitted: 'Transfer submitted',
              verifying: 'Verifying on the Nimiq testnet',
              confirmed: 'Reward secured',
            }"
          />
        </div>
      </Transition>

      <p v-if="!isInsideNimiqPay" class="rounded-xl bg-warn-soft px-4 py-3 text-[12px] leading-relaxed text-warn">
        Open this Mini App inside Nimiq Pay to fund the bounty from your wallet.
      </p>
    </div>

    <div class="mt-5 flex gap-2.5">
      <button
        v-if="step > 1"
        class="min-h-[52px] rounded-xl bg-surface px-6 text-sm font-semibold text-muted disabled:opacity-40"
        :disabled="busy"
        @click="step--"
      >
        Back
      </button>
      <button
        v-if="step < 4"
        class="pressable min-h-[52px] flex-1 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-40"
        :disabled="!stepValid"
        @click="step++"
      >
        Continue
      </button>
      <button
        v-else
        class="pressable min-h-[52px] flex-1 rounded-xl bg-brand text-sm font-bold text-white disabled:opacity-40"
        :disabled="busy || connecting || !isInsideNimiqPay"
        @click="publish"
      >
        {{ txHash ? 'Re-check confirmation' : `Fund ${formatNim(form.rewardNim)} NIM` }}
      </button>
    </div>
  </div>
</template>
