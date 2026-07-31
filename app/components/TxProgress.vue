<script setup lang="ts">
/**
 * The transaction timeline.
 *
 * A NIM transfer passes through states the user cannot see, and silence during
 * those states is what makes a payment feel untrustworthy. This makes each one
 * explicit: what is happening now, what already succeeded, and what is still
 * ahead. It is the same component for funding and payout, because the shape of
 * the process is the same.
 */
export type TxStage = 'idle' | 'preparing' | 'wallet' | 'submitted' | 'verifying' | 'confirmed' | 'failed'

const props = defineProps<{
  stage: TxStage
  error?: string | null
  /** Overrides for flows where the wording differs, e.g. escrow payouts. */
  labels?: Partial<Record<'preparing' | 'wallet' | 'submitted' | 'verifying' | 'confirmed', string>>
}>()

const ORDER: Exclude<TxStage, 'idle' | 'failed'>[] = [
  'preparing', 'wallet', 'submitted', 'verifying', 'confirmed',
]

const DEFAULTS = {
  preparing: 'Preparing transaction',
  wallet: 'Waiting for wallet confirmation',
  submitted: 'Transaction submitted',
  verifying: 'Verifying on chain',
  confirmed: 'Confirmed',
}

const steps = computed(() => {
  const activeIndex = ORDER.indexOf(props.stage as any)
  return ORDER.map((key, index) => ({
    key,
    label: props.labels?.[key] ?? DEFAULTS[key],
    state: props.stage === 'failed' && index === Math.max(activeIndex, 0)
      ? 'failed'
      : activeIndex > index
        ? 'done'
        : activeIndex === index
          ? (props.stage === 'confirmed' ? 'done' : 'active')
          : 'todo',
  }))
})

const failedAt = computed(() =>
  props.stage === 'failed' ? steps.value.findIndex(s => s.state === 'failed') : -1)
</script>

<template>
  <ol v-if="stage !== 'idle'" class="flex flex-col gap-0.5">
    <li
      v-for="(step, index) in steps"
      :key="step.key"
      class="flex items-start gap-3"
      :class="{ 'opacity-45': step.state === 'todo' }"
    >
      <span class="relative flex w-5 flex-col items-center">
        <span
          class="relative flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
          :class="{
            'bg-success text-white': step.state === 'done',
            'bg-brand text-white': step.state === 'active',
            'bg-track text-transparent': step.state === 'todo',
            'bg-danger text-white': step.state === 'failed',
          }"
        >
          <!-- A ring pulses outward only on the step currently in flight. -->
          <span
            v-if="step.state === 'active'"
            class="absolute inset-0 rounded-full bg-brand"
            style="animation: pulse-ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) infinite"
          />
          <svg
            v-if="step.state === 'done'"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"
            class="check-draw relative size-2.5"
          >
            <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg
            v-else-if="step.state === 'failed'"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"
            class="relative size-2.5"
          >
            <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
          </svg>
          <span
            v-else-if="step.state === 'active'"
            class="relative size-1.5 rounded-full bg-white"
          />
        </span>
        <span
          v-if="index < steps.length - 1"
          class="mt-0.5 w-0.5 flex-1 rounded-full transition-colors duration-500"
          :class="step.state === 'done' ? 'bg-success/40' : 'bg-track'"
          style="min-height: 14px"
        />
      </span>

      <span class="pb-2 text-[13px] leading-5" :class="step.state === 'active' ? 'font-semibold' : ''">
        {{ step.label }}
      </span>
    </li>

    <Transition name="expand">
      <li v-if="error" class="mt-1 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] leading-relaxed text-danger">
        {{ error }}
      </li>
    </Transition>
  </ol>
</template>
