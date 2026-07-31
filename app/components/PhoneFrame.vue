<script setup lang="ts">
/**
 * A small device frame for the landing page's walkthrough.
 *
 * Showing the actual product beats describing it, and four real screens in a
 * row communicate the lifecycle faster than four paragraphs. The frame is
 * drawn in CSS rather than shipped as an image so it stays crisp and themes
 * with the rest of the page.
 */
withDefaults(defineProps<{ width?: number }>(), { width: 200 })
</script>

<template>
  <div
    class="shrink-0 rounded-[1.6rem] border-[7px] border-ink bg-canvas shadow-[0_24px_48px_-28px_rgba(26,26,46,0.45)]"
    :style="{ width: `${width}px` }"
  >
    <div class="overflow-hidden rounded-[1.1rem]">
      <!-- Status bar, so the frame reads as a phone rather than a card -->
      <div class="flex items-center justify-between px-3 pt-2 pb-1 text-[7px] font-semibold text-muted">
        <span>9:41</span>
        <span class="flex items-center gap-0.5">
          <i class="block h-1.5 w-0.5 rounded-sm bg-muted" />
          <i class="block h-2 w-0.5 rounded-sm bg-muted" />
          <i class="block h-2.5 w-0.5 rounded-sm bg-muted" />
        </span>
      </div>
      <slot />
    </div>
  </div>
</template>
