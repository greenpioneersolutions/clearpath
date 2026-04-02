import http from 'http'
import https from 'https'
import type { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { SessionOptions, ParsedOutput } from './types'
import type { ICLIAdapter } from './types'

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
 * Adapter that talks to local model servers (Ollama, LM Studio)
 * via HTTP APIs instead of spawning CLI processes.
 */
export class LocalModelAdapter implements ICLIAdapter {
  readonly cliName = 'local'
  binaryPath = 'local'

  private ollamaUrl = 'http://localhost:11434'
  private lmStudioUrl = 'http://localhost:1234'
  private conversationHistory: ChatMessage[] = []

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

  startSession(options: SessionOptions): ChildProcess {
    // Create a fake ChildProcess-like object that wraps HTTP streaming
    const emitter = new EventEmitter()
    const fakeProcess = emitter as unknown as ChildProcess

    // Set up readable streams
    const stdoutEmitter = new EventEmitter()
    const stderrEmitter = new EventEmitter();
    (fakeProcess as unknown as Record<string, unknown>)['stdout'] = stdoutEmitter;
    (fakeProcess as unknown as Record<string, unknown>)['stderr'] = stderrEmitter;
    (fakeProcess as unknown as Record<string, unknown>)['stdin'] = {
      write: () => {},
      end: () => {},
    };
    (fakeProcess as unknown as Record<string, unknown>)['pid'] = -1

    if (options.prompt) {
      this.conversationHistory.push({ role: 'user', content: options.prompt })

      // Determine which server to use based on model name
      const model = options.model ?? 'llama3'
      const isLmStudio = model.includes('/')

      void this.streamChat(model, isLmStudio, this.conversationHistory)
        .then((response) => {
          this.conversationHistory.push({ role: 'assistant', content: response })
          stdoutEmitter.emit('data', Buffer.from(response + '\n'))
          emitter.emit('exit', 0, null)
        })
        .catch((err) => {
          stderrEmitter.emit('data', Buffer.from(String(err) + '\n'))
          emitter.emit('exit', 1, null)
        })
    }

    return fakeProcess
  }

  sendInput(proc: ChildProcess, input: string): void {
    // For local models, we manage conversation history internally
    this.conversationHistory.push({ role: 'user', content: input })
  }

  sendSlashCommand(proc: ChildProcess, command: string): void {
    this.sendInput(proc, command)
  }

  // ── HTTP helpers ───────────────────────────────────────────────────────────

  private async streamChat(model: string, isLmStudio: boolean, messages: ChatMessage[]): Promise<string> {
    if (isLmStudio) {
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

  private httpPost(url: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url)
      const transport = parsed.protocol === 'https:' ? https : http
      const req = transport.request({
        hostname: parsed.hostname, port: parsed.port,
        path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
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
