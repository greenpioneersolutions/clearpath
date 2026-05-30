import http from 'http'
import https from 'https'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import type { SessionOptions, ParsedOutput } from './types'
import type { ICLIAdapter, SessionHandle } from './types'
import {
  DEFAULT_CACHE_POLICY,
  isAnthropicModel,
  shouldCachePrefix,
  type CachePolicy,
} from '../tokenization/cachePolicy'
import { tokenCounter } from '../tokenization/TokenCounter'

interface LocalModel {
  name: string
  source: 'ollama' | 'lmstudio'
  size?: string
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Result reported back to the CLIManager so the per-turn cost record can be
 * populated with REAL cache usage from the API response — not a guess.
 *
 * Anthropic returns these on the `usage` object:
 *   cache_read_input_tokens     → cachedInputTokens
 *   cache_creation_input_tokens → cacheCreationTokens
 *
 * Ollama / LM Studio don't expose cache stats today, so a 0/0 result is
 * normal for those paths.
 */
export interface CacheUsageReport {
  cachedInputTokens: number
  cacheCreationTokens: number
  /** True when the request actually carried cache_control markers. */
  cacheInjected: boolean
  /** Why caching was/wasn't applied. Surfaced to `cli:prompt-shaped` via the cacheStatus payload. */
  reason?: string
}

/**
 * Adapter that talks to local model servers (Ollama, LM Studio)
 * via HTTP APIs instead of spawning CLI processes.
 */
export class LocalModelAdapter implements ICLIAdapter {
  readonly cliName = 'local'
  binaryPath = 'local'

  private ollamaUrl = 'http://localhost:11434'
  private lmStudioUrl = 'http://localhost:1234'
  /** Anthropic endpoint used when the requested model is Claude-family. */
  private anthropicUrl = 'https://api.anthropic.com'
  private conversationHistory: ChatMessage[] = []

  /**
   * Phase 3 cache policy. Injected at construction time by CLIManager; defaults
   * to the safe disabled policy so direct instantiation in tests / extensions
   * doesn't accidentally light up cache_control headers.
   */
  private cachePolicy: CachePolicy = { ...DEFAULT_CACHE_POLICY }

  /**
   * Last cache usage reported by the most recent Anthropic API call. CLIManager
   * reads this after the turn completes and folds it into the cost record.
   * Reset to zeros on every `startSession` so stale stats don't leak forward.
   */
  private lastCacheUsage: CacheUsageReport = {
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    cacheInjected: false,
  }

  /** Update the cache policy used on subsequent direct-API calls. */
  setCachePolicy(policy: CachePolicy): void {
    this.cachePolicy = { ...policy }
  }

  /**
   * Read the cache usage from the most recent direct-API turn. Returns a
   * defensive copy so callers can't mutate adapter state. CLIManager uses
   * this to populate `cachedInputTokens` / `cacheCreationTokens` on the
   * CostRecord.
   */
  getLastCacheUsage(): CacheUsageReport {
    return { ...this.lastCacheUsage }
  }

  async isInstalled(): Promise<boolean> {
    // Check if either Ollama or LM Studio is reachable
    const [ollama, lmstudio] = await Promise.all([
      this.ping(`${this.ollamaUrl}/api/tags`),
      this.ping(`${this.lmStudioUrl}/v1/models`),
    ])
    return ollama || lmstudio
  }

  async isAuthenticated(): Promise<boolean> {
    // Local models don't need authentication
    return this.isInstalled()
  }

  async detectServers(): Promise<{
    ollama: { connected: boolean; models: LocalModel[] }
    lmstudio: { connected: boolean; models: LocalModel[] }
  }> {
    const result = {
      ollama: { connected: false, models: [] as LocalModel[] },
      lmstudio: { connected: false, models: [] as LocalModel[] },
    }

    // Check Ollama
    try {
      const data = await this.httpGet(`${this.ollamaUrl}/api/tags`)
      const parsed = JSON.parse(data) as { models?: Array<{ name: string; size?: number }> }
      result.ollama.connected = true
      result.ollama.models = (parsed.models ?? []).map((m) => ({
        name: m.name,
        source: 'ollama' as const,
        size: m.size ? `${(m.size / 1e9).toFixed(1)}GB` : undefined,
      }))
    } catch { /* not running */ }

    // Check LM Studio
    try {
      const data = await this.httpGet(`${this.lmStudioUrl}/v1/models`)
      const parsed = JSON.parse(data) as { data?: Array<{ id: string }> }
      result.lmstudio.connected = true
      result.lmstudio.models = (parsed.data ?? []).map((m) => ({
        name: m.id,
        source: 'lmstudio' as const,
      }))
    } catch { /* not running */ }

    return result
  }

  buildArgs(_options: SessionOptions): string[] {
    // Not applicable — we use HTTP APIs
    return []
  }

  parseOutput(line: string): ParsedOutput {
    const trimmed = line.trim()
    if (!trimmed) return { type: 'text', content: '' }
    if (trimmed.startsWith('Error') || trimmed.startsWith('error:')) {
      return { type: 'error', content: trimmed }
    }
    return { type: 'text', content: trimmed }
  }

