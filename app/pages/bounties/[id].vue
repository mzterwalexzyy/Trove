<script setup lang="ts">
const route = useRoute()
const id = route.params.id as string

const { isConnected, isInsideNimiqPay, connect, connecting } = useWallet()
const toast = useToast()
const { data: bounty, pending, error, refresh } = await useFetch<any>(`/api/bounties/${id}`)

useHead(() => ({ title: bounty.value?.title ?? 'Bounty' }))

const meta = computed(() => category(bounty.value?.category ?? 'other'))
const remaining = computed(() => bounty.value ? timeLeft(bounty.value.deadlineAt) : null)
const isOpen = computed(() => bounty.value?.status === 'active' && remaining.value)
const payAmount = computed(() =>
  bounty.value ? Math.min(bounty.value.rewardNim, bounty.value.fundedNim) : 0)

/** Proof of Reward, rendered as a lifecycle the user can audit. */
const checklist = computed(() => {
  const b = bounty.value
  if (!b) return []
  return [
    { label: 'Funding confirmed on chain', done: b.verified },
    { label: 'Submission received', done: b.submissionCount > 0 },
    { label: 'Winner selected', done: Boolean(b.winnerAddress) },
    { label: 'Payment sent from escrow', done: Boolean(b.payout?.txHash) },
    { label: 'Payout verified on chain', done: b.payout?.status === 'verified' },
  ]
})

// Referral. `?ref=` carries the referrer; the offer only shows to someone who
// is not the creator, has not already accepted one, and is not the referrer.
const { address } = useWallet()
const refParam = computed(() => {
  const value = route.query.ref
  return typeof value === 'string' && value.trim() ? value.trim() : null
})

const showReferralOffer = computed(() => {
  const b = bounty.value
  if (!b || !refParam.value) return false
  if (b.isCreator) return false
  if (b.referral?.mine) return false
  if (address.value && normalise(address.value) === normalise(refParam.value)) return false
  return b.status === 'active'
})

function normalise(value: string) {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** Share this bounty, attributing the referral to the sharer. */
const sharing = ref(false)
const showShare = ref(false)

/** The link, with the sharer's address as `?ref=` so a win credits them. */
const shareLink = computed(() => {
  if (!import.meta.client || !bounty.value) return ''
  const url = new URL(window.location.href)
  url.search = ''
  if (address.value) url.searchParams.set('ref', address.value.replace(/\s+/g, ''))
  return url.toString()
})

/** The message carries the title, reward, and enough of the description to say
 *  what the task actually is. Trimmed so X's 280-char limit still leaves room
 *  for the link; the other apps have no limit but read better short too. */
const shareText = computed(() => {
  const b = bounty.value
  if (!b) return ''
  const gist = (b.description ?? '').replace(/\s+/g, ' ').trim()
  const clipped = gist.length > 160 ? `${gist.slice(0, 159).trimEnd()}…` : gist
  const lead = `${b.title} — ${formatNim(b.rewardNim)} NIM bounty on Trove.`
  return clipped ? `${lead}\n\n${clipped}\n\nThink you can solve it?` : `${lead} Think you can solve it?`
})

/** Prebuilt targets per app. `scheme` is the native app deep link, which an
 *  in-app webview hands off to the OS so the real app opens; `web` is the
 *  browser fallback used when no app claims the scheme. Both carry the text
 *  and link so the sharer posts something ready to send. */
const shareTargets = computed(() => {
  const text = shareText.value
  const link = shareLink.value
  const both = encodeURIComponent(`${text} ${link}`)
  const encText = encodeURIComponent(text)
  const encLink = encodeURIComponent(link)
  const title = encodeURIComponent(bounty.value?.title ?? text)
  return [
    { key: 'x', label: 'X', scheme: `twitter://post?message=${both}`, web: `https://twitter.com/intent/tweet?text=${encText}&url=${encLink}` },
    { key: 'telegram', label: 'Telegram', scheme: `tg://msg_url?url=${encLink}&text=${encText}`, web: `https://t.me/share/url?url=${encLink}&text=${encText}` },
    { key: 'whatsapp', label: 'WhatsApp', scheme: `whatsapp://send?text=${both}`, web: `https://wa.me/?text=${both}` },
    { key: 'reddit', label: 'Reddit', scheme: '', web: `https://www.reddit.com/submit?url=${encLink}&title=${title}` },
  ]
})

/**
 * Opens a share target, preferring the native app. Setting the native scheme
 * lets the host webview pass it to the OS, which foregrounds the real app; if
 * nothing claims it within a moment (app not installed), the browser version
 * opens instead. The visibility check avoids opening the web fallback on top
 * of an app that did take over.
 */
function shareVia(target: { scheme: string, web: string }) {
  showShare.value = false
  if (!target.scheme) {
    window.open(target.web, '_blank', 'noopener')
    return
  }
  const timer = window.setTimeout(() => {
    if (!document.hidden) window.open(target.web, '_blank', 'noopener')
  }, 900)
  const onHide = () => {
    if (document.hidden) {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onHide)
    }
  }
  document.addEventListener('visibilitychange', onHide)
  try {
    window.location.href = target.scheme
  }
  catch {
    clearTimeout(timer)
    window.open(target.web, '_blank', 'noopener')
  }
}

