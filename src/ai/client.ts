import { AiError, type AiProviderId, type AiResult, type AiUsage } from './types'

/**
 * Provider transport.
 *
 * Both providers are called with plain `fetch` and a JSON-schema-constrained
 * response, so one call site serves both and the offline bundle stays small.
 *
 * Two provider-specific details matter and are easy to get wrong:
 *
 *  - ANTHROPIC needs `anthropic-dangerous-direct-browser-access: true` for the
 *    API to answer a browser preflight at all. Without it the request dies as an
 *    opaque CORS failure that looks like a network outage.
 *  - CURRENT CLAUDE MODELS REJECT `temperature` / `top_p` / `top_k` with a 400,
 *    and thinking is on by default with `max_tokens` capping thinking AND text
 *    together. So: no sampling parameters, low effort, and a generous ceiling.
 */

const REQUEST_TIMEOUT_MS = 90_000

export interface ProviderInfo {
  id: AiProviderId
  label: string
  /** Where the user gets a key, shown as plain text (not a link we open). */
  keyHint: string
  keyPrefix: string
  models: string[]
  defaultModel: string
  docsNote: string
  /** Default API origin. */
  baseUrl: string
  /** Path appended to the base URL. */
  path: string
  /**
   * Whether the provider answers a request made straight from a browser.
   * Verified against both APIs: Anthropic does (with the direct-browser-access
   * header); OpenAI does not send CORS headers at all, so it needs a proxy.
   */
  browserReachable: boolean
}

export const PROVIDERS: Record<AiProviderId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    keyHint: 'console.anthropic.com → API keys',
    keyPrefix: 'sk-ant-',
    // Claude 5 family plus the previous Opus, newest first.
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-opus-4-8'],
    defaultModel: 'claude-opus-5',
    docsNote: 'Uses the Messages API with a JSON schema so replies parse reliably.',
    baseUrl: 'https://api.anthropic.com',
    path: '/v1/messages',
    browserReachable: true,
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    keyHint: 'platform.openai.com → API keys',
    keyPrefix: 'sk-',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'],
    defaultModel: 'gpt-4o-mini',
    docsNote: 'Model list is editable - type any model your account can reach.',
    baseUrl: 'https://api.openai.com',
    path: '/v1/chat/completions',
    // OpenAI's API sends no CORS headers, so a browser request fails before it
    // reaches them. A proxy base URL is required.
    browserReachable: false,
  },
}

interface CallOptions {
  provider: AiProviderId
  apiKey: string
  /** Overrides the provider's default origin when the user runs a proxy. */
  baseUrl?: string
  model: string
  system: string
  user: string
  /** JSON Schema the reply must satisfy. */
  schema: Record<string, unknown>
  schemaName: string
  maxTokens?: number
  signal?: AbortSignal
}

/* ------------------------------------------------------------------ *
 * Response text extraction
 * ------------------------------------------------------------------ */

/**
 * Pulls a JSON object out of a model reply.
 *
 * Structured output should make this a straight `JSON.parse`, but a model can
 * still wrap the object in a code fence or add a sentence around it. Falling
 * back to a brace scan turns a cosmetic formatting slip into a non-event.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Fall through to the fence / brace-scan recovery below.
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed)
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim())
    } catch {
      // Keep trying.
    }
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      // Give up below.
    }
  }

  throw new AiError(
    'The model did not return usable JSON.',
    'format',
    trimmed.slice(0, 400),
  )
}

/* ------------------------------------------------------------------ *
 * Error normalisation
 * ------------------------------------------------------------------ */

function errorForStatus(status: number, body: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError('The API key was rejected. Check it and try again.', 'auth', body)
  }
  if (status === 429) {
    return new AiError('Rate limited by the provider. Wait a moment and retry.', 'rate-limit', body)
  }
  if (status === 400) {
    return new AiError('The provider rejected the request.', 'format', body)
  }
  if (status >= 500) {
    return new AiError('The provider had a server error. Try again shortly.', 'server', body)
  }
  return new AiError(`Request failed (HTTP ${status}).`, 'unknown', body)
}

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