  startSession(options: SessionOptions): SessionHandle {
    // Build a SessionHandle backed by real PassThrough streams + an EventEmitter.
    // No ChildProcess cast — SessionHandle is structurally what CLIManager needs.
    const stdout = new PassThrough()
    const stderr = new PassThrough()
    const stdin = new PassThrough()
    const emitter = new EventEmitter()

    // Reset cache usage at the start of every turn — `getLastCacheUsage()` after
    // a non-Anthropic turn should report 0/0, not the previous Anthropic turn's
    // numbers.
    this.lastCacheUsage = { cachedInputTokens: 0, cacheCreationTokens: 0, cacheInjected: false }

    const handle: SessionHandle = {
      pid: -1,
      stdout,
      stderr,
      stdin,
      kill: () => { emitter.emit('exit', 0, null); return true },
      on: ((event: string, listener: (...args: unknown[]) => void) => {
        emitter.on(event, listener)
        return handle
      }) as SessionHandle['on'],
    }

    if (options.prompt) {
      this.conversationHistory.push({ role: 'user', content: options.prompt })

      // Determine which server to use based on model name.
      // - Anthropic family → api.anthropic.com (this is where cache_control
      //   injection happens — see chatAnthropic).
      // - Slash in model name → LM Studio's HuggingFace-style ids.
      // - Otherwise → Ollama.
      const model = options.model ?? 'llama3'
      const route: 'anthropic' | 'lmstudio' | 'ollama' = isAnthropicModel(model)
        ? 'anthropic'
        : model.includes('/')
          ? 'lmstudio'
          : 'ollama'

      void this.streamChat(model, route, this.conversationHistory, options)
        .then((response) => {
          this.conversationHistory.push({ role: 'assistant', content: response })
          stdout.write(Buffer.from(response + '\n'))
          stdout.end()
          emitter.emit('exit', 0, null)
        })
        .catch((err) => {
          stderr.write(Buffer.from(String(err) + '\n'))
          stderr.end()
          emitter.emit('exit', 1, null)
        })
    }

    return handle
  }

  sendInput(_proc: SessionHandle, input: string): void {
    // For local models, we manage conversation history internally
    this.conversationHistory.push({ role: 'user', content: input })
  }

  sendSlashCommand(proc: SessionHandle, command: string): void {
    this.sendInput(proc, command)
  }

  /**
   * Public single-shot chat completion for use outside the session flow.
   * Used by extensions (e.g., efficiency coach) for analysis tasks.
   */
  async chat(
    model: string,
    messages: ChatMessage[],
    source?: 'ollama' | 'lmstudio' | 'anthropic',
  ): Promise<string> {
    const useSource: 'ollama' | 'lmstudio' | 'anthropic' =
      source ?? (isAnthropicModel(model)
        ? 'anthropic'
        : model.includes('/')
          ? 'lmstudio'
          : 'ollama')
    if (useSource === 'lmstudio') {
      return this.chatLmStudio(model, messages)
    }
    if (useSource === 'anthropic') {
      return this.chatAnthropic(model, messages)
    }
    return this.chatOllama(model, messages)
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async streamChat(
    model: string,
    route: 'anthropic' | 'lmstudio' | 'ollama',
    messages: ChatMessage[],
    options?: SessionOptions,
  ): Promise<string> {
    if (route === 'anthropic') {
      return this.chatAnthropic(model, messages, options)
    }
    if (route === 'lmstudio') {
      return this.chatLmStudio(model, messages)
    }
    return this.chatOllama(model, messages)
  }

  private async chatOllama(model: string, messages: ChatMessage[]): Promise<string> {
    const body = JSON.stringify({ model, messages, stream: false })
    const data = await this.httpPost(`${this.ollamaUrl}/api/chat`, body)
    const parsed = JSON.parse(data) as { message?: { content: string } }
    return parsed.message?.content ?? ''
  }

  private async chatLmStudio(model: string, messages: ChatMessage[]): Promise<string> {
    const body = JSON.stringify({ model, messages, stream: false })
    const data = await this.httpPost(`${this.lmStudioUrl}/v1/chat/completions`, body)
    const parsed = JSON.parse(data) as { choices?: Array<{ message: { content: string } }> }
    return parsed.choices?.[0]?.message?.content ?? ''
  }

  /**
   * Anthropic Messages API — the only direct-API path where ClearPath owns the
   * request construction, so it's the only place we can inject `cache_control`.
   *
   * Phase 3 logic:
   *   1. Reassemble the stable prefix from `options.promptSlices` in the
   *      SAME canonical order used by `prefixOrderMiddleware`. We can't use
   *      ctx.cacheBreakpoint here because we're past the pipeline — but the
   *      slices arrive on options unchanged and the order is well-defined.
   *   2. Tokenize the prefix. If it meets the per-model minimum AND the
   *      policy is enabled, emit a content-block array with cache_control on
   *      the LAST stable block. Otherwise, send the prompt as a single
   *      string and skip cache markers.
   *   3. Capture `cache_read_input_tokens` and `cache_creation_input_tokens`
   *      from the response's usage object. CLIManager reads these via
   *      `getLastCacheUsage()` after the turn ends.
   *
   * API key resolution: ANTHROPIC_API_KEY env var (already set up by the
   * existing claude-sdk plumbing). When absent we fail with a friendly error
   * — the only way an Anthropic model lands on LocalModelAdapter is via a
   * user-driven config in any case.
   */
  private async chatAnthropic(
    model: string,
    messages: ChatMessage[],
    options?: SessionOptions,
  ): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set — cannot call Anthropic API directly')
    }

