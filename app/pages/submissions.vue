<script setup lang="ts">
useHead({ title: 'Your submissions' })

const { isConnected, isInsideNimiqPay, connect, connecting, error } = useWallet()
const { data: me, refresh } = await useFetch<any>('/api/me')

async function signIn() {
  if (await connect()) await refresh()
}

const statusMeta: Record<string, { label: string, tint: string }> = {
  winner: { label: 'Won', tint: 'bg-success-soft text-success' },
  not_selected: { label: 'Not selected', tint: 'bg-[#eeeef4] text-muted' },
  submitted: { label: 'Under review', tint: 'bg-[#fef3e0] text-[#b8860b]' },
}
</script>

<template>
  <div class="px-4 pt-6">
    <h1 class="px-1 text-2xl font-bold tracking-tight">Your submissions</h1>

    <ConnectPrompt
      v-if="!isConnected"
      :connecting="connecting"
      :available="isInsideNimiqPay"
      :error="error"
      message="Connect your wallet to see the work you have submitted."
      @connect="signIn"
    />

    <template v-else-if="me">
      <p v-if="!me.entered.length" class="card mt-4 px-6 py-10 text-center">
        <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-6 text-brand">
            <path d="M8 3h8l4 4v14H4V3h4Zm0 8h8M8 15h5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="mt-3 block text-[15px] font-semibold">Nothing submitted yet</span>
        <span class="mt-1 block text-[13px] leading-relaxed text-muted">
          Find a bounty that fits your skills and send in your work.
        </span>
        <NuxtLink to="/bounties" class="mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-brand px-6 text-sm font-semibold text-white">
          Browse bounties
        </NuxtLink>
      </p>

      <div v-else class="card mt-4 divide-y divide-line overflow-hidden">
        <NuxtLink
          v-for="item in me.entered"
          :key="item.bountyId"
          :to="`/bounties/${item.bountyId}`"
          class="block px-4 py-4"
        >
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-[15px] leading-snug font-semibold">{{ item.title }}</h2>
            <span class="shrink-0 rounded-lg bg-success-soft px-2.5 py-1 text-[13px] font-bold text-success tabular-nums">
              {{ formatNim(item.rewardNim) }} NIM
            </span>
          </div>
          <span
            class="mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold"
            :class="statusMeta[item.submissionStatus]?.tint ?? 'bg-[#eeeef4] text-muted'"
          >
            {{ statusMeta[item.submissionStatus]?.label ?? item.submissionStatus }}
          </span>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
