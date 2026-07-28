<script setup lang="ts">
const { toasts, dismiss } = useToast()

const tones = {
  success: 'bg-success text-white',
  error: 'bg-[#d34a41] text-white',
  info: 'bg-ink text-white',
}

const icons = {
  success: 'm5 13 4 4L19 7',
  error: 'M12 8v5m0 3h.01M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 16v-5m0-3h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-3">
    <TransitionGroup name="toast">
      <button
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl px-4 py-3 text-left text-[13px] font-medium shadow-lg"
        :class="tones[toast.tone]"
        @click="dismiss(toast.id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-4 shrink-0">
          <path :d="icons[toast.tone]" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="flex-1">{{ toast.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>