    // Most recent user message is the volatile suffix; everything else is the
    // "history" that travels in messages[]. The cache breakpoint lives between
    // the (stable) system + early messages and the new user message.
    //
    // For our usage today, the conversation history is built inside the adapter
    // (this.conversationHistory) — so we treat the most recent message as the
    // suffix and the rest as the stable prefix.
    const lastIdx = messages.length - 1
    const stableMessages = lastIdx > 0 ? messages.slice(0, lastIdx) : []
    const suffixMessage = lastIdx >= 0 ? messages[lastIdx] : null

    // Build the system block out of the SAME slices that `prefixOrderMiddleware`
    // reassembled — fleet → agent → notes → context-sources. The user-text
    // slice rides as the volatile suffix message. When `promptSlices` is
    // absent, we have nothing structured to cache, so we fall through to the
    // single-string path.
    const slices = options?.promptSlices
    let systemPrefixText = ''
    if (slices) {
      const parts: string[] = []
      if (slices.fleetPrefix    && slices.fleetPrefix.length    > 0) parts.push(slices.fleetPrefix)
      if (slices.agentPrompt    && slices.agentPrompt.length    > 0) parts.push(slices.agentPrompt)
      if (slices.notesFramed    && slices.notesFramed.length    > 0) parts.push(slices.notesFramed)
      if (slices.contextSources && slices.contextSources.length > 0) parts.push(slices.contextSources)
      systemPrefixText = parts.join('\n\n')
    }

    // Decide whether to inject cache_control. The minimum prefix size lives in
    // cachePolicy.ts; for non-anthropic models shouldCachePrefix bails on the
    // policy.enabled gate first.
    const prefixTokens = systemPrefixText
      ? tokenCounter.count(systemPrefixText, model)
      : 0
    const cacheEligible = shouldCachePrefix(prefixTokens, model, this.cachePolicy)

    // Body construction. When eligible, the system field carries content
    // blocks with cache_control on the last block. Otherwise it's a plain
    // string (or omitted when empty).
    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: [
        ...stableMessages,
        ...(suffixMessage ? [suffixMessage] : []),
      ],
    }

    if (systemPrefixText.length > 0) {
      if (cacheEligible) {
        body.system = [
          {
            type: 'text',
            text: systemPrefixText,
            cache_control: { type: 'ephemeral', ...(this.cachePolicy.ttl === '1h' ? { ttl: '1h' } : {}) },
          },
        ]
        this.lastCacheUsage.cacheInjected = true
        this.lastCacheUsage.reason = `prefix ${prefixTokens} tok meets ${model} minimum`
      } else {
        body.system = systemPrefixText
        this.lastCacheUsage.reason = this.cachePolicy.enabled
          ? `prefix ${prefixTokens} tok below ${model} minimum`
          : 'cache policy disabled'
      }
    } else {
      this.lastCacheUsage.reason = 'no stable prefix'
    }

    const data = await this.httpPost(
      `${this.anthropicUrl}/v1/messages`,
      JSON.stringify(body),
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    )

    interface AnthropicResponse {
      content?: Array<{ type: string; text?: string }>
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
    }
    const parsed = JSON.parse(data) as AnthropicResponse

    // Capture cache stats reported by the API. These come from the wire —
    // never invented. CLIManager folds them into the CostRecord.
    if (parsed.usage) {
      this.lastCacheUsage.cachedInputTokens = parsed.usage.cache_read_input_tokens ?? 0
      this.lastCacheUsage.cacheCreationTokens = parsed.usage.cache_creation_input_tokens ?? 0
    }

    // Anthropic returns content as an array of blocks; join the text blocks.
    const blocks = parsed.content ?? []
    return blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
  }

  private ping(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const transport = url.startsWith('https') ? https : http
      const req = transport.get(url, { timeout: 3000 }, (res) => {
        res.resume()
        resolve(res.statusCode === 200)
      })
      req.on('error', () => resolve(false))
      req.on('timeout', () => { req.destroy(); resolve(false) })
    })
  }

  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const transport = url.startsWith('https') ? https : http
      const req = transport.get(url, { timeout: 5000 }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    })
  }

  private httpPost(url: string, body: string, extraHeaders?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const transport = parsed.protocol === 'https:' ? https : http
      const headers: Record<string, string | number> = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(extraHeaders ?? {}),
      }
      const req = transport.request({
        hostname: parsed.hostname, port: parsed.port,
        path: parsed.pathname, method: 'POST',
        headers,
        timeout: 120000,
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => resolve(data))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
      req.write(body)
      req.end()
    })
  }
}
