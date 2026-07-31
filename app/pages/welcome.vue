<script setup lang="ts">
/**
 * Landing page.
 *
 * Follows the supplied design direction, with two deliberate departures: the
 * stats row is bound to live data rather than the illustrative figures in the
 * mockup, and the partner-logo strip is omitted. Both would have been claims
 * we cannot support, on a product whose entire argument is that its numbers
 * are verifiable.
 */
definePageMeta({ layout: 'landing' })

const { connect, isInsideNimiqPay, connecting, error } = useWallet()
const toast = useToast()
const entering = ref(false)

useHead({
  title: 'Funded. Verified. Rewarded.',
  meta: [{
    name: 'description',
    content: 'Trove is the bounty marketplace where every reward is funded in escrow and confirmed on the Nimiq blockchain before anyone starts work.',
  }],
})

const { data: stats } = await useFetch('/api/stats', {
  default: () => ({ activeBounties: 0, completed: 0, paidOutNim: 0, hunters: 0, securedNim: 0 }),
})

const headlineStats = computed(() => [
  { value: stats.value.activeBounties, label: 'Active bounties', suffix: '' },
  { value: stats.value.securedNim, label: 'NIM secured in escrow', suffix: '' },
  { value: stats.value.paidOutNim, label: 'NIM paid to winners', suffix: '' },
  { value: stats.value.hunters, label: 'Hunters entered', suffix: '' },
])

/**
 * Deeplink into Nimiq Pay's Mini App browser. Built from the live origin so a
 * preview deployment links to itself rather than to production.
 *
 * localhost is excluded deliberately: a phone opening that deeplink would try
 * to load its own loopback and fail confusingly.
 */
const nimiqPayLink = computed(() => {
  const host = import.meta.client ? window.location.host : 'trove-nimiq.vercel.app'

  // A phone opening a loopback or LAN deeplink would try to reach itself, so
  // dev hosts fall back to production.
  const isLocal = /^(localhost|127\.|10\.|172\.|192\.168\.)/.test(host)
  const target = isLocal ? 'trove-nimiq.vercel.app' : host

  // Bare domain, no scheme, not percent-encoded. The documented form is
  // `nimiqpay://miniapp?url=your-app.com`; passing a full encoded origin makes
  // Nimiq Pay open without ever loading the Mini App.
  return `nimiqpay://miniapp?url=${target}`
})

const NIMIQ_PAY_IOS = 'https://apps.apple.com/app/id6471844738'
const NIMIQ_PAY_ANDROID = 'https://play.google.com/store/apps/details?id=com.nimiq.pay'


const chips = [
  { label: 'On-chain verified', icon: 'M9 12.5 11 15l4.5-5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z' },
  { label: 'Escrow secured', icon: 'M6 10V7a6 6 0 1 1 12 0v3M5 10h14v11H5z' },
  { label: 'Paid in NIM', icon: 'm13 2-9 12h7l-1 8 9-12h-7l1-8Z' },
]

