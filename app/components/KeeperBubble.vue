<script setup lang="ts">
/**
 * Keeper as a standing presence: a draggable bubble that opens a drafting
 * panel from anywhere in the app.
 *
 * Keeper still never publishes, funds or pays. It drafts, and the creator
 * carries the draft into the create form and approves every field. That
 * boundary is what makes it safe to leave an assistant floating over a payment
 * product.
 *
 * The bubble is draggable because it will otherwise cover something the user
 * wants at exactly the wrong moment. Position is remembered per device, and
 * clamped back inside the viewport on resize so it can never strand itself
 * off-screen.
 */
const STORAGE_KEY = 'trove-keeper-pos'
const EDGE = 12
const NAV_CLEARANCE = 96

const router = useRouter()
const toast = useToast()

const open = ref(false)
const prompt = ref('')
const thinking = ref(false)
const draft = ref<any>(null)
const unavailable = ref(false)
/** Suppressed once the user has opened Keeper at least once on this device. */
const seen = ref(true)

/** Shown only while the box is empty: a blank prompt is the hardest thing to
 *  start from, and these say more about what Keeper expects than a
 *  placeholder can. */
const examples = [
  'I need a logo for my DeFi project, budget around 500 NIM, 5 days',
  'Someone to write a 200 word explainer of how Nimiq staking works',
  'Find and report a bug in my Vue checkout form',
]

const pos = ref({ x: 0, y: 0 })
const dragging = ref(false)
const moved = ref(false)
let start = { x: 0, y: 0, px: 0, py: 0 }

const SIZE = 56

function clamp(p: { x: number, y: number }) {
  const maxX = window.innerWidth - SIZE - EDGE
  const maxY = window.innerHeight - SIZE - NAV_CLEARANCE
  return {
    x: Math.min(Math.max(p.x, EDGE), Math.max(EDGE, maxX)),
    y: Math.min(Math.max(p.y, EDGE), Math.max(EDGE, maxY)),
  }
}

onMounted(() => {
  let stored: { x: number, y: number } | null = null
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    seen.value = localStorage.getItem(`${STORAGE_KEY}-seen`) === '1'
  }
  catch { /* private mode; defaults are fine */ }

  pos.value = clamp(stored ?? {
    x: window.innerWidth - SIZE - 16,
    y: window.innerHeight - SIZE - NAV_CLEARANCE - 8,
  })

  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => window.removeEventListener('resize', onResize))

function onResize() {
  pos.value = clamp(pos.value)
}

function onPointerDown(event: PointerEvent) {
  dragging.value = true
  moved.value = false
  start = { x: event.clientX, y: event.clientY, px: pos.value.x, py: pos.value.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging.value) return
  const dx = event.clientX - start.x
  const dy = event.clientY - start.y
  // A few pixels of slop, so a slightly imprecise tap still opens the panel
  // instead of registering as a drag that goes nowhere.
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.value = true
  pos.value = clamp({ x: start.px + dx, y: start.py + dy })
}

function onPointerUp() {
  if (!dragging.value) return
  dragging.value = false
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos.value))
  }
  catch { /* nothing to do */ }
  if (!moved.value) toggle()
}

function toggle() {
  open.value = !open.value
  if (open.value && !seen.value) {
    seen.value = true
    try {
      localStorage.setItem(`${STORAGE_KEY}-seen`, '1')
    }
    catch { /* nothing to do */ }
  }
}

