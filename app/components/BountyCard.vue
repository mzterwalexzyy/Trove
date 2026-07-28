<script setup lang="ts">
const props = defineProps<{
  bounty: {
    id: string
    title: string
    description?: string
    category: string
    rewardNim: number
    fundedNim: number
    verified: boolean
    deadlineAt: number
    submissionCount: number
  }
}>()

const meta = computed(() => category(props.bounty.category))
const remaining = computed(() => timeLeft(props.bounty.deadlineAt))
const urgent = computed(() => props.bounty.deadlineAt - Date.now() / 1000 < 86400)
</script>

<template>
  <NuxtLink :to="`/bounties/${bounty.id}`" class="flex items-start gap-3.5 px-4 py-4">
    <span
      class="flex size-11 shrink-0 items-center justify-center rounded-xl"
      :class="meta.tint"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" class="size-5">
        <path :d="meta.icon" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>

    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-snug font-semibold text-ink">{{ bounty.title }}</h3>
      <p v-if="bounty.description" class="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
        {{ bounty.description }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span class="rounded-md px-2 py-0.5 text-[11px] font-medium" :class="meta.tint">
          {{ meta.label }}
        </span>
        <span
          v-if="bounty.verified"
          class="flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" class="size-2.5">
            <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Verified
        </span>
        <span class="text-[11px] text-muted">
          {{ bounty.submissionCount }} {{ bounty.submissionCount === 1 ? 'entry' : 'entries' }}
        </span>
      </div>
    </div>

    <div class="shrink-0 text-right">
      <span class="inline-block rounded-lg bg-success-soft px-2.5 py-1 text-[13px] font-bold text-success tabular-nums">
        {{ formatNim(bounty.fundedNim || bounty.rewardNim) }} NIM
      </span>
      <p
        class="mt-1.5 text-[11px] font-medium"
        :class="remaining ? (urgent ? 'text-[#d1453b]' : 'text-muted') : 'text-muted'"
      >
        {{ remaining ? `${remaining} left` : 'Closed' }}
      </p>
    </div>
  </NuxtLink>
</template>
