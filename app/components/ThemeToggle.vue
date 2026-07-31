<script setup lang="ts">
/**
 * Compact light/dark switch for the landing header.
 *
 * Two states rather than three: the header has no room to explain a "system"
 * option, and tapping it there means "make it the other one". The full
 * light/auto/dark control lives on the Profile page.
 */
const { resolved, set } = useTheme()
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="resolved === 'dark'"
    aria-label="Toggle dark mode"
    class="relative flex h-9 w-[52px] shrink-0 items-center rounded-full border border-line bg-surface px-1 transition-colors"
    @click="set(resolved === 'dark' ? 'light' : 'dark')"
  >
    <span
      class="flex size-7 items-center justify-center rounded-full bg-brand text-white transition-transform duration-300"
      :class="resolved === 'dark' ? 'translate-x-[18px]' : 'translate-x-0'"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
        <path
          v-if="resolved === 'dark'"
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
          stroke-linecap="round" stroke-linejoin="round"
        />
        <path
          v-else
          d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
          stroke-linecap="round"
        />
      </svg>
    </span>
  </button>
</template>
