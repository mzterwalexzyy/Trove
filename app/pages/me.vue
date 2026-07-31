<script setup lang="ts">
useHead({ title: 'Profile' })

const { isConnected, isInsideNimiqPay, connect, connecting, error, address, disconnect } = useWallet()
const { data: me, refresh } = await useFetch<any>('/api/me')

const toast = useToast()
const tab = ref<'created' | 'won'>('created')

async function signIn() {
  if (await connect()) await refresh()
}

const copied = ref(false)
async function copyAddress() {
  if (!address.value) return
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1600)
  }
  catch {
    toast.error('Could not copy. Select and copy the address manually.')
  }
}

async function leave() {
  await disconnect()
  await refresh()
  toast.info('Wallet disconnected on this device.')
}

// --- Handles: self-declared X and GitHub, editable behind a 14-day cooldown.
const editing = ref(false)
const saving = ref(false)
const handleForm = reactive({ xHandle: '', githubHandle: '' })

/** Seconds until the pair can change again, or 0 if it is free to edit now. */
const cooldownLeft = computed(() => {
  const next = me.value?.handles?.nextChangeAt
  if (!next) return 0
  return Math.max(0, next - Math.floor(Date.now() / 1000))
})
const cooldownLabel = computed(() => {
  const days = Math.ceil(cooldownLeft.value / 86400)
  return `${days} day${days === 1 ? '' : 's'}`
})
const hasHandles = computed(() =>
  Boolean(me.value?.handles?.xHandle || me.value?.handles?.githubHandle))

function startEdit() {
  handleForm.xHandle = me.value?.handles?.xHandle ?? ''
  handleForm.githubHandle = me.value?.handles?.githubHandle ?? ''
  editing.value = true
}