const categories = [
  { key: 'coding', label: 'Development', tint: 'cat-coding', icon: 'm8 8-4 4 4 4m8-8 4 4-4 4' },
  { key: 'design', label: 'Design', tint: 'cat-design', icon: 'M12 19l7-7a2.8 2.8 0 0 0-4-4l-7 7-1 5 5-1Z' },
  { key: 'content', label: 'Content', tint: 'cat-content', icon: 'M8 3h8l4 4v14H4V3h4Zm0 8h8M8 15h5' },
  { key: 'security', label: 'Security', tint: 'cat-security', icon: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Z' },
  { key: 'research', label: 'Research', tint: 'cat-research', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3' },
  { key: 'community', label: 'Community', tint: 'cat-community', icon: 'M16 19v-2a4 4 0 0 0-8 0v2M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z' },
]

const steps = [
  { n: 1, title: 'Find a bounty', body: 'Browse open bounties and pick one that fits your skills.', icon: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3' },
  { n: 2, title: 'Do the work', body: 'Submit your solution with whatever proof the bounty asks for.', icon: 'M8 3h8l4 4v14H4V3h4Zm0 8h8M8 15h5' },
  { n: 3, title: 'Get reviewed', body: 'The creator reviews every entry and picks the winner themselves.', icon: 'M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3Zm-2.5 9 2 2 4-4' },
  { n: 4, title: 'Get paid', body: 'Escrow releases the NIM, and the payout is confirmed on chain.', icon: 'm13 2-9 12h7l-1 8 9-12h-7l1-8Z' },
]

const faqs = [
  { q: 'Is it free to use?', a: 'Yes. Trove takes no fee. The only NIM that moves is the reward itself, from the creator to the winner.' },
  { q: 'Do I need to create an account?', a: 'No. Your Nimiq wallet is your identity. You sign a one-time challenge to prove the address is yours, and that is the whole signup.' },
  { q: 'How do I know the reward is real?', a: 'A bounty only becomes active after its funding transaction is confirmed against the Nimiq network. Every bounty shows that transaction and links to the block explorer.' },
  { q: 'Who decides the winner?', a: 'The creator, always. Trove never picks winners and never releases funds on its own.' },
  { q: 'Where is the reward held?', a: 'In a platform escrow wallet. Nimiq has no smart contracts, so escrow is custodial rather than trustless, and we say so plainly rather than implying otherwise.' },
  { q: 'Which network does this run on?', a: 'The Nimiq testnet. Rewards are testnet NIM, so nothing here carries real-world value yet.' },
]

const openFaq = ref<number | null>(0)

async function launch() {
  if (entering.value) return
  entering.value = true
  try {
    if (isInsideNimiqPay.value) {
      await connect()
      if (error.value) {
        toast.error(error.value)
        return
      }
    }
    await navigateTo('/')
  }
  finally {
    entering.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <!-- Header and hero share one stacking context so the artwork can sit
         behind both. The header keeps no background of its own here; it gains
         one only once the page scrolls past the art. -->
    <div class="relative">
      <HeroArt />

      <header class="relative z-40">
      <!-- Wider than the content column on purpose. A nav is chrome, not
           reading matter, so it has no line-length reason to sit narrow; at
           the content width it left large gaps against the full-bleed art.
           Still capped so it does not sprawl on an ultrawide display. -->
      <div class="mx-auto flex w-full max-w-[1600px] items-center justify-between px-6 py-5 lg:px-12 lg:py-6">
        <NuxtLink to="/" class="flex items-center gap-3">
          <BrandMark :size="42" />
          <span class="text-[23px] font-bold tracking-[-0.02em] lg:text-[26px]">Trove</span>
        </NuxtLink>

        <!-- Only routes that exist. A nav full of dead links reads worse than
             a short one. Full-contrast ink rather than muted: this header sits
             over artwork, where muted text loses too much against a busy
             ground. -->
        <nav class="hidden items-center gap-8 text-[14px] font-semibold text-ink/85 lg:flex">
          <NuxtLink to="/bounties" class="transition-colors hover:text-brand">Bounties</NuxtLink>
          <a href="#how" class="transition-colors hover:text-brand">How it works</a>
          <NuxtLink to="/leaderboard" class="transition-colors hover:text-brand">Leaderboard</NuxtLink>
          <a href="#faq" class="transition-colors hover:text-brand">FAQ</a>
        </nav>

        <div class="flex items-center gap-2">
          <ThemeToggle />
          <button
            class="pressable rounded-full bg-brand px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60 lg:px-5"
            :disabled="entering || connecting"
            @click="launch"
          >
            {{ connecting ? 'Connecting…' : 'Launch app' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Hero -->
    <section class="relative z-10 mx-auto w-full max-w-6xl px-5 pt-6 pb-6 lg:px-8 lg:pt-8 lg:pb-6">
      <!-- Wider than a reading column: the headline is display type set on two
           lines, and at 34rem "Funded. Verified." wrapped. The body copy below
           keeps its own narrower cap so line length stays readable. -->
      <div class="w-full max-w-md text-center lg:max-w-[46rem] lg:pl-14 lg:text-left">
        <p
          class="reveal-in inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[11px] font-semibold text-muted"
          style="--reveal-delay: 60ms"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5 text-brand">
            <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Built for doers
        </p>

        <h1
          class="reveal-in mt-5 text-[2.6rem] leading-[1.06] font-bold tracking-[-0.038em] lg:text-[4.6rem] lg:leading-[1]"
          style="--reveal-delay: 150ms"
        >
          <!-- Three lines on a phone, two from `lg`. One word per line reads
               as a list of guarantees at narrow widths; on desktop there is
               room to pair the first two. -->
          Funded.<br class="lg:hidden"> Verified.<br><span class="text-gradient">Rewarded.</span>
        </h1>

        <p
          class="reveal-in mx-auto mt-5 max-w-[24rem] text-[14px] leading-relaxed text-muted lg:mx-0 lg:max-w-[27rem] lg:text-[16px]"
          style="--reveal-delay: 240ms"
        >
          Trove is the bounty marketplace where the reward is funded and confirmed
          on chain before anyone starts work.
        </p>

        <div
          class="reveal-in mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center lg:justify-start"
          style="--reveal-delay: 330ms"
        >
          <!-- Nimiq Pay leads. This is a Mini App: the wallet is where it
               actually runs, and the browser is the fallback, not the other
               way round. -->
          <a
            :href="nimiqPayLink"
            class="pressable flex min-h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-brand px-7 text-[15px] font-semibold text-white"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="size-[18px]">
              <path d="M17.2 4H6.8a1.6 1.6 0 0 0-1.39.8l-5.2 9a1.6 1.6 0 0 0 0 1.6l5.2 9a1.6 1.6 0 0 0 1.39.8h10.4a1.6 1.6 0 0 0 1.39-.8l5.2-9a1.6 1.6 0 0 0 0-1.6l-5.2-9A1.6 1.6 0 0 0 17.2 4Z" transform="translate(0 -2.6)" />
            </svg>
            Open in Nimiq Pay
          </a>
          <NuxtLink
            to="/bounties"
            class="cta-sheen pressable flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-7 text-[15px] font-semibold text-ink"
          >
            Browse bounties
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" class="size-4">
              <path d="M5 12h14m-6-6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </NuxtLink>
        </div>

        <p
          class="reveal-in mt-3.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[12px] leading-relaxed text-muted lg:justify-start"
          style="--reveal-delay: 400ms"
        >
          <span>Don't have it? Get Nimiq Pay for</span>
          <a :href="NIMIQ_PAY_IOS" target="_blank" rel="noopener" class="font-semibold text-brand underline underline-offset-2">iPhone</a>
          <span>or</span>
          <a :href="NIMIQ_PAY_ANDROID" target="_blank" rel="noopener" class="font-semibold text-brand underline underline-offset-2">Android</a>
        </p>


        <!-- Desktop only. On a phone these three repeat what the FAQ and the
             stats row already say, and they pushed the artwork below the fold. -->
        <ul class="reveal-in mt-7 hidden flex-wrap justify-center gap-x-5 gap-y-2 lg:flex lg:justify-start" style="--reveal-delay: 420ms">
          <li v-for="chip in chips" :key="chip.label" class="flex items-center gap-1.5 text-[12px] font-medium text-muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4 text-brand">
              <path :d="chip.icon" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            {{ chip.label }}
          </li>
        </ul>
      </div>

    </section>
    </div>

    <!-- Live stats. Bound to the API, not to illustrative figures. -->
    <section class="mx-auto w-full max-w-6xl px-5 pt-4 lg:px-8 lg:pt-6">
      <div v-reveal="0" class="card grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
        <div
          v-for="stat in headlineStats"
          :key="stat.label"
          class="px-5 py-6 text-center lg:py-7"
        >
          <p class="text-[1.7rem] leading-none font-bold tracking-tight lg:text-[2rem]">
            <AnimatedNumber :value="stat.value" />
          </p>
          <p class="mt-2 text-[11.5px] leading-snug text-muted">{{ stat.label }}</p>
        </div>
      </div>
      <p v-reveal="1" class="mt-3 text-center text-[11px] text-muted">
        Counted only after each transaction is confirmed on the Nimiq testnet.
      </p>
    </section>

    <!-- Categories -->
    <section class="mx-auto w-full max-w-6xl px-5 pt-16 lg:px-8 lg:pt-24">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h2 v-reveal="0" class="text-[1.5rem] leading-tight font-bold tracking-[-0.02em] lg:text-[2rem]">
            Explore bounties
          </h2>
          <p v-reveal="1" class="mt-1.5 text-[13px] leading-relaxed text-muted lg:text-[15px]">
            Find work that matches your skills.
          </p>
        </div>
        <NuxtLink to="/bounties" class="shrink-0 text-[13px] font-semibold text-brand">
          View all
        </NuxtLink>
      </div>

      <div class="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <NuxtLink
          v-for="(category, index) in categories"
          :key="category.key"
          v-reveal="index"
          :to="`/bounties?category=${category.key}`"
          class="card pressable flex flex-col items-start px-4 py-5"
        >
          <span class="flex size-9 items-center justify-center rounded-xl" :class="category.tint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-[18px]">
              <path :d="category.icon" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <p class="mt-3 text-[13px] font-semibold">{{ category.label }}</p>
        </NuxtLink>
      </div>
    </section>

    <!-- How it works -->
    <div class="mt-16 bg-band lg:mt-24">
      <section id="how" class="mx-auto w-full max-w-6xl px-5 py-16 lg:px-8 lg:py-24">
        <h2 v-reveal="0" class="text-center text-[1.6rem] leading-tight font-bold tracking-[-0.02em] lg:text-[2.2rem]">
          How <span class="text-brand">Trove</span> works
        </h2>
        <p v-reveal="1" class="mx-auto mt-2.5 max-w-[30rem] text-center text-[13px] leading-relaxed text-muted lg:text-[15px]">
          Four steps, all inside Nimiq Pay. No signup.
        </p>

        <ol class="relative mt-10 grid gap-8 lg:mt-14 lg:grid-cols-4 lg:gap-6">
          <!-- Connector, desktop only, sitting behind the numbers -->
          <span
            aria-hidden="true"
            class="absolute top-5 right-[12%] left-[12%] hidden border-t border-dashed border-line lg:block"
          />

          <li v-for="(step, index) in steps" :key="step.n" v-reveal="index" class="relative text-center">
            <span
              class="mx-auto flex size-10 items-center justify-center rounded-full border-4 border-band bg-brand text-[14px] font-bold text-white"
            >
              {{ step.n }}
            </span>
            <span class="mx-auto mt-4 flex size-11 items-center justify-center rounded-xl bg-surface shadow-[var(--shadow-card)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" class="size-5 text-brand">
                <path :d="step.icon" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <h3 class="mt-4 text-[15px] font-bold">{{ step.title }}</h3>
            <p class="mx-auto mt-2 max-w-[15rem] text-[12.5px] leading-relaxed text-muted">{{ step.body }}</p>
          </li>
        </ol>
      </section>
    </div>

    <!-- FAQ -->
    <section id="faq" class="mx-auto w-full max-w-3xl px-5 py-16 lg:px-8 lg:py-24">
      <h2 v-reveal="0" class="text-center text-[1.6rem] leading-tight font-bold tracking-[-0.02em] lg:text-[2.2rem]">
        Frequently asked <span class="text-brand">questions</span>
      </h2>

      <div class="mt-8 flex flex-col gap-2">
        <div v-for="(faq, index) in faqs" :key="faq.q" v-reveal="index" class="card overflow-hidden">
          <button
            class="flex min-h-[56px] w-full items-center gap-3 px-5 py-4 text-left"
            :aria-expanded="openFaq === index"
            @click="openFaq = openFaq === index ? null : index"
          >
            <span class="flex-1 text-[14px] leading-snug font-semibold">{{ faq.q }}</span>
            <svg
              viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="size-4 shrink-0 text-muted transition-transform duration-200"
              :class="openFaq === index ? 'rotate-180' : ''"
            >
              <path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <Transition name="expand">
            <p v-if="openFaq === index" class="px-5 pb-4 text-[13px] leading-relaxed text-muted">
              {{ faq.a }}
            </p>
          </Transition>
        </div>
      </div>
    </section>

    <!-- Closing -->
    <section class="mx-auto w-full max-w-6xl px-5 pb-16 lg:px-8">
      <div
        v-reveal="0"
        class="relative overflow-hidden rounded-3xl bg-deep px-6 py-12 text-center lg:px-14 lg:py-16 lg:text-left"
      >
        <div class="lg:flex lg:items-center lg:justify-between lg:gap-10">
          <div>
            <p class="text-[11px] font-bold tracking-[0.16em] text-white/45 uppercase">Ready to build?</p>
            <h2 class="mt-3 text-[1.6rem] leading-tight font-bold tracking-[-0.02em] text-white lg:text-[2.2rem]">
              Turn your skills into rewards
            </h2>
            <p class="mt-2.5 text-[13.5px] leading-relaxed text-white/55 lg:text-[15px]">
              Every reward funded upfront and verified on chain.
            </p>
          </div>

          <div class="mt-7 flex shrink-0 flex-col gap-2.5 sm:flex-row sm:justify-center lg:mt-0">
            <NuxtLink
              to="/bounties"
              class="pressable flex min-h-[52px] items-center justify-center rounded-2xl bg-brand px-7 text-[14.5px] font-semibold text-white"
            >
              Browse bounties
            </NuxtLink>
            <NuxtLink
              to="/create"
              class="pressable flex min-h-[52px] items-center justify-center rounded-2xl border border-white/20 px-7 text-[14.5px] font-semibold text-white"
            >
              Post a bounty
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <footer class="bg-deep-2 px-5 py-12 lg:px-8">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-9 lg:flex-row lg:justify-between">
        <div class="max-w-xs">
          <div class="flex items-center gap-2.5">
            <BrandMark :size="26" />
            <span class="text-[15px] font-bold tracking-tight text-white">Trove</span>
          </div>
          <p class="mt-3 text-[12px] leading-relaxed text-white/45">
            The bounty marketplace for real work and real rewards, funded in NIM
            and verified on chain.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <p class="text-[12px] font-bold text-white">Product</p>
            <ul class="mt-3 flex flex-col gap-2 text-[12px] text-white/50">
              <li><NuxtLink to="/bounties" class="transition-colors hover:text-white">Browse bounties</NuxtLink></li>
              <li><NuxtLink to="/create" class="transition-colors hover:text-white">Post a bounty</NuxtLink></li>
              <li><NuxtLink to="/leaderboard" class="transition-colors hover:text-white">Leaderboard</NuxtLink></li>
            </ul>
          </div>
          <div>
            <p class="text-[12px] font-bold text-white">Learn</p>
            <ul class="mt-3 flex flex-col gap-2 text-[12px] text-white/50">
              <li><a href="#how" class="transition-colors hover:text-white">How it works</a></li>
              <li><a href="#faq" class="transition-colors hover:text-white">FAQ</a></li>
            </ul>
          </div>
          <div>
            <p class="text-[12px] font-bold text-white">Built on</p>
            <ul class="mt-3 flex flex-col gap-2 text-[12px] text-white/50">
              <li><a href="https://nimiq.com" target="_blank" rel="noopener" class="transition-colors hover:text-white">Nimiq</a></li>
              <li><a href="https://test.nimiq.watch" target="_blank" rel="noopener" class="transition-colors hover:text-white">Block explorer</a></li>
            </ul>
          </div>
        </div>
      </div>

      <div class="mx-auto mt-9 w-full max-w-6xl border-t border-white/10 pt-5">
        <p class="text-[11px] leading-relaxed text-white/35">
          Running on the Nimiq testnet. Rewards are testnet NIM and carry no
          real-world value. Escrow is custodial: Nimiq has no smart contracts,
          so funds are held in a platform wallet rather than a trustless one.
        </p>
      </div>
    </footer>
  </div>
</template>
