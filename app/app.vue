<script setup lang="ts">
const { detect, restore } = useWallet()

useHead({
  titleTemplate: title => title ? `${title} · Nimiq Bounty` : 'Nimiq Bounty',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#f7f7fb' },
  ],
})

onMounted(() => {
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
