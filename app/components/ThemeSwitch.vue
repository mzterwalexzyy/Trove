<script setup lang="ts">
import type { ThemeChoice } from '~/composables/useTheme'

const { choice, set } = useTheme()

const options: { value: ThemeChoice, label: string, icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4' },
  { value: 'system', label: 'Auto', icon: 'M3 5h18v11H3zM8 21h8M12 16v5' },
  { value: 'dark', label: 'Dark', icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' },
]
</script>

<template>
  <div class="card p-4">
    <p class="text-[13px] font-semibold">
      Appearance
    </p>
    <div class="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
      <button
        v-for="option in options"
        :key="option.value"
        role="radio"
        :aria-checked="choice === option.value"
        class="pressable flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-xl border text-[11px] font-semibold transition-colors"
        :class="choice === option.value
          ? 'border-brand bg-brand-soft text-brand'
          : 'border-line bg-canvas text-muted'"
        @click="set(option.value)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-[18px]">
          <path :d="option.icon" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ option.label }}
      </button>
    </div>
  </div>
</template>
