<script setup lang="ts">
useHead({ title: 'Profile' })

const { isConnected, isInsideNimiqPay, connect, connecting, error, address } = useWallet()
const { data: me, refresh } = await useFetch<any>('/api/me')

const tab = ref<'created' | 'won'>('created')

async function signIn() {
  if (await connect()) await refresh()
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

    <template v-else-if="me">
      <div class="card mt-4 flex items-center gap-3 px-4 py-4">
        <span class="flex size-11 items-center justify-center rounded-full bg-brand-soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5 text-brand">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0" stroke-linecap="round" />
          </svg>
        </span>
        <div class="min-w-0">
          <p class="text-[13px] font-semibold">Your wallet</p>
          <p class="font-mono text-[11px] break-all text-muted">{{ address }}</p>
        </div>
      </div>

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

      <div class="mt-4 flex gap-1 rounded-xl bg-[#eceaf4] p-1">
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
              :class="item.verified ? 'bg-success-soft text-success' : 'bg-[#fdf6e8] text-[#8a5d05]'"
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
