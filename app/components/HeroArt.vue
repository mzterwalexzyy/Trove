<script setup lang="ts">
/**
 * The hero backdrop: artwork that fills the whole top region, sitting behind
 * the header and the headline rather than beside them.
 *
 * The plates have solid backgrounds, so each is masked with a horizontal fade
 * that dissolves it into the page toward the left. Without that the art reads
 * as a pasted rectangle with a hard edge, and the headline loses contrast
 * where it overlaps.
 *
 * Light and dark plates are both rendered and swapped in CSS: server markup
 * has no theme yet, so binding `src` to the resolved theme paints the wrong
 * plate for a frame.
 *
 * `src` is bound rather than literal because Vite resolves a literal
 * public-path import at build time and fails the build if the file is missing;
 * binding defers it to the browser, so swapping the artwork is a file drop.
 */
/**
 * Each callout drifts on its own cycle. Matching durations would make the
 * three bob in lockstep, which reads as one rigid object rather than three
 * things suspended in the scene, so the periods are deliberately unequal and
 * the phases offset.
 */
const callouts = [
  { key: 'build', title: 'Build', body: 'Create solutions that matter', pos: 'left-[63%] top-[19%]', duration: 7, delay: 0 },
  { key: 'complete', title: 'Complete', body: 'Submit work with proof', pos: 'right-[3%] top-[30%]', duration: 8.5, delay: -2.4 },
  { key: 'earn', title: 'Earn', body: 'Paid the moment you win', pos: 'left-[65%] bottom-[19%]', duration: 6.2, delay: -4.1 },
]
</script>

<template>
  <!-- Backdrop only from `lg`. On a phone there is no room for artwork and
       copy to share the same space, and layering them costs legibility on the
       surface that matters most. The art still appears on mobile, as its own
       block below the calls to action. -->
  <div class="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block" aria-hidden="true">
    <!-- Full bleed. `object-cover` with a right anchor keeps the cube on the
         right and lets the plate crop rather than letterbox, so the artwork
         fills the region edge to edge at any width. -->
    <div class="hero-art absolute inset-0">
      <img :src="'/hero-light.png'" alt="" class="hero-art__light size-full object-cover object-[100%_28%]">
      <img :src="'/hero-dark.png'" alt="" class="hero-art__dark size-full object-cover object-[100%_28%]">
    </div>

    <!-- Callouts ride on top of the art. Decorative: the copy on the left
         already carries the meaning. -->
    <!-- Two nested elements on purpose: the outer one carries the reveal, which
         transitions `transform`, and the inner one carries the continuous
         float, which animates `transform`. On a single element the animation
         would override the transition and the entrance would never play. -->
    <div
      v-for="(callout, index) in callouts"
      :key="callout.key"
      v-reveal="index + 3"
      class="absolute hidden lg:block"
      :class="callout.pos"
    >
      <div
        class="float-soft rounded-xl border border-line/70 bg-surface/70 px-3.5 py-2.5 shadow-[var(--shadow-card)] backdrop-blur-md"
        :style="{ animationDuration: `${callout.duration}s`, animationDelay: `${callout.delay}s` }"
      >
        <p class="text-[10px] font-bold tracking-[0.14em] text-brand uppercase">
          {{ callout.title }}
        </p>
        <p class="mt-1 max-w-[8.5rem] text-[11px] leading-snug text-muted">
          {{ callout.body }}
        </p>
      </div>
    </div>
  </div>
</template>

<style>
/* Masking removed for review: the plate is shown at full opacity with hard
   edges, so the artwork can be judged on its own. If the headline loses
   contrast where it overlaps, the fade goes back. */

.hero-art img {
  position: absolute;
  inset: 0;
}

.hero-art__dark { display: none; }
:root[data-theme='dark'] .hero-art__light { display: none; }
:root[data-theme='dark'] .hero-art__dark { display: block; }
</style>
