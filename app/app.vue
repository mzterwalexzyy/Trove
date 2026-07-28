<script setup lang="ts">
const { detect, restore } = useWallet()

useHead({
  titleTemplate: title => title ? `${title} · Nimiq Bounty` : 'Nimiq Bounty',
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#0b1020' },
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
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </div>
</template>
