export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'trove-theme'

/**
 * Theme preference, persisted and system-aware.
 *
 * The resolved theme is written to `data-theme` on <html>. An inline script in
 * the document head does the same thing before first paint, so the page never
 * flashes light before switching to dark. This composable only has to keep
 * things in sync afterwards.
 */
export function useTheme() {
  const choice = useState<ThemeChoice>('theme-choice', () => 'system')
  const systemDark = useState<boolean>('theme-system-dark', () => false)

  const resolved = computed<'light' | 'dark'>(() =>
    choice.value === 'system' ? (systemDark.value ? 'dark' : 'light') : choice.value)

  function apply(animated = false) {
    if (!import.meta.client) return
    const root = document.documentElement

    // The crossfade class is added only for a deliberate switch, never on load.
    if (animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theme-switching')
      window.setTimeout(() => root.classList.remove('theme-switching'), 260)
    }

    // The only thing this writes. The theme-color meta is bound reactively in
    // app.vue instead; patching it here lost the race against Nuxt's head render.
    root.dataset.theme = resolved.value
  }

  function set(next: ThemeChoice) {
    choice.value = next
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, next)
      }
      catch {
        // Private mode or a locked-down WebView. The theme still applies for
        // this session; only persistence is lost.
      }
    }
    apply(true)
  }

  function init() {
    if (!import.meta.client) return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    systemDark.value = media.matches

    let stored: string | null = null
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    }
    catch { /* storage unavailable; fall back to system */ }

    choice.value = stored === 'light' || stored === 'dark' ? stored : 'system'
    apply()

    // Only meaningful while the choice is "system".
    const onChange = (event: MediaQueryListEvent) => {
      systemDark.value = event.matches
      if (choice.value === 'system') apply(true)
    }
    media.addEventListener('change', onChange)
    onScopeDispose(() => media.removeEventListener('change', onChange))
  }

  return { choice, resolved, set, init }
}