async function shareBounty() {
  if (sharing.value) return
  sharing.value = true
  try {
    // Prefer the native sheet where it exists; it lists every installed app.
    // Fall back to our own sheet when the webview has no share API, so the
    // sharer still gets app targets instead of a silent copy.
    if (import.meta.client && navigator.share) {
      await navigator.share({ title: bounty.value.title, text: shareText.value, url: shareLink.value })
    }
    else {
      showShare.value = true
    }
  }
  catch (err: any) {
    // A user dismissing the share sheet is a normal action, not a failure.
    if (err?.name !== 'AbortError') showShare.value = true
  }
  finally {
    sharing.value = false
  }
}

async function copyShareLink() {
  try {
    await navigator.clipboard.writeText(shareLink.value)
    toast.success('Link copied')
  }
  catch {
    toast.error('Could not copy the link')
  }
}

// Submitting
const submission = reactive({ content: '', link: '', image: '' })
const submitting = ref(false)
const submitError = ref('')
const showSubmit = ref(false)
const imageError = ref('')

// Proof of work is required, not optional: a bounty pays real NIM, so a
// creator needs something to judge. The wording follows the category, since a
// design brief wants images and a coding one wants a repo.
const proofLabel = computed(() => {
  switch (bounty.value?.category) {
    case 'design': return 'Link to your images or mockups (optional if you attach one)'
    case 'coding':
    case 'security': return 'Link to your code (GitHub, GitLab, gist…)'
    case 'content': return 'Link to your writing (Docs, Notion, published post…)'
    default: return 'Link to your work'
  }
})
const linkValid = computed(() => /^https?:\/\/\S+$/i.test(submission.link.trim()))
const linkProvided = computed(() => submission.link.trim().length > 0)
const hasImage = computed(() => submission.image.startsWith('data:image/'))
// Content plus proof, where proof is a valid link or an attached image. A link
// that is present must still be valid, so a typo is never silently accepted.
const canSubmit = computed(() =>
  submission.content.trim().length >= 3
  && (hasImage.value || linkValid.value)
  && (!linkProvided.value || linkValid.value))

async function onImagePick(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // let the same file be re-picked after a remove
  if (!file) return
  imageError.value = ''
  if (!/^image\//.test(file.type)) {
    imageError.value = 'That file is not an image'
    return
  }
  try {
    submission.image = await downscaleImage(file)
  }
  catch {
    imageError.value = 'Could not read that image'
  }
}

/**
 * Shrinks a picked image to a data URL small enough to store inline. There is
 * no blob store on this stack, so the picture rides in the request body and
 * lands in a text column; a phone photo would be far too large. Capped to
 * 1600px on the long edge, then JPEG quality steps down until it sits under
 * the server's backstop.
 */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        const MAX_EDGE = 1600
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas'))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        let quality = 0.82
        let out = canvas.toDataURL('image/jpeg', quality)
        // Aim under ~1.2MB, comfortably below the 1.4MB server cap.
        while (out.length > 1_200_000 && quality > 0.4) {
          quality -= 0.1
          out = canvas.toDataURL('image/jpeg', quality)
        }
        resolve(out)
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

function removeImage() {
  submission.image = ''
  imageError.value = ''
}

