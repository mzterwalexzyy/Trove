<script setup lang="ts">
defineProps<{
  message: string
  connecting: boolean
  available: boolean
  error?: string | null
}>()

defineEmits<{ connect: [] }>()
</script>

<template>
  <div class="card mt-4 px-6 py-8 text-center">
    <span class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-6 text-brand">
        <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-8Zm14 3.5h.01" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <p class="mt-3 text-[15px] font-semibold">Connect your wallet</p>
    <p class="mt-1 text-[13px] leading-relaxed text-muted">{{ message }}</p>

    <p v-if="error" class="mt-3 rounded-xl bg-[#fdeaea] px-3 py-2.5 text-[13px] text-[#c0392b]">
      {{ error }}
    </p>

    <button
      class="mt-4 min-h-[52px] w-full rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-40"
      :disabled="connecting || !available"
      @click="$emit('connect')"
    >
      {{ connecting ? 'Waiting for your wallet…' : 'Connect wallet' }}
    </button>

    <p class="mt-3 text-[11px] leading-relaxed text-muted">
      {{ available
        ? 'You sign a one-time message to prove the address is yours. No keys ever leave your wallet.'
        : 'Open this Mini App inside Nimiq Pay to connect.' }}
    </p>
  </div>
</template>
