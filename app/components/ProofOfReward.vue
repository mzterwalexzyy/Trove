<script setup lang="ts">
/**
 * The product's core claim, made visible.
 *
 * Three facts most bounty platforms blur into one number: what was promised,
 * what actually arrived, and whether we confirmed it ourselves against the
 * chain.
 */
const props = defineProps<{
  rewardNim: number
  fundedNim: number
  verified: boolean
  explorerUrl?: string | null
  escrowAddress?: string | null
}>()

const shortfall = computed(() => props.rewardNim - props.fundedNim)
</script>

<template>
  <section
    class="card overflow-hidden"
    :class="verified ? 'ring-1 ring-success/25' : ''"
  >
    <div
      class="px-5 py-5"
      :class="verified ? 'bg-success-soft' : 'bg-[#fdf6e8]'"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[32px] leading-none font-bold tracking-tight"
             :class="verified ? 'text-success' : 'text-ink'">
            <AnimatedNumber :value="verified ? fundedNim : rewardNim" :decimals="0" />
            <span class="text-lg font-semibold">NIM</span>
          </p>
          <p class="mt-1.5 text-xs font-semibold uppercase tracking-wider"
             :class="verified ? 'text-success' : 'text-[#8a5d05]'">
            {{ verified ? 'Secured in escrow' : 'Not yet funded' }}
          </p>
        </div>

        <span
          v-if="verified"
          class="pop-in flex shrink-0 items-center gap-1.5 rounded-full bg-success px-3 py-1.5 text-[11px] font-semibold text-white"
        >
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"
            class="check-draw size-3"
          >
            <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Verified on chain
        </span>
      </div>
    </div>

    <dl class="divide-y divide-line px-5 text-[13px]">
      <div class="flex justify-between gap-3 py-2.5">
        <dt class="text-muted">Reward promised</dt>
        <dd class="font-medium tabular-nums">{{ formatNim(rewardNim) }} NIM</dd>
      </div>
      <div class="flex justify-between gap-3 py-2.5">
        <dt class="text-muted">Actually funded</dt>
        <dd class="font-semibold tabular-nums" :class="fundedNim > 0 ? 'text-success' : 'text-muted'">
          {{ formatNim(fundedNim) }} NIM
        </dd>
      </div>
      <div v-if="shortfall > 0 && fundedNim > 0" class="flex justify-between gap-3 py-2.5">
        <dt class="text-gold">Shortfall</dt>
        <dd class="font-semibold tabular-nums text-gold">{{ formatNim(shortfall) }} NIM</dd>
      </div>
      <div v-if="escrowAddress" class="flex justify-between gap-3 py-2.5">
        <dt class="text-muted">Escrow wallet</dt>
        <dd class="font-mono text-[11px]">{{ shortAddress(escrowAddress) }}</dd>
      </div>
    </dl>

    <a
      v-if="explorerUrl"
      :href="explorerUrl"
      target="_blank"
      rel="noopener"
      class="flex min-h-[48px] items-center justify-center gap-1.5 border-t border-line text-[13px] font-semibold text-brand"
    >
      View funding transaction
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
        <path d="M7 17 17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
  </section>
</template>
