<script setup lang="ts">
useHead({ title: 'Bounties' })

const search = ref('')
const activeCategory = ref('')
const sort = ref('newest')

const query = computed(() => ({
  q: search.value || undefined,
  category: activeCategory.value || undefined,
  sort: sort.value,
}))

const { data: bounties, pending, error, refresh } = await useFetch('/api/bounties', {
  query,
  default: () => [],
})

const sorts = [
  { value: 'newest', label: 'Newest' },
  { value: 'reward', label: 'Top reward' },
  { value: 'ending', label: 'Ending soon' },
]
</script>

<template>
  <div class="px-4 pt-6">
    <h1 class="px-1 text-2xl font-bold tracking-tight">Bounties</h1>

    <div class="relative mt-4">
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
      >
        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" stroke-linecap="round" />
      </svg>
      <input
        v-model="search"
        type="search"
        placeholder="Search bounties"
        class="card min-h-[48px] w-full pl-10 pr-4 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/30"
      >
    </div>

    <div class="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        class="min-h-[44px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold"
        :class="activeCategory === '' ? 'bg-brand text-white' : 'bg-surface text-muted'"
        @click="activeCategory = ''"
      >
        All
      </button>
      <button
        v-for="option in CATEGORIES"
        :key="option.value"
        class="min-h-[44px] shrink-0 rounded-full px-3.5 text-[13px] font-semibold"
        :class="activeCategory === option.value ? 'bg-brand text-white' : 'bg-surface text-muted'"
        @click="activeCategory = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="mt-3 flex gap-1 rounded-xl bg-[#eceaf4] p-1">
      <button
        v-for="option in sorts"
        :key="option.value"
        class="min-h-[44px] flex-1 rounded-lg text-[12px] font-semibold transition-colors"
        :class="sort === option.value ? 'bg-surface text-ink shadow-sm' : 'text-muted'"
        @click="sort = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-if="pending" class="mt-4 flex flex-col gap-2">
      <div v-for="n in 5" :key="n" class="skeleton h-20" />
    </div>

    <div v-else-if="error" class="card mt-4 px-5 py-8 text-center">
      <p class="text-sm font-semibold">We could not load bounties</p>
      <button class="mt-3 min-h-[44px] rounded-xl bg-brand-soft px-5 text-sm font-semibold text-brand" @click="refresh()">
        Try again
      </button>
    </div>

    <div v-else-if="!bounties.length" class="card mt-4 px-6 py-10 text-center">
      <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-6 text-brand">
          <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3" stroke-linecap="round" />
        </svg>
      </span>
      <p class="mt-3 text-[15px] font-semibold">
        {{ search || activeCategory ? 'Nothing matches that' : 'No funded bounties yet' }}
      </p>
      <p class="mt-1 text-[13px] leading-relaxed text-muted">
        {{ search || activeCategory
          ? 'Try a different search or category.'
          : 'A bounty appears here once its reward is confirmed on chain.' }}
      </p>
      <NuxtLink
        v-if="!search && !activeCategory"
        to="/create"
        class="mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-brand px-6 text-sm font-semibold text-white"
      >
        Create a bounty
      </NuxtLink>
    </div>

    <div v-else class="card mt-4 divide-y divide-line overflow-hidden">
      <BountyCard
        v-for="(bounty, index) in bounties"
        :key="bounty.id"
        v-reveal="index"
        :bounty="bounty"
      />
    </div>
  </div>
</template>
