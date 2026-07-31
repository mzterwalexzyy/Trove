<script setup lang="ts">
/**
 * Keeper: drafts a bounty from a plain-language description.
 *
 * Keeper never publishes, funds, or pays. It fills the form and stops; the
 * creator edits every field and submits it themselves. That boundary is the
 * whole reason it is safe to put an assistant next to a payment flow.
 */
const emit = defineEmits<{
  applied: [draft: {
    title: string
    description: string
    requirements: string
    category: string
    suggestedRewardNim: number
    suggestedDays: number
  }]
}>()

const toast = useToast()
const prompt = ref('')
const thinking = ref(false)
const unavailable = ref(false)
const draft = ref<any>(null)

const examples = [
  'I need a logo for my DeFi project, budget around 500 NIM, 5 days',
  'Someone to write a 200 word explainer of how Nimiq staking works',
  'Find and report a bug in my Vue checkout form',
]

async function ask() {
  if (thinking.value || prompt.value.trim().length < 10) return
  thinking.value = true
  draft.value = null
  try {
    const result = await $fetch<any>('/api/ai/draft', {
      method: 'POST',
      body: { prompt: prompt.value.trim() },
      // Comfortably longer than the server's worst case (two providers at 14s
      // each), so the client never gives up first.
      timeout: 35_000,
    })

    if (!result.available) {
      unavailable.value = true
      toast.info(result.reason === 'not_configured'
        ? 'Keeper is not configured on this deployment'
        : 'Keeper is unavailable right now. Fill the form in yourself.')
      return
    }
    draft.value = result.draft
  }
  catch (err: any) {
    toast.error(err?.data?.statusMessage ?? 'Keeper could not draft that')
  }
  finally {
    thinking.value = false
  }
}

function apply() {
  emit('applied', draft.value)
  toast.success('Draft applied. Review every field before funding.')
  draft.value = null
  prompt.value = ''
}
</script>

<template>
  <section v-if="!unavailable" class="card px-4 py-4">
    <div class="flex items-center gap-2">
      <span class="flex size-7 items-center justify-center rounded-lg bg-brand-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4 text-brand">
          <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" stroke-linecap="round" />
        </svg>
      </span>
      <div>
        <p class="text-[14px] font-semibold">Ask Keeper</p>
        <p class="text-[11px] text-muted">Describe the task; Keeper drafts the bounty.</p>
      </div>
    </div>

    <textarea
      v-model="prompt"
      rows="3"
      maxlength="1200"
      placeholder="I need someone to design a logo for my DeFi project. Budget 500 NIM, 5 days."
      class="mt-3 w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-brand"
    />

    <div v-if="!prompt" class="mt-2 flex flex-wrap gap-1.5">
      <button
        v-for="example in examples"
        :key="example"
        class="pressable rounded-full bg-canvas px-3 py-1.5 text-left text-[11px] leading-snug text-muted"
        @click="prompt = example"
      >
        {{ example.length > 42 ? `${example.slice(0, 42)}…` : example }}
      </button>
    </div>

    <button
      class="pressable mt-3 min-h-[44px] w-full rounded-xl bg-brand text-[13px] font-semibold text-white disabled:opacity-50"
      :disabled="thinking || prompt.trim().length < 10"
      @click="ask"
    >
      <span v-if="!thinking">Draft this bounty</span>
      <span v-else class="inline-flex items-center gap-2">
        <span class="inline-flex gap-1">
          <i v-for="n in 3" :key="n" class="size-1.5 rounded-full bg-white/80"
             :style="{ animation: `pulse-dot 1s ease-in-out ${n * 0.14}s infinite` }" />
        </span>
        Keeper is thinking
      </span>
    </button>

    <Transition name="expand">
      <div v-if="draft" class="mt-3 rounded-xl bg-canvas p-3.5">
        <p class="text-[11px] font-semibold tracking-wide text-muted uppercase">Keeper's draft</p>
        <p class="mt-1.5 text-[14px] leading-snug font-semibold">{{ draft.title }}</p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{{ draft.description }}</p>
        <p class="mt-2 text-[12px] leading-relaxed whitespace-pre-line text-muted">{{ draft.requirements }}</p>
        <p class="mt-2.5 text-[12px] text-muted">
          Suggests <span class="font-semibold text-ink">{{ draft.suggestedRewardNim }} NIM</span>
          over <span class="font-semibold text-ink">{{ draft.suggestedDays }} days</span>
        </p>
        <button
          class="pressable mt-3 min-h-[44px] w-full rounded-xl bg-ink text-[13px] font-semibold text-canvas"
          @click="apply"
        >
          Use this draft
        </button>
        <p class="mt-2 text-center text-[11px] leading-relaxed text-muted">
          You can edit everything. Nothing is published or funded until you confirm.
        </p>
      </div>
    </Transition>
  </section>
</template>
