<script setup lang="ts">
/**
 * The Trove mark, in the variant that suits the current theme.
 *
 * The artwork is mostly deep navy, so one asset cannot serve both grounds.
 * `scripts/build-logo.mjs` emits a light and a dark set from the supplied art.
 *
 * Both are rendered and swapped with CSS rather than by binding `src` to the
 * resolved theme. Server-rendered markup has no theme yet, so a bound src
 * would paint the wrong mark for a frame and then swap it. This way the
 * correct one is visible from first paint, driven by the `data-theme`
 * attribute the inline head script sets before render.
 */
withDefaults(defineProps<{ size?: number }>(), { size: 32 })
</script>

<template>
  <span
    class="brand-mark inline-flex shrink-0 select-none"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <!-- Named for the background each sits on, not the colour of the artwork,
         so there is nothing to second-guess here. -->
    <img
      src="/mark-on-light-192.png" alt="Trove" width="192" height="192"
      decoding="async" class="brand-mark__light"
    >
    <img
      src="/mark-on-dark-192.png" alt="" aria-hidden="true" width="192" height="192"
      decoding="async" class="brand-mark__dark"
    >
  </span>
</template>

<style>
.brand-mark img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.brand-mark__dark { display: none; }

:root[data-theme='dark'] .brand-mark__light { display: none; }
:root[data-theme='dark'] .brand-mark__dark { display: block; }
</style>
