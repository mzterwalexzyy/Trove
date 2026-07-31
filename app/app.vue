<script setup lang="ts">
const { detect, restore } = useWallet()
const { init: initTheme, resolved } = useTheme()

useHead({
  titleTemplate: title => title ? `${title} · Trove` : 'Trove',
  htmlAttrs: { lang: 'en' },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    // Reactive, so the WebView chrome follows the theme. Patching this element
    // imperatively lost the race against Nuxt's own head render.
    { name: 'theme-color', content: () => resolved.value === 'dark' ? '#0d0f1f' : '#f7f7fb' },
  ],
})

onMounted(() => {
  // The inline head script already set data-theme before paint; this syncs the
  // reactive state and starts watching the system preference.
  initTheme()

  // Detection and session restore are both silent. Nothing here opens an
  // approval dialog: that only ever happens on an explicit tap.
  detect()
  restore()
})
</script>

<template>
  <div>
    <NuxtRouteAnnouncer />
    <ToastHost />
    <NuxtLayout>
      <NuxtPage :transition="{ name: 'page', mode: 'out-in' }" />
    </NuxtLayout>
  </div>
</template>