function endpoint(opts: CallOptions): string {
  const provider = PROVIDERS[opts.provider]
  const base = (opts.baseUrl?.trim() || provider.baseUrl).replace(/\/+$/, '')
  return `${base}${provider.path}`
}

async function callAnthropic(opts: CallOptions, signal: AbortSignal): Promise<{ text: string; usage: AiUsage; started: number }> {
  const started = performance.now()

  const response = await fetch(endpoint(opts), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
      // Required for the API to accept a request straight from a browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal,
    body: JSON.stringify({
      model: opts.model,
      // Thinking is on by default and shares this ceiling with the reply, so
      // leave real headroom or the JSON gets truncated mid-object.
      max_tokens: opts.maxTokens ?? 8000,
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      output_config: {
        // Low effort: this is content generation, not reasoning-heavy work.
        effort: 'low',
        format: { type: 'json_schema', schema: opts.schema },
      },
      // No temperature / top_p / top_k - current Claude models return 400.
    }),
  })

  if (!response.ok) {
    throw errorForStatus(response.status, await response.text().catch(() => ''))
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
    stop_reason?: string
    stop_details?: { category?: string } | null
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  // Safety classifiers return HTTP 200 with stop_reason "refusal" and empty or
  // partial content - reading content[0] blindly would throw here.
  if (json.stop_reason === 'refusal') {
    throw new AiError(
      'The model declined this request. Try a different topic.',
      'refusal',
      json.stop_details?.category ?? undefined,
    )
  }

  const text = (json.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')

  if (!text.trim()) {
    throw new AiError('The model returned an empty reply.', 'format')
  }

  return {
    text,
    usage: {
      inputTokens: json.usage?.input_tokens ?? null,
      outputTokens: json.usage?.output_tokens ?? null,
      ms: Math.round(performance.now() - started),
    },
    started,
  }
}

async function callOpenai(opts: CallOptions, signal: AbortSignal): Promise<{ text: string; usage: AiUsage; started: number }> {
  const started = performance.now()

  const response = await fetch(endpoint(opts), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${opts.apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model: opts.model,
      max_completion_tokens: opts.maxTokens ?? 8000,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: opts.schemaName, schema: opts.schema, strict: false },
      },
    }),
  })

  if (!response.ok) {
    throw errorForStatus(response.status, await response.text().catch(() => ''))
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const text = json.choices?.[0]?.message?.content ?? ''
  if (!text.trim()) {
    throw new AiError('The model returned an empty reply.', 'format')
  }

  return {
    text,
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? null,
      outputTokens: json.usage?.completion_tokens ?? null,
      ms: Math.round(performance.now() - started),
    },
    started,
  }
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/** Calls the configured provider and returns the parsed JSON reply. */
export async function callModel<T>(opts: CallOptions): Promise<AiResult<T>> {
  if (!opts.apiKey.trim()) {
    throw new AiError('No API key set.', 'auth')
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  try {
    const call = opts.provider === 'anthropic' ? callAnthropic : callOpenai
    const { text, usage } = await call(opts, controller.signal)
    return { data: extractJson(text) as T, usage, notes: [] }
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AiError('The request timed out.', 'network')
    }
    // A browser CORS rejection surfaces as an opaque TypeError, which is the
    // single most confusing failure here - name it explicitly, and say what to
    // do about it for the provider that cannot be called from a browser at all.
    const provider = PROVIDERS[opts.provider]
    const usingDefault = !opts.baseUrl?.trim()
    const message = !provider.browserReachable && usingDefault
      ? `${provider.label} does not allow requests directly from a browser. Set a proxy URL in the AI panel, or use Anthropic, which does.`
      : 'Could not reach the provider. Check your connection, or whether the browser blocked the request.'
    throw new AiError(message, 'network', err instanceof Error ? err.message : String(err))
  } finally {
    window.clearTimeout(timer)
  }
}
