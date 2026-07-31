<script setup lang="ts">
/**
 * Shown only outside Nimiq Pay. Tries the deeplink, and falls back to the
 * right store if nothing handles it.
 *
 * There is no reliable way to ask a browser whether a custom scheme has a
 * handler. The workable signal is indirect: if the deeplink succeeds the page
 * is backgrounded, so `visibilitychange` fires or the timer never runs. If we
 * are still visible after the timeout, nothing handled it and the app is
 * almost certainly not installed.
 */
const APP_STORE = 'https://apps.apple.com/app/nimiq-pay/id6471844738'
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.nimiq.pay'

const showStores = ref(false)
const trying = ref(false)

const platform = computed<'ios' | 'android' | 'other'>(() => {
  if (!import.meta.client) return 'other'
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
})

const storeUrl = computed(() => platform.value === 'ios' ? APP_STORE : PLAY_STORE)

function open() {
  if (!import.meta.client || trying.value) return
  trying.value = true

  // Nimiq Pay expects the mini app's own URL as the target.
  const target = `nimiqpay://miniapp?url=${encodeURIComponent(window.location.href)}`

  // Only a visible -> hidden transition means another app took over. Reading
  // the current state instead would call it handled whenever the page started
  // backgrounded, and then the store fallback could never appear.
  const startedVisible = document.visibilityState === 'visible'
  let handled = false

  const onHidden = () => {
    if (startedVisible && document.visibilityState === 'hidden') handled = true
  }
  const onBlur = () => {
    if (startedVisible) handled = true
  }

  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('blur', onBlur)

  window.location.href = target

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('blur', onBlur)
    trying.value = false
    // Still in the foreground: nothing claimed the scheme.
    if (!handled) showStores.value = true
  }, 1600)
}
</script>

<template>
  <div class="bg-warn-soft px-4 py-2.5">
    <div class="mx-auto flex w-full max-w-lg items-center gap-3">
      <p class="flex-1 text-left text-[12px] leading-snug text-warn">
        Browsing works here. Open in Nimiq Pay to fund a bounty or get paid.
      </p>
      <button
        class="pressable min-h-[36px] shrink-0 rounded-full bg-brand px-4 text-[12px] font-semibold text-white disabled:opacity-60"
        :disabled="trying"
        @click="open"
      >
        {{ trying ? 'Opening…' : 'Open' }}
      </button>
    </div>

    <Transition name="expand">
      <div v-if="showStores" class="mx-auto mt-2.5 w-full max-w-lg">
        <p class="text-left text-[12px] leading-snug text-warn">
          Nimiq Pay does not seem to be installed.
        </p>
        <div class="mt-2 flex gap-2">
          <a
            v-if="platform !== 'android'"
            :href="APP_STORE" target="_blank" rel="noopener"
            class="pressable flex min-h-[36px] flex-1 items-center justify-center rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-ink"
          >
            App Store
          </a>
          <a
            v-if="platform !== 'ios'"
            :href="PLAY_STORE" target="_blank" rel="noopener"
            class="pressable flex min-h-[36px] flex-1 items-center justify-center rounded-full border border-line bg-surface px-3 text-[12px] font-semibold text-ink"
          >
            Google Play
          </a>
        </div>
      </div>
    </Transition>
  </div>
</template>
