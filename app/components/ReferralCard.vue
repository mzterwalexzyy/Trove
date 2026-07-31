<script setup lang="ts">
/**
 * Shown only to a hunter who arrived through someone's referral link, and only
 * before they accept.
 *
 * The public bounty card deliberately keeps showing the headline reward. The
 * split is disclosed here, to the one person it actually affects, at the moment
 * they decide. Someone who accepts and later reads "20 NIM" on the card should
 * already know they will receive 19.
 */
const props = defineProps<{
  bountyId: string
  referrer: string
  percent: number
  winnerNim: number
  referrerNim: number
  rewardNim: number
}>()

const emit = defineEmits<{ accepted: []; declined: [] }>()

const toast = useToast()
const { isConnected, connect } = useWallet()
const busy = ref(false)
const state = ref<'offered' | 'accepted' | 'declined'>('offered')

async function accept() {
  if (busy.value) return
  busy.value = true
  try {
    if (!isConnected.value && !(await connect())) return

    const result = await $fetch<{ status: string }>(`/api/bounties/${props.bountyId}/refer`, {
      method: 'POST',
      body: { referrer: props.referrer },
      timeout: 20_000,
    })
    state.value = 'accepted'
    toast.success(result.status === 'already_recorded'
      ? 'You already have a referrer on this bounty'
      : 'Referral accepted')
    emit('accepted')
  }
  catch (err: any) {
    // The server owns every rule here, so its reason is the honest one to show.
    toast.error(err?.data?.statusMessage ?? 'Could not accept that referral')
  }
  finally {
    busy.value = false
  }
}

function decline() {
  state.value = 'declined'
  emit('declined')
}
</script>

<template>
  <section v-if="state === 'offered'" class="card pop-in mt-3 border border-brand/30 px-5 py-4">
    <div class="flex items-start gap-3">
      <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4 text-brand">
          <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20a6 6 0 0 1 12 0M17 20a5 5 0 0 0-3-4.6" stroke-linecap="round" />
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-[14px] font-semibold">
          You were referred by
          <span class="font-mono text-[12px] text-brand">{{ shortAddress(referrer) }}</span>
        </p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-muted">
          Accept, and if you win you receive
          <span class="font-semibold text-ink">{{ formatNim(winnerNim) }} NIM</span>
          while they receive
          <span class="font-semibold text-ink">{{ formatNim(referrerNim) }} NIM</span>
          ({{ percent }}%). Decline and you keep the full
          {{ formatNim(rewardNim) }} NIM.
        </p>
      </div>
    </div>

    <div class="mt-4 flex gap-2">
      <button
        class="pressable min-h-[44px] flex-1 rounded-xl bg-brand text-[13px] font-semibold text-white disabled:opacity-60"
        :disabled="busy"
        @click="accept"
      >
        {{ busy ? 'Accepting…' : 'Accept referral' }}
      </button>
      <button
        class="pressable min-h-[44px] flex-1 rounded-xl border border-line bg-canvas text-[13px] font-semibold text-muted"
        :disabled="busy"
        @click="decline"
      >
        Decline
      </button>
    </div>
  </section>

  <section v-else-if="state === 'accepted'" class="card pop-in mt-3 px-5 py-4">
    <div class="flex items-center gap-3">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" class="check-draw size-3.5 text-white">
          <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <div>
        <p class="text-[14px] font-semibold">Referral accepted</p>
        <p class="mt-0.5 text-[12px] text-muted">
          Referred by {{ shortAddress(referrer) }} · you receive {{ formatNim(winnerNim) }} NIM if you win
        </p>
      </div>
    </div>
  </section>

  <section v-else class="card mt-3 px-5 py-4">
    <p class="text-[14px] font-semibold">Referral declined</p>
    <p class="mt-0.5 text-[12px] leading-relaxed text-muted">
      You can still submit as a regular hunter and keep the full {{ formatNim(rewardNim) }} NIM.
    </p>
  </section>
</template>