async function submitWork() {
  if (submitting.value) return
  submitError.value = ''
  if (!isConnected.value && !(await connect())) return

  submitting.value = true
  try {
    await $fetch(`/api/bounties/${id}/submissions`, {
      method: 'POST',
      body: {
        content: submission.content.trim(),
        link: submission.link.trim() || undefined,
        image: submission.image || undefined,
      },
      timeout: 20_000,
    })
    showSubmit.value = false
    toast.success('Submission sent. It is now under review.')
    await refresh()
  }
  catch (err: any) {
    submitError.value = err?.statusMessage ?? describeError(err)
  }
  finally {
    submitting.value = false
  }
}

// Winner selection and payout
const confirming = ref<{ submissionId: string, address: string } | null>(null)
const paying = ref(false)
const payStage = ref<TxStage>('idle')
const payError = ref('')

async function confirmWinner() {
  if (!confirming.value || paying.value) return
  paying.value = true
  payError.value = ''

  try {
    payStage.value = 'preparing'
    await $fetch(`/api/bounties/${id}/winner`, {
      method: 'POST',
      body: { submissionId: confirming.value.submissionId },
      timeout: 20_000,
    })

    payStage.value = 'wallet'
    await $fetch(`/api/bounties/${id}/payout`, { method: 'POST', timeout: 30_000 })

    payStage.value = 'verifying'
    await pollPayout()

    payStage.value = 'confirmed'
    toast.success('Reward released and verified on chain.')
    await new Promise(resolve => setTimeout(resolve, 750))
    confirming.value = null
    payStage.value = 'idle'
    await refresh()
  }
  catch (err: any) {
    payStage.value = 'failed'
    payError.value = describeError(err)
  }
  finally {
    paying.value = false
  }
}

