<script setup lang="ts">
const route = useRoute()
const { providerState } = useWallet()

const tabs = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5' },
  { to: '/bounties', label: 'Bounties', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3' },
  { to: '/leaderboard', label: 'Ranks', icon: 'M8 21V9m4 12V3m4 18v-7M3 21h18' },
  { to: '/me', label: 'Profile', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0' },
]

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <div class="min-h-dvh bg-canvas">
    <OpenInNimiqPay v-if="providerState === 'unavailable'" />

    <div class="mx-auto w-full max-w-lg pb-28">
      <slot />
    </div>

    <nav
      class="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur"
      :style="{ paddingBottom: 'env(safe-area-inset-bottom)' }"
    >
      <div class="relative mx-auto flex w-full max-w-lg items-stretch">
        <NuxtLink
          v-for="(tab, index) in tabs"
          :key="tab.to"
          :to="tab.to"
          class="flex min-h-[64px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors"
          :class="[
            isActive(tab.to) ? 'text-brand' : 'text-muted',
            index === 2 ? 'ml-[68px]' : '',
          ]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5">
            <path :d="tab.icon" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ tab.label }}
        </NuxtLink>

        <!-- Create sits above the bar: it is the action the whole product exists for. -->
        <NuxtLink
          to="/create"
          aria-label="Create a bounty"
          class="absolute left-1/2 -top-5 flex size-14 -translate-x-1/2 items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_20px_-6px_rgba(85,70,232,0.7)] active:bg-brand-dark"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-6">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