async function ask() {
  if (thinking.value || prompt.value.trim().length < 10) return
  thinking.value = true
  draft.value = null
  try {
    const result = await $fetch<any>('/api/ai/draft', {
      method: 'POST',
      body: { prompt: prompt.value.trim() },
      timeout: 45_000,
    })
    if (!result.available) {
      unavailable.value = true
      toast.info('Keeper is unavailable right now. You can still write the bounty yourself.')
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

/**
 * Hands the draft to the create form. Kept in session storage rather than the
 * URL: a bounty description is long, and a querystring version would be
 * truncated and shareable, which this is not meant to be.
 */
function useDraft() {
  try {
    sessionStorage.setItem('trove-keeper-draft', JSON.stringify(draft.value))
  }
  catch {
    toast.error('Could not carry the draft over. Try writing it in directly.')
    return
  }
  open.value = false
  draft.value = null
  prompt.value = ''
  router.push('/create?draft=keeper')
}
</script>

<template>
  <div v-if="!unavailable">
    <!-- Panel -->
    <Transition name="sheet">
      <div v-if="open" class="fixed inset-0 z-[90]" @click.self="open = false">
        <div class="absolute inset-0 bg-ink/25 backdrop-blur-[2px]" />
        <div
          class="sheet-panel absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-5 sm:inset-y-auto sm:bottom-6 sm:right-6 sm:left-auto sm:mx-0 sm:rounded-3xl"
          :style="{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }"
        >
          <div class="flex items-start gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5 text-brand">
                <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" stroke-linecap="round" />
              </svg>
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-[15px] font-bold">Keeper</p>
              <p class="text-[12px] leading-relaxed text-muted">
                Describe a task and I'll draft the bounty. You approve every field.
              </p>
            </div>
            <button
              class="pressable -mt-1 -mr-1 flex size-9 items-center justify-center rounded-full text-muted"
              aria-label="Close Keeper"
              @click="open = false"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
                <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
              </svg>
            </button>
          </div>

          <textarea
            v-model="prompt"
            rows="3"
            maxlength="1200"
            placeholder="I need a logo for my DeFi project. Budget 500 NIM, 5 days."
            class="mt-4 w-full resize-none rounded-xl border border-line bg-canvas px-3.5 py-3 text-[14px] leading-relaxed outline-none focus:border-brand"
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
            class="pressable mt-3 min-h-[46px] w-full rounded-xl bg-brand text-[14px] font-semibold text-white disabled:opacity-50"
            :disabled="thinking || prompt.trim().length < 10"
            @click="ask"
          >
            <span v-if="!thinking">Draft this bounty</span>
            <span v-else class="inline-flex items-center gap-2">
              <span class="inline-flex gap-1">
                <i
                  v-for="n in 3" :key="n" class="size-1.5 rounded-full bg-white/80"
                  :style="{ animation: `pulse-dot 1s ease-in-out ${n * 0.14}s infinite` }"
                />
              </span>
              Keeper is thinking
            </span>
          </button>

          <Transition name="expand">
            <div v-if="draft" class="mt-4 rounded-xl bg-canvas p-4">
              <p class="text-[11px] font-semibold tracking-wide text-muted uppercase">Draft</p>
              <p class="mt-1.5 text-[14px] leading-snug font-semibold">{{ draft.title }}</p>
              <p class="mt-1.5 text-[13px] leading-relaxed text-muted">{{ draft.description }}</p>
              <p class="mt-2.5 text-[12px] text-muted">
                Suggests <span class="font-semibold text-ink">{{ draft.suggestedRewardNim }} NIM</span>
                over <span class="font-semibold text-ink">{{ draft.suggestedDays }} days</span>
              </p>
              <button
                class="pressable mt-3 min-h-[46px] w-full rounded-xl bg-ink text-[14px] font-semibold text-canvas"
                @click="useDraft"
              >
                Open in the create form
              </button>
              <p class="mt-2 text-center text-[11px] leading-relaxed text-muted">
                Nothing is published or funded until you confirm it there.
              </p>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>

    <!-- Bubble -->
    <button
      class="fixed z-[80] flex size-14 touch-none items-center justify-center rounded-full bg-brand text-white shadow-[0_10px_28px_-8px_rgba(85,70,232,0.75)] select-none"
      :class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      aria-label="Ask Keeper to draft a bounty"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <!-- Draws the eye once, then stops. A halo that pulses forever becomes
           something users learn to ignore, and then resent. -->
      <span
        v-if="!seen && !open"
        class="absolute inset-0 rounded-full bg-brand"
        style="animation: pulse-ring 2s cubic-bezier(0.22, 1, 0.36, 1) 6"
      />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" class="relative size-6">
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>
