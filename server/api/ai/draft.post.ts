/**
 * Turns a plain-language task description into a structured bounty draft.
 *
 * Hard boundaries, per the product rules:
 *  - This only ever returns a *draft*. It never creates, funds, publishes, or
 *    pays anything. The creator edits and explicitly submits it themselves.
 *  - The API key is read from server runtime config and never reaches the
 *    client.
 *  - When no key is configured, or the provider fails, this returns
 *    `available: false` rather than an error, so the create form falls back to
 *    manual entry instead of breaking.
 */

const CATEGORIES = ['coding', 'security', 'design', 'content', 'research', 'community', 'other']

/** Maps a model's free-text category onto one we actually support. */
function matchCategory(value: unknown): string {
  const text = String(value ?? '').toLowerCase().trim()
  if (!text) return 'other'
  const exact = CATEGORIES.find(c => c === text)
  if (exact) return exact
  return CATEGORIES.find(c => c !== 'other' && text.includes(c)) ?? 'other'
}

const SYSTEM = `You help someone turn a rough task description into a clear bounty on a Nimiq micro-bounty platform.

Return ONLY a JSON object with these keys:
  title            short, specific, under 80 characters, no marketing language
  description      2-4 sentences describing the task and why it matters
  requirements     what the submission must contain, as short lines separated by newlines
  category         exactly one of: ${CATEGORIES.join(', ')}
  suggestedRewardNim   integer, typically 20-500, based on effort
  suggestedDays        integer, 1-30, a realistic deadline

Rules: be concrete, never invent facts the user did not give, and never mention payment mechanics or escrow.`

export default defineEventHandler(async (event) => {
  await requireAddress(event)

  const config = useRuntimeConfig()
  const apiKey = config.aiApiKey
  if (!apiKey) {
    return { available: false, reason: 'not_configured' as const, draft: null }
  }

  const body = await readBody<{ prompt?: string }>(event)
  const prompt = body?.prompt?.trim() ?? ''
  if (prompt.length < 10) {
    throw createError({ statusCode: 400, statusMessage: 'Describe the task in a sentence or two' })
  }
  if (prompt.length > 1200) {
    throw createError({ statusCode: 400, statusMessage: 'That description is too long' })
  }

  /**
   * Providers are tried in order. Free endpoints rate-limit and go down, and
   * a creator mid-draft should not care which one answered.
   */
  const providers = [
    { base: config.aiBaseUrl, key: apiKey, model: config.aiModel },
    { base: config.aiFallbackBaseUrl, key: config.aiFallbackApiKey, model: config.aiFallbackModel },
  ].filter(p => p.base && p.key && p.model)

  async function askOne(provider: { base: string, key: string, model: string }) {
    const base = provider.base.replace(/\/$/, '')
    const response = await $fetch<any>(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.key}`,
        // OpenRouter uses these for attribution; harmless elsewhere.
        'HTTP-Referer': 'https://nimiq-bounty.vercel.app',
        'X-Title': 'Trove',
      },
      body: {
        model: provider.model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        // Generous, because reasoning models spend most of their budget
        // thinking and return an empty `content` if they run out before
        // answering.
        max_tokens: 1600,
      },
      // Deliberately tight. Two providers at 40s each could outlast the
      // client's own timeout, so it would abandon a request the server was
      // still working on. Two attempts now fit inside the client's budget.
      timeout: 14_000,
    })

    const message = response?.choices?.[0]?.message
    const raw: string = message?.content?.trim() || ''
    if (!raw) throw new Error('empty completion')
    return raw
  }

  let raw = ''
  const failures: string[] = []
  for (const provider of providers) {
    try {
      raw = await askOne(provider as any)
      break
    }
    catch (error) {
      failures.push(`${provider.model}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!raw) {
    console.error('[ai/draft] all providers failed', failures)
    return { available: false, reason: 'provider_error' as const, draft: null }
  }

  try {
    // Not every model honours JSON mode; some wrap the object in a markdown
    // fence or add a sentence around it. Take the outermost object rather than
    // failing on otherwise good output.
    const json = raw.startsWith('{')
      ? raw
      : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const parsed = JSON.parse(json)

    // Never trust the model's shape. Everything is clamped to what the create
    // endpoint would accept anyway, so a bad draft cannot produce an invalid
    // bounty or an absurd reward.
    const reward = Number(parsed.suggestedRewardNim)
    const days = Number(parsed.suggestedDays)

    return {
      available: true,
      draft: {
        title: String(parsed.title ?? '').slice(0, 120),
        description: String(parsed.description ?? '').slice(0, 4000),
        requirements: String(parsed.requirements ?? '').slice(0, 2000),
        // Models return "Design" or "Logo Design" rather than "design", so match
      // case-insensitively and on a contained word before giving up. A strict
      // equality check silently filed almost everything under "other".
      category: matchCategory(parsed.category),
        suggestedRewardNim: Number.isFinite(reward) ? Math.min(Math.max(Math.round(reward), 1), 5000) : 50,
        suggestedDays: Number.isFinite(days) ? Math.min(Math.max(Math.round(days), 1), 30) : 7,
      },
    }
  }
  catch (error) {
    // A provider outage must not block bounty creation.
    console.error('[ai/draft]', error instanceof Error ? error.message : error)
    return { available: false, reason: 'provider_error' as const, draft: null }
  }
})
