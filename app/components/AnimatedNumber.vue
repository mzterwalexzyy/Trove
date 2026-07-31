<script setup lang="ts">
/**
 * Counts a number up to its value when it changes.
 *
 * Used for NIM amounts and headline stats so a figure settling into place
 * reads as a result rather than as static text. Honours reduced-motion by
 * jumping straight to the value.
 */
const props = withDefaults(defineProps<{
  value: number
  duration?: number
  decimals?: number
}>(), { duration: 750, decimals: 0 })

/**
 * Starts at the real value rather than 0 so the server renders the actual
 * number. Rendering 0 on the server and the value on the client was a
 * hydration mismatch, and it also meant the figure was simply wrong without
 * JavaScript. The count-up is restarted from 0 on mount instead.
 */
const shown = ref(props.value)
let frame = 0

function run(to: number) {
  cancelAnimationFrame(frame)

  const reduced = import.meta.client
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || props.duration <= 0) {
    shown.value = to
    return
  }

  const from = shown.value
  const start = performance.now()

  const step = (now: number) => {
    const progress = Math.min((now - start) / props.duration, 1)
    // Ease-out cubic: fast to start, settles gently.
    shown.value = from + (to - from) * (1 - (1 - progress) ** 3)
    if (progress < 1) frame = requestAnimationFrame(step)
    else shown.value = to
  }
  frame = requestAnimationFrame(step)
}

onMounted(() => {
  // Rewind to 0 only once hydration has matched, then count up.
  shown.value = 0
  run(props.value)
})
watch(() => props.value, to => run(to))
onBeforeUnmount(() => cancelAnimationFrame(frame))

const display = computed(() =>
  shown.value.toLocaleString(undefined, {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
  }))
</script>

<template>
  <span class="tabular-nums">{{ display }}</span>
</template>
