/**
 * v-reveal — releases an element into view when it scrolls into range.
 *
 * `v-reveal="index"` staggers by position, so a list of cards arrives in
 * sequence rather than all at once. One shared IntersectionObserver handles
 * every element on the page; per-element observers get expensive on long
 * lists.
 *
 * Failure mode this guards against: the reveal starts elements at opacity 0,
 * so anything that stops the release leaves content permanently invisible.
 * A throttled WebView, a backgrounded tab, or a missing IntersectionObserver
 * must not be able to do that. Every element therefore carries an unconditional
 * timeout that releases it regardless of what else happens, and the hidden
 * state is only applied once we know the release path is armed.
 */
const STAGGER_MS = 55
const MAX_STAGGER_MS = 330
const FAILSAFE_MS = 1200

export default defineNuxtPlugin((nuxtApp) => {
  let observer: IntersectionObserver | null = null
  const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

  function release(el: HTMLElement) {
    const timer = timers.get(el)
    if (timer) {
      clearTimeout(timer)
      timers.delete(el)
    }
    if (!el.classList.contains('reveal')) return
    el.classList.remove('reveal')
    el.classList.add('reveal-in')
    observer?.unobserve(el)
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver === 'undefined') return observer
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) release(entry.target as HTMLElement)
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 })
    return observer
  }

  nuxtApp.vueApp.directive('reveal', {
    // Must be registered on the server too. A client-only directive leaves the
    // SSR renderer calling getSSRProps on undefined. It contributes nothing to
    // the markup; the reveal is purely a client-side effect.
    getSSRProps: () => ({}),

    mounted(el: HTMLElement, binding) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      const index = Number(binding.value ?? 0)
      const delay = Math.min(index * STAGGER_MS, MAX_STAGGER_MS)
      el.style.setProperty('--reveal-delay', `${delay}ms`)
      el.classList.add('reveal')

      // Armed before anything else, so no later branch can strand the element.
      timers.set(el, setTimeout(() => release(el), FAILSAFE_MS + delay))

      const io = ensureObserver()
      if (!io) {
        release(el)
        return
      }
      io.observe(el)
    },

    unmounted(el: HTMLElement) {
      const timer = timers.get(el)
      if (timer) clearTimeout(timer)
      timers.delete(el)
      observer?.unobserve(el)
    },
  })
})