async function saveHandles() {
  if (saving.value) return
  saving.value = true
  try {
    await $fetch('/api/me/handles', {
      method: 'POST',
      body: {
        xHandle: handleForm.xHandle.trim() || null,
        githubHandle: handleForm.githubHandle.trim() || null,
      },
      timeout: 15_000,
    })
    editing.value = false
    await refresh()
    toast.success('Profile updated.')
  }
  catch (err: any) {
    toast.error(describeError(err))
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="px-4 pt-6">
    <h1 class="px-1 text-2xl font-bold tracking-tight">Profile</h1>

    <ConnectPrompt
      v-if="!isConnected"
      :connecting="connecting"
      :available="isInsideNimiqPay"
      :error="error"
      message="Connect to see the bounties you have funded and the NIM you have earned."
      @connect="signIn"
    />

    <!-- `me.stats` is absent until the session is recognised. Testing `me`
         alone rendered this branch against a bare `{ address: null }` payload
         and threw on `stats.earnedNim`. -->
    <template v-else-if="me?.stats">
      <!-- Wallet: identity, copy, disconnect -->
      <div class="card mt-4 px-4 py-4">
        <div class="flex items-center gap-3">
          <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5 text-brand">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" stroke-linecap="round" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold">Your wallet</p>
            <p class="truncate font-mono text-[11px] text-muted">{{ shortAddress(address) }}</p>
          </div>
        </div>
        <div class="mt-3 flex gap-2">
          <button
            class="pressable min-h-[44px] flex-1 rounded-xl bg-canvas text-[12px] font-semibold text-ink"
            @click="copyAddress"
          >
            {{ copied ? 'Copied' : 'Copy address' }}
          </button>
          <button
            class="pressable min-h-[44px] flex-1 rounded-xl bg-canvas text-[12px] font-semibold text-danger"
            @click="leave"
          >
            Disconnect
          </button>
        </div>
      </div>

      <!-- Social handles: self-declared, never verification -->
      <div class="card mt-3 px-4 py-4">
        <div class="flex items-center justify-between">
          <p class="text-[13px] font-semibold">Social handles</p>
          <button
            v-if="!editing"
            class="pressable text-[12px] font-semibold text-brand"
            @click="startEdit"
          >
            {{ hasHandles ? 'Edit' : 'Add' }}
          </button>
        </div>

        <template v-if="!editing">
          <div v-if="hasHandles" class="mt-2.5 flex flex-col gap-1.5 text-[13px]">
            <div v-if="me.handles.xHandle" class="flex items-center gap-2">
              <span class="w-14 shrink-0 text-muted">X</span>
              <span class="font-medium">@{{ me.handles.xHandle }}</span>
            </div>
            <div v-if="me.handles.githubHandle" class="flex items-center gap-2">
              <span class="w-14 shrink-0 text-muted">GitHub</span>
              <span class="font-medium">@{{ me.handles.githubHandle }}</span>
            </div>
          </div>
          <p v-else class="mt-1.5 text-[12px] leading-relaxed text-muted">
            Add your X and GitHub so creators know who they are working with. These are self-declared, not verified.
          </p>
        </template>

        <div v-else class="mt-3 flex flex-col gap-3">
          <label class="flex flex-col gap-1.5">
            <span class="text-[12px] font-semibold text-muted">X username</span>
            <div class="flex items-center rounded-xl border border-line bg-canvas px-3.5">
              <span class="text-sm text-muted">@</span>
              <input
                v-model="handleForm.xHandle"
                maxlength="15"
                placeholder="username"
                class="min-h-[46px] w-full bg-transparent pl-1 text-sm outline-none"
              >
            </div>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-[12px] font-semibold text-muted">GitHub username</span>
            <div class="flex items-center rounded-xl border border-line bg-canvas px-3.5">
              <span class="text-sm text-muted">@</span>
              <input
                v-model="handleForm.githubHandle"
                maxlength="39"
                placeholder="username"
                class="min-h-[46px] w-full bg-transparent pl-1 text-sm outline-none"
              >
            </div>
          </label>

          <p v-if="cooldownLeft > 0" class="rounded-lg bg-warn-soft px-3 py-2 text-[11px] leading-relaxed text-warn">
            Handles were changed recently. The next change is available in {{ cooldownLabel }}.
          </p>
          <p v-else class="text-[11px] leading-relaxed text-muted">
            Once saved, handles can be changed again after 14 days.
          </p>

          <div class="flex gap-2">
            <button
              class="pressable min-h-[46px] flex-1 rounded-xl bg-canvas text-[12px] font-semibold text-muted"
              :disabled="saving"
              @click="editing = false"
            >
              Cancel
            </button>
            <button
              class="pressable min-h-[46px] flex-1 rounded-xl bg-brand text-[12px] font-semibold text-white disabled:opacity-50"
              :disabled="saving || cooldownLeft > 0"
              @click="saveHandles"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="mt-3 grid grid-cols-2 gap-2.5">
        <div class="card px-4 py-4">
          <p class="text-xl font-bold tabular-nums text-success">{{ formatNim(me.stats.earnedNim) }}</p>
          <p class="mt-0.5 text-[12px] text-muted">NIM earned</p>
        </div>
        <div class="card px-4 py-4">
          <p class="text-xl font-bold tabular-nums">{{ formatNim(me.stats.fundedNim) }}</p>
          <p class="mt-0.5 text-[12px] text-muted">NIM funded</p>
        </div>
        <div class="card px-4 py-4">
          <p class="text-xl font-bold tabular-nums">{{ me.stats.bountiesCreated }}</p>
          <p class="mt-0.5 text-[12px] text-muted">Bounties created</p>
        </div>
        <div class="card px-4 py-4">
          <p class="text-xl font-bold tabular-nums">{{ me.stats.bountiesWon }}</p>
          <p class="mt-0.5 text-[12px] text-muted">Bounties won</p>
        </div>
      </div>

      <!-- Created / Won -->
      <div class="mt-4 flex gap-1 rounded-xl bg-track p-1">
        <button
          v-for="option in [
            { key: 'created', label: `Created (${me.created.length})` },
            { key: 'won', label: `Won (${me.won.length})` },
          ]"
          :key="option.key"
          class="min-h-[44px] flex-1 rounded-lg text-[12px] font-semibold transition-colors"
          :class="tab === option.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
          @click="tab = option.key as any"
        >
          {{ option.label }}
        </button>
      </div>

      <div v-if="tab === 'created'" class="mt-3">
        <p v-if="!me.created.length" class="card px-6 py-8 text-center text-[13px] leading-relaxed text-muted">
          You have not created a bounty yet.
        </p>
        <div v-else class="card divide-y divide-line overflow-hidden">
          <NuxtLink
            v-for="item in me.created"
            :key="item.id"
            :to="`/bounties/${item.id}`"
            class="block px-4 py-4"
          >
            <div class="flex items-start justify-between gap-3">
              <p class="text-[15px] leading-snug font-semibold">{{ item.title }}</p>
              <span class="shrink-0 text-[13px] font-bold tabular-nums">{{ formatNim(item.rewardNim) }} NIM</span>
            </div>
            <span
              class="mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
              :class="item.verified ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn'"
            >
              {{ item.verified ? 'Funded and verified' : 'Awaiting funding' }}
            </span>
          </NuxtLink>
        </div>
      </div>

      <div v-else class="mt-3">
        <p v-if="!me.won.length" class="card px-6 py-8 text-center text-[13px] leading-relaxed text-muted">
          No wins yet. Find a bounty that fits your skills.
        </p>
        <div v-else class="flex flex-col gap-2.5">
          <div v-for="item in me.won" :key="item.bountyId" class="card px-4 py-4">
            <div class="flex items-start justify-between gap-3">
              <p class="text-[15px] leading-snug font-semibold">{{ item.title }}</p>
              <span class="shrink-0 text-[13px] font-bold text-success tabular-nums">
                +{{ formatNim(item.amountNim) }} NIM
              </span>
            </div>
            <a
              v-if="item.explorerUrl"
              :href="item.explorerUrl"
              target="_blank"
              rel="noopener"
              class="mt-2 inline-block text-[12px] font-medium text-brand underline"
            >
              View payout transaction
            </a>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
