<script setup lang="ts">
useHead({ title: 'Leaderboard' })

const { data, pending } = await useFetch<any>('/api/leaderboard', {
  default: () => ({ earners: [], funders: [], referrers: [] }),
})

const tab = ref<'earners' | 'funders' | 'referrers'>('earners')

const tabs = [
  { key: 'earners', label: 'Earned', unit: 'wins' },
  { key: 'funders', label: 'Funded', unit: 'posted' },
  { key: 'referrers', label: 'Referred', unit: 'referrals' },
] as const

const rows = computed(() => data.value[tab.value] ?? [])
const unit = computed(() => tabs.find(t => t.key === tab.value)!.unit)

const empty = computed(() => ({
  earners: 'Nobody has been paid yet. Win a bounty to be first.',
  funders: 'No bounties funded yet.',
  referrers: 'No referral rewards paid yet. Share a bounty to earn a cut.',
}[tab.value]))

/** Medal tint for the top three, plain for the rest. */
function rankTint(index: number) {
  if (index === 0) return 'bg-gold-soft text-warn'
  if (index === 1) return 'bg-track text-muted'
  if (index === 2) return 'bg-warn-soft text-warn'
  return 'bg-canvas text-muted'
}
</script>

<template>
  <div class="px-4 pt-6">
    <h1 class="px-1 text-2xl font-bold tracking-tight">Leaderboard</h1>
    <p class="mt-1 px-1 text-[13px] leading-relaxed text-muted">
      Every figure here is counted only after the transaction was confirmed on chain.
    </p>

    <div class="mt-4 flex gap-1 rounded-xl bg-track p-1">
      <button
        v-for="option in tabs"
        :key="option.key"
        class="min-h-[44px] flex-1 rounded-lg text-[12px] font-semibold transition-colors"
        :class="tab === option.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
        @click="tab = option.key"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="pending" class="mt-3 flex flex-col gap-2">
      <div v-for="n in 5" :key="n" class="skeleton h-14" />
    </div>

    <p v-else-if="!rows.length" class="card mt-3 px-6 py-10 text-center text-[13px] leading-relaxed text-muted">
      {{ empty }}
    </p>

    <div v-else class="card mt-3 divide-y divide-line overflow-hidden">
      <div
        v-for="(row, index) in rows"
        :key="row.address"
        v-reveal="index"
        class="flex items-center gap-3 px-4 py-3.5"
      >
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
          :class="rankTint(index)"
        >
          {{ index + 1 }}
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[12px] font-semibold">{{ shortAddress(row.address) }}</p>
          <p class="mt-0.5 text-[11px] text-muted">{{ row.count }} {{ unit }}</p>
        </div>
        <span class="shrink-0 text-[14px] font-bold tabular-nums" :class="tab === 'funders' ? '' : 'text-success'">
          {{ formatNim(row.nim) }} NIM
        </span>
      </div>
    </div>
  </div>
</template>