async function pollPayout() {
  for (let attempt = 0; attempt < 24; attempt++) {
    const result = await $fetch<{ status: string }>(`/api/bounties/${id}/payout`, { timeout: 20_000 })
    if (result.status === 'verified') return
    if (result.status === 'rejected') throw new Error('The payout did not match what we expected')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error('Not confirmed yet. Reopen this page to re-check; the reward is not sent twice.')
}
</script>

<template>
  <div v-if="pending" class="flex flex-col gap-3 px-4 pt-6">
    <div class="skeleton h-7 w-2/3" />
    <div class="skeleton h-44" />
    <div class="skeleton h-32" />
  </div>

  <div v-else-if="error" class="px-4 pt-6">
    <div class="card px-6 py-10 text-center">
      <p class="text-[15px] font-semibold">This bounty is not available</p>
      <p class="mt-1 text-[13px] text-muted">It may have been removed, or it is not funded yet.</p>
      <NuxtLink to="/bounties" class="mt-4 inline-flex min-h-[48px] items-center rounded-xl bg-brand px-6 text-sm font-semibold text-white">
        Browse bounties
      </NuxtLink>
    </div>
  </div>

  <div v-else-if="bounty" class="px-4 pt-4">
    <NuxtLink to="/bounties" class="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-muted">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
        <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Bounties
    </NuxtLink>

    <header class="mt-1 px-1">
      <div class="flex flex-wrap items-center gap-2">
        <span class="rounded-md px-2 py-0.5 text-[11px] font-medium" :class="meta.tint">{{ meta.label }}</span>
        <span v-if="remaining" class="text-[11px] font-medium text-muted">{{ remaining }} left</span>
        <span v-else class="text-[11px] font-medium text-muted">Closed</span>
      </div>
      <h1 class="mt-2 text-[22px] leading-tight font-bold tracking-tight">{{ bounty.title }}</h1>
      <p class="mt-1.5 text-[12px] text-muted">
        By {{ shortAddress(bounty.creatorAddress) }} ·
        {{ bounty.submissionCount }} {{ bounty.submissionCount === 1 ? 'entry' : 'entries' }}
      </p>
    </header>

    <div class="mt-4">
      <ProofOfReward
        :reward-nim="bounty.rewardNim"
        :funded-nim="bounty.fundedNim"
        :verified="bounty.verified"
        :explorer-url="bounty.fundingExplorerUrl"
        :escrow-address="bounty.escrowAddress"
      />
    </div>

    <ReferralCard
      v-if="showReferralOffer"
      :bounty-id="id"
      :referrer="refParam!"
      :percent="bounty.referral.percent"
      :winner-nim="bounty.referral.winnerNim"
      :referrer-nim="bounty.referral.referrerNim"
      :reward-nim="bounty.rewardNim"
      @accepted="refresh()"
    />

    <!-- Already referred: keep the net figure visible so the headline reward
         on the card is never the last word this hunter saw. -->
    <p
      v-else-if="bounty.referral?.mine"
      class="mt-3 rounded-xl bg-brand-soft px-4 py-3 text-[12px] leading-relaxed text-brand-ink"
    >
      Referred by {{ shortAddress(bounty.referral.mine.referrerAddress) }}. If you win you receive
      {{ formatNim(bounty.referral.winnerNim) }} NIM and they receive
      {{ formatNim(bounty.referral.referrerNim) }} NIM.
    </p>

    <button
      class="pressable mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13px] font-semibold text-ink"
      :disabled="sharing"
      @click="shareBounty"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <!-- A creator earns nothing for referring to their own bounty: self-referral
           is rejected server-side, so promising a cut here would be a lie. -->
      {{ bounty.isCreator ? 'Share bounty' : `Share and earn ${bounty.referral.percent}%` }}
    </button>

    <!-- Completed -->
    <section v-if="bounty.payout?.status === 'verified'" class="card pop-in mt-3 px-5 py-6 text-center">
      <span class="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" class="size-8 text-success">
          <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <p class="mt-3 text-[17px] font-bold">Bounty completed</p>
      <p class="mt-1 text-xl font-bold text-success tabular-nums">
        {{ formatNim(bounty.payout.amountNim) }} NIM sent
      </p>
      <p class="mt-1 text-[12px] text-muted">
        Paid to <span class="font-mono">{{ shortAddress(bounty.payout.winnerAddress) }}</span>
      </p>
      <a
        v-if="bounty.payout.explorerUrl"
        :href="bounty.payout.explorerUrl"
        target="_blank"
        rel="noopener"
        class="mt-4 flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl bg-brand-soft text-[13px] font-semibold text-brand"
      >
        View on explorer
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3.5">
          <path d="M7 17 17 7M9 7h8v8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </a>
    </section>

    <!-- Lifecycle audit trail -->
    <section class="card mt-3 px-5 py-4">
      <h2 class="text-[13px] font-bold">Proof of reward</h2>
      <ul class="mt-3 flex flex-col gap-2.5">
        <li v-for="(item, index) in checklist" :key="item.label" v-reveal="index" class="flex items-center gap-2.5 text-[13px]">
          <span
            class="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300"
            :class="item.done ? 'bg-success text-white' : 'bg-track text-transparent'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" class="size-2.5">
              <path d="m5 13 4 4L19 7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span :class="item.done ? 'font-medium' : 'text-muted'">{{ item.label }}</span>
        </li>
      </ul>
    </section>

    <section v-reveal="0" class="card mt-3 px-5 py-4">
      <h2 class="text-[13px] font-bold">Description</h2>
      <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ bounty.description }}</p>

      <template v-if="bounty.requirements">
        <h2 class="mt-4 border-t border-line pt-4 text-[13px] font-bold">Requirements</h2>
        <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ bounty.requirements }}</p>
      </template>
    </section>

    <!-- Creator review -->
    <section v-if="bounty.isCreator" class="mt-4">
      <h2 class="px-1 text-[15px] font-bold">Submissions ({{ bounty.submissions.length }})</h2>

      <p v-if="!bounty.submissions.length" class="card mt-2 px-6 py-8 text-center text-[13px] leading-relaxed text-muted">
        No submissions yet.<br>Share the bounty to get eyes on it.
      </p>

      <div v-else class="mt-2 flex flex-col gap-2.5">
        <article
          v-for="(entry, index) in bounty.submissions"
          :key="entry.id"
          v-reveal="index"
          class="card px-4 py-4"
          :class="entry.status === 'winner' ? 'ring-1 ring-success/30' : ''"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="font-mono text-[12px] text-muted">{{ shortAddress(entry.participantAddress) }}</p>
            <span
              v-if="entry.status === 'winner'"
              class="rounded-md bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success"
            >
              Winner
            </span>
          </div>
          <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ entry.content }}</p>
          <a
            v-if="entry.link"
            :href="entry.link"
            target="_blank"
            rel="noopener"
            class="mt-2 inline-block break-all text-[12px] font-medium text-brand underline"
          >
            {{ entry.link }}
          </a>
          <img
            v-if="entry.image"
            :src="entry.image"
            alt="Submitted image"
            class="mt-2 w-full rounded-xl border border-line"
          >

          <!-- Winners can only be paid after entries close. The server enforces
               this too; leaving the button live while the countdown ran just
               produced a rejected request. So until the deadline passes the
               action shows the wait, greyed and inert, rather than inviting a
               click that cannot work. -->
          <template v-if="bounty.status !== 'completed' && !bounty.payout && bounty.fundedNim > 0">
            <button
              v-if="remaining"
              type="button"
              disabled
              class="mt-3 min-h-[48px] w-full cursor-not-allowed rounded-xl bg-canvas text-[13px] font-semibold text-muted"
            >
              Pay out in {{ remaining }}
            </button>
            <button
              v-else
              class="mt-3 min-h-[48px] w-full rounded-xl bg-brand text-[13px] font-bold text-white"
              @click="confirming = { submissionId: entry.id, address: entry.participantAddress }"
            >
              Pay {{ formatNim(payAmount) }} NIM to this wallet
            </button>
          </template>
        </article>
      </div>
    </section>

    <!-- Hunter view -->
    <section v-else-if="isOpen" class="mt-4">
      <div v-if="bounty.mySubmission" class="card px-4 py-4">
        <p class="text-[13px] font-bold">Your submission</p>
        <p class="mt-2 text-[14px] leading-relaxed whitespace-pre-line">{{ bounty.mySubmission.content }}</p>
        <img
          v-if="bounty.mySubmission.image"
          :src="bounty.mySubmission.image"
          alt="Your attached image"
          class="mt-3 w-full rounded-xl border border-line"
        >
        <p class="mt-3 text-[12px] text-muted">
          {{ bounty.mySubmission.status === 'winner' ? 'You won this bounty.' : 'Waiting for the creator to review.' }}
        </p>
        <button
          v-if="bounty.mySubmission.status !== 'winner'"
          class="mt-3 min-h-[48px] w-full rounded-xl bg-canvas text-[13px] font-semibold text-muted"
          @click="showSubmit = true; submission.content = bounty.mySubmission.content; submission.link = bounty.mySubmission.link ?? ''; submission.image = bounty.mySubmission.image ?? ''"
        >
          Edit submission
        </button>
      </div>

      <button
        v-else-if="!showSubmit"
        class="pressable min-h-[52px] w-full rounded-xl bg-brand text-sm font-bold text-white"
        @click="showSubmit = true"
      >
        Submit your solution
      </button>

      <div v-if="showSubmit" class="card mt-2.5 flex flex-col gap-3 px-4 py-4">
        <textarea
          v-model="submission.content"
          rows="5"
          maxlength="4000"
          placeholder="Describe what you did and why it solves the task."
          class="rounded-xl border border-line bg-canvas p-4 text-sm outline-none focus:border-brand"
        />
        <input
          v-model="submission.link"
          type="url"
          inputmode="url"
          :placeholder="proofLabel"
          class="min-h-[48px] rounded-xl border border-line bg-canvas px-4 text-sm outline-none focus:border-brand"
        >
        <p v-if="submission.link.trim() && !linkValid" class="-mt-1 text-[12px] text-warn">
          Enter a full link starting with http:// or https://
        </p>

        <!-- Design work is easier to show than to link. An attached image is
             downscaled in the browser and stored inline, so it counts as proof
             on its own: a hunter can submit with a link, an image, or both. -->
        <div v-if="submission.image" class="relative">
          <img :src="submission.image" alt="Attached preview" class="w-full rounded-xl border border-line">
          <button
            type="button"
            class="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white"
            aria-label="Remove image"
            @click="removeImage"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
              <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
            </svg>
          </button>
        </div>
        <label
          v-else
          class="pressable flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-canvas text-[13px] font-semibold text-muted"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4">
            <path d="M4 16l4-4a2 2 0 0 1 3 0l5 5M14 14l1-1a2 2 0 0 1 3 0l2 2M4 6h16v12H4zM8.5 9a1 1 0 1 0 0-.001Z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Attach an image
          <input type="file" accept="image/*" class="hidden" @change="onImagePick">
        </label>
        <p v-if="imageError" class="-mt-1 text-[12px] text-warn">{{ imageError }}</p>

        <p v-if="submitError" class="rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {{ submitError }}
        </p>
        <div class="flex gap-2.5">
          <button
            class="min-h-[52px] rounded-xl bg-canvas px-6 text-[13px] font-semibold text-muted"
            :disabled="submitting"
            @click="showSubmit = false"
          >
            Cancel
          </button>
          <button
            class="pressable min-h-[52px] flex-1 rounded-xl bg-brand text-[13px] font-bold text-white disabled:opacity-40"
            :disabled="submitting || connecting || !canSubmit || !isInsideNimiqPay"
            @click="submitWork"
          >
            {{ submitting ? 'Submitting…' : 'Submit' }}
          </button>
        </div>
        <p v-if="!isInsideNimiqPay" class="text-[12px] text-warn">
          Open in Nimiq Pay to submit and get paid.
        </p>
      </div>
    </section>

    <p
      v-else-if="bounty.status !== 'completed'"
      class="card mt-4 px-6 py-8 text-center text-[13px] text-muted"
    >
      This bounty is closed to new submissions.
    </p>

    <!-- Payout confirmation -->
    <Transition name="sheet">
      <div
        v-if="confirming"
        class="fixed inset-0 z-50 flex items-end bg-black/40 p-3"
        @click.self="!paying && (confirming = null)"
      >
        <div class="sheet-panel mx-auto w-full max-w-lg rounded-2xl bg-surface px-5 py-6">
        <h3 class="text-[17px] font-bold">Release the reward?</h3>
        <p class="mt-2 text-[14px] leading-relaxed text-muted">
          Escrow will send
          <span class="font-bold text-ink">{{ formatNim(payAmount) }} NIM</span>
          to <span class="font-mono text-ink">{{ shortAddress(confirming.address) }}</span>.
        </p>
        <p class="mt-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[12px] leading-relaxed text-warn">
          This cannot be undone. A bounty can only ever pay out once.
        </p>

        <Transition name="expand">
          <div v-if="payStage !== 'idle'" class="mt-4 rounded-xl bg-canvas px-4 py-3.5">
            <TxProgress
              :stage="payStage"
              :error="payError || null"
              :labels="{
                preparing: 'Recording your choice',
                wallet: 'Releasing NIM from escrow',
                submitted: 'Payout broadcast',
                verifying: 'Verifying on the Nimiq testnet',
                confirmed: 'Reward distributed',
              }"
            />
          </div>
        </Transition>

        <div class="mt-4 flex gap-2.5">
          <button
            class="pressable min-h-[52px] flex-1 rounded-xl bg-canvas text-[13px] font-semibold text-muted disabled:opacity-40"
            :disabled="paying"
            @click="confirming = null"
          >
            {{ payStage === 'failed' ? 'Close' : 'Cancel' }}
          </button>
          <button
            class="pressable min-h-[52px] flex-1 rounded-xl bg-brand text-[13px] font-bold text-white disabled:opacity-40"
            :disabled="paying"
            @click="confirmWinner"
          >
            {{ paying ? 'Paying…' : payStage === 'failed' ? 'Try again' : 'Confirm payout' }}
          </button>
        </div>
        </div>
      </div>
    </Transition>
    <!-- Share sheet: shown when the webview has no native share API, so the
         sharer still gets real app targets and prewritten text. -->
    <Transition name="sheet">
      <div
        v-if="showShare"
        class="fixed inset-0 z-50 flex items-end bg-black/40 p-3"
        @click.self="showShare = false"
      >
        <div class="sheet-panel mx-auto w-full max-w-lg rounded-2xl bg-surface px-5 py-6">
          <div class="flex items-center justify-between">
            <h3 class="text-[17px] font-bold">Share this bounty</h3>
            <button
              class="pressable -mr-1 flex size-9 items-center justify-center rounded-full text-muted"
              aria-label="Close"
              @click="showShare = false"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
                <path d="M6 6l12 12M18 6 6 18" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <p v-if="bounty.referral?.percent" class="mt-1 text-[13px] leading-relaxed text-muted">
            Earn {{ bounty.referral.percent }}% if someone you refer wins.
          </p>

          <div class="mt-4 grid grid-cols-4 gap-2">
            <button
              v-for="target in shareTargets"
              :key="target.key"
              type="button"
              class="pressable flex flex-col items-center gap-1.5 rounded-xl bg-canvas py-3 text-[12px] font-semibold"
              @click="shareVia(target)"
            >
              {{ target.label }}
            </button>
          </div>

          <button
            class="pressable mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13px] font-semibold text-ink"
            @click="copyShareLink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-4">
              <path d="M9 9h10v10H9zM5 15H4V4h11v1" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Copy link
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
