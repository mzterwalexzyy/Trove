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

const shown = ref(0)
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

onMounted(() => run(props.value))
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
