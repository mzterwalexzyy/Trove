<script setup lang="ts">
useHead({ title: 'Complete tasks. Earn NIM.' })

const { address } = useWallet()

/**
 * Inside Nimiq Pay the root URL is the app. Everywhere else it introduces the
 * product first.
 *
 * Someone who arrived through the deeplink has already installed the wallet
 * and opened the Mini App, so showing them a page that asks them to do both is
 * noise. Checked on the client only: the host object is injected into the
 * WebView before page scripts run and does not exist during server render.
 */
onMounted(() => {
  if (!window.nimiqPay && !window.nimiq) {
    navigateTo('/welcome', { replace: true })
  }
})

const { data: stats } = await useFetch('/api/stats', {
  default: () => ({ activeBounties: 0, completed: 0, paidOutNim: 0, hunters: 0, securedNim: 0 }),
})
const { data: bounties, pending } = await useFetch('/api/bounties', {
  query: { sort: 'ending' },
  default: () => [],
})

const featured = computed(() => bounties.value.slice(0, 3))

const steps = [
  { title: 'Find a bounty', detail: 'Pick a task that fits you', icon: 'M8 3h8l4 4v14H4V3h4Zm0 8h8M8 15h5' },
  { title: 'Submit work', detail: 'Deliver it for review', icon: 'm22 2-7 20-4-9-9-4 20-7Z' },
  { title: 'Get approved', detail: 'The creator picks a winner', icon: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Zm-2.5 9 2 2 4-4' },
  { title: 'Get paid', detail: 'Escrow releases the NIM', icon: 'm12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z' },
]
</script>

<template>
  <div>
    <header class="flex items-center justify-between px-5 pt-5">
      <div class="flex items-center gap-2">
        <BrandMark :size="28" />
        <span class="text-[17px] font-bold tracking-tight">Trove</span>
      </div>
      <NuxtLink
        v-if="address"
        to="/me"
        class="rounded-full bg-brand-soft px-3 py-1.5 font-mono text-[11px] font-semibold text-brand"
      >
        {{ shortAddress(address) }}
      </NuxtLink>
    </header>

    <section class="relative mx-4 mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-hero-from to-hero-to px-5 py-7">
      <!-- Decorative only: small task and reward glyphs drifting behind the
           copy. Low contrast and aria-hidden so they never compete with the
           headline or reach a screen reader. -->
      <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <svg
          v-for="glyph in [
            { d: 'M8 3h8l4 4v14H4V3h4Zm0 8h8M8 15h5', cls: 'floaty', style: 'top:10%;right:6%;width:26px;opacity:.16;animation-delay:0s' },
            { d: 'm12 2 8.7 5v10L12 22l-8.7-5V7L12 2Z', cls: 'floaty-alt', style: 'top:56%;right:16%;width:20px;opacity:.14;animation-delay:.9s' },
            { d: 'm5 13 4 4L19 7', cls: 'floaty', style: 'top:70%;right:4%;width:18px;opacity:.13;animation-delay:1.8s' },
            { d: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Z', cls: 'floaty-alt', style: 'top:24%;right:24%;width:16px;opacity:.11;animation-delay:2.6s' },
          ]"
          :key="glyph.d"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
          class="absolute text-brand" :class="glyph.cls" :style="glyph.style"
        >
          <path :d="glyph.d" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>

      <h1 class="text-[30px] leading-[1.1] font-bold tracking-tight">
        Complete tasks.<br>Earn NIM.
      </h1>
      <p class="mt-2.5 text-sm leading-relaxed text-muted">
        Every reward is funded and confirmed on chain before anyone starts work.
      </p>
      <div class="mt-5 flex flex-wrap gap-2.5">
        <NuxtLink
          to="/create"
          class="flex min-h-[48px] items-center gap-1.5 rounded-xl bg-brand px-5 text-sm font-semibold text-white active:bg-brand-dark"
        >
          Create bounty
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" class="size-4">
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
        </NuxtLink>
        <NuxtLink
          to="/bounties"
          class="flex min-h-[48px] items-center rounded-xl bg-surface px-5 text-sm font-semibold text-brand"
        >
          Browse bounties
        </NuxtLink>
      </div>
    </section>

    <section v-reveal="0" class="card mx-4 mt-4 grid grid-cols-4 gap-1 px-2 py-4">
      <div v-for="item in [
        { value: stats.activeBounties, label: 'Active' },
        { value: stats.completed, label: 'Completed' },
        { value: stats.paidOutNim, label: 'NIM paid' },
        { value: stats.hunters, label: 'Hunters' },
      ]" :key="item.label" class="text-center">
        <p class="text-lg font-bold">
          <AnimatedNumber :value="item.value" />
        </p>
        <p class="mt-0.5 text-[11px] text-muted">{{ item.label }}</p>
      </div>
    </section>

    <section class="card mx-4 mt-4 overflow-hidden">
      <div class="flex items-center justify-between px-4 pt-4 pb-1">
        <h2 class="text-[15px] font-bold">Ending soon</h2>
        <NuxtLink to="/bounties" class="text-[13px] font-semibold text-brand">View all</NuxtLink>
      </div>

      <div v-if="pending" class="flex flex-col gap-2 p-4">
        <div v-for="n in 3" :key="n" class="skeleton h-16" />
      </div>

      <p v-else-if="!featured.length" class="px-4 pt-2 pb-6 text-center text-sm leading-relaxed text-muted">
        No funded bounties yet.<br>Post a task and fund it to be the first.
      </p>

      <div v-else class="divide-y divide-line">
        <BountyCard
          v-for="(bounty, index) in featured"
          :key="bounty.id"
          v-reveal="index"
          :bounty="bounty"
        />
      </div>
    </section>

    <section v-reveal="0" class="card mx-4 mt-4 px-5 py-5">
      <h2 class="text-[15px] font-bold">How it works</h2>
      <ol class="mt-4 grid grid-cols-2 gap-4">
        <li v-for="(item, index) in steps" :key="item.title" v-reveal="index" class="text-center">
          <span class="relative mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-soft">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-6 text-brand">
              <path :d="item.icon" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <span class="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">
              {{ index + 1 }}
            </span>
          </span>
          <p class="mt-2 text-[13px] font-semibold">{{ item.title }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-muted">{{ item.detail }}</p>
        </li>
      </ol>
    </section>

    <p class="px-6 py-6 text-center text-[11px] leading-relaxed text-muted">
      Running on the Nimiq testnet. Escrow is custodial, because Nimiq has no
      smart contracts. You choose the winner; nothing is released until you confirm.
    </p>
  </div>
</template>
