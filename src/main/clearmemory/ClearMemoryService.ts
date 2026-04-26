import { EventEmitter } from 'events'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { ChildProcess } from 'child_process'

import { log } from '../utils/logger'
import { resolveClearMemoryBinary, type BinarySource } from './binaryResolver'
import type { ClearMemoryConfig, ClearMemoryTier } from './types'

const execFileAsync = promisify(execFile)

// ── ClearMemoryService ───────────────────────────────────────────────────────
// Owns the lifecycle of the `clearmemory serve --both` daemon:
//   • binary resolution (bundled or PATH)
//   • spawn + supervised restart
//   • health polling
//   • authenticated HTTP requests scoped to 127.0.0.1
//   • first-run `clearmemory init` with streamed progress
//
// Exposed as an EventEmitter singleton so IPC handlers can subscribe to
// lifecycle events (state-change, init-progress, log, ready, crashed, error).

export type ClearMemoryState =
  | 'stopped'
  | 'starting'
  | 'ready'
  | 'crashed'
  | 'missing-binary'

export interface InitProgressEvent {
  kind: 'log' | 'progress' | 'done' | 'error'
  message: string
  percent?: number
}

export interface ClearMemoryLogLine {
  stream: 'stdout' | 'stderr'
  line: string
  timestamp: number
}

const HTTP_HOST = '127.0.0.1'
const DEFAULT_HTTP_PORT = 8080
const DEFAULT_MCP_PORT = 9700
const HEALTH_POLL_INTERVAL_MS = 500
const HEALTH_POLL_TIMEOUT_MS = 30_000
const HEALTH_CACHE_TTL_MS = 5_000
const RESTART_BACKOFFS_MS = [1_000, 3_000, 9_000]
const LOG_RING_CAPACITY = 200

/** HTTP error raised by request<T>() on non-2xx responses from the daemon. */
export class ClearMemoryHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `ClearMemory HTTP ${status}`)
    this.name = 'ClearMemoryHttpError'
  }
}

/** Error raised by execCli() when the CLI returns a non-zero exit code. */
export class ClearMemoryCliError extends Error {
  constructor(
    public readonly code: number | null,
    public readonly stdout: string,
    public readonly stderr: string,
    message?: string,
  ) {
    super(message ?? `clearmemory CLI exited with code ${code}`)
    this.name = 'ClearMemoryCliError'
  }
}

/** Default timeout for short CLI queries (list/describe/add/remove). */
const DEFAULT_CLI_TIMEOUT_MS = 10_000

export class ClearMemoryService extends EventEmitter {
  private proc: ChildProcess | null = null
  private token: string | null = null
  private _status: ClearMemoryState = 'stopped'
  private readonly httpPort: number = DEFAULT_HTTP_PORT
  private readonly mcpPort: number = DEFAULT_MCP_PORT
  private binarySource: BinarySource = 'missing'
  private binaryPath = ''
  private startedAt: number | null = null
  private restartAttempts = 0
  private restartTimer: NodeJS.Timeout | null = null
  private stopping = false
  private logRing: ClearMemoryLogLine[] = []
  private lastHealthOkAt = 0
  private startPromise: Promise<void> | null = null

  // ── Public getters ─────────────────────────────────────────────────────────

  get status(): ClearMemoryState {
    return this._status
  }

  get binaryInfo(): { source: BinarySource; path: string } {
    return { source: this.binarySource, path: this.binaryPath }
  }

  get ports(): { httpPort: number; mcpPort: number } {
    return { httpPort: this.httpPort, mcpPort: this.mcpPort }
  }

  get uptimeSec(): number {
    if (!this.startedAt || this._status !== 'ready') return 0
    return Math.max(0, Math.floor((Date.now() - this.startedAt) / 1000))
  }

  /** Last N log lines from the daemon's stdout/stderr (ring buffer). */
  getLogs(): ClearMemoryLogLine[] {
    return [...this.logRing]
  }

  /** Tail lines — most recent first, capped at `max`. */
  getStderrTail(max = 20): string[] {
    const lines = this.logRing
      .filter((l) => l.stream === 'stderr')
      .slice(-max)
      .map((l) => l.line)
    return lines
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Spawn `clearmemory serve --both` and wait for /v1/health to return ok.
   * Deduplicates concurrent calls: if a start is already in flight, the
   * second caller awaits the same promise.
   */
  async start(): Promise<void> {
    if (this.startPromise) return this.startPromise
    if (this._status === 'ready' && this.proc) return

    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null
    })
    return this.startPromise
  }

  private async doStart(): Promise<void> {
    const resolved = await resolveClearMemoryBinary()
    this.binarySource = resolved.source
    this.binaryPath = resolved.path

    if (resolved.source === 'missing') {
      this.setStatus('missing-binary')
      log.warn('[clearmemory] binary missing: %s', resolved.error ?? '(no error)')
      return
    }

    this.setStatus('starting')

    // Upstream `serve` subcommand only accepts --http, --both, --port.
    // MCP port is hardcoded to 9700 by the daemon; config dir is ~/.clearmemory/.
    const args = [
      'serve',
      '--both',
      '--port', String(this.httpPort),
    ]

    let proc: ChildProcess
    try {
      proc = spawn(resolved.path, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        // Detach=false so the daemon dies with our app if we don't clean up.
        detached: false,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[clearmemory] spawn failed: %s', msg)
      this.setStatus('crashed')
      this.emit('error', new Error(`Failed to spawn clearmemory: ${msg}`))
      return
    }

    this.proc = proc
    this.stopping = false

    proc.stdout?.on('data', (chunk: Buffer) => this.handleOutput('stdout', chunk))
    proc.stderr?.on('data', (chunk: Buffer) => this.handleOutput('stderr', chunk))

    proc.on('exit', (code, signal) => this.handleExit(code, signal))
    proc.on('error', (err) => {
      log.error('[clearmemory] process error: %s', err.message)
      this.emit('error', err)
    })

    // Wait for daemon health; swallow errors into status.
    try {
      await this.waitForHealth(HEALTH_POLL_TIMEOUT_MS)
      this.restartAttempts = 0
      this.startedAt = Date.now()
      // Best-effort token load — never fatal, Slice C will refine.
      await this.loadToken().catch((err) => {
        log.warn('[clearmemory] token load failed (continuing without auth): %s', err?.message ?? err)
      })
      this.setStatus('ready')
      this.emit('ready')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error('[clearmemory] health wait failed: %s', msg)
      // If proc still alive, kill it; it clearly isn't listening.
      if (this.proc && !this.proc.killed) {
        try { this.proc.kill('SIGTERM') } catch { /* ignore */ }
      }
      this.setStatus('crashed')
      this.emit('error', err instanceof Error ? err : new Error(msg))
    }
  }

  /**
   * Gracefully stop the daemon: SIGTERM, then SIGKILL after `gracefulMs`.
   * Idempotent — no-op if not running.
   */
  async stop(gracefulMs = 5_000): Promise<void> {
    this.stopping = true
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    const proc = this.proc
    if (!proc) {
      this.setStatus('stopped')
      return
    }

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }

      proc.once('exit', finish)

      try {
        proc.kill('SIGTERM')
      } catch {
        // already dead
        finish()
        return
      }

      const killTimer = setTimeout(() => {
        if (!proc.killed) {
          try { proc.kill('SIGKILL') } catch { /* ignore */ }
        }
        finish()
      }, gracefulMs)

      // Safety: if exit never fires, unblock after 2x graceful window.
      setTimeout(() => {
        clearTimeout(killTimer)
        finish()
      }, gracefulMs * 2 + 500)
    })

    this.proc = null
    this.startedAt = null
    this.token = null
    this.setStatus('stopped')
  }

  /**
   * True iff the service is in the `ready` state AND `/v1/health` has
   * responded ok within the last HEALTH_CACHE_TTL_MS.
   */
  async isReady(): Promise<boolean> {
    if (this._status !== 'ready') return false
    if (Date.now() - this.lastHealthOkAt < HEALTH_CACHE_TTL_MS) return true
    try {
      const ok = await this.pingHealth()
      if (ok) this.lastHealthOkAt = Date.now()
      return ok
    } catch {
      return false
    }
  }

  /** Poll `GET /v1/health` every 500ms until it returns ok or we time out. */
  async waitForHealth(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const ok = await this.pingHealth()
        if (ok) {
          this.lastHealthOkAt = Date.now()
          return
        }
      } catch {
        // keep polling
      }
      await sleep(HEALTH_POLL_INTERVAL_MS)
    }
    throw new Error(`clearmemory health check did not succeed within ${timeoutMs}ms`)
  }

  private async pingHealth(): Promise<boolean> {
    try {
      const res = await fetch(`http://${HTTP_HOST}:${this.httpPort}/v1/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      return res.ok
    } catch {
      return false
    }
  }

  // ── HTTP client ────────────────────────────────────────────────────────────

  /**
   * Authenticated HTTP request to the local daemon.
   * - URL is always pinned to 127.0.0.1:httpPort — callers only supply the path.
   * - Bearer token attached when available.
   * - Non-2xx throws ClearMemoryHttpError with status + body.
   */
  async request<T>(method: string, pathname: string, body?: unknown): Promise<T> {
    if (!pathname.startsWith('/')) {
      throw new Error(`ClearMemory request path must start with '/': got ${pathname}`)
    }
    const url = `http://${HTTP_HOST}:${this.httpPort}${pathname}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`

    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    const text = await res.text()
    let parsed: unknown = null
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = text
      }
    }

    if (!res.ok) {
      throw new ClearMemoryHttpError(res.status, parsed, `ClearMemory HTTP ${res.status} ${method} ${pathname}`)
    }

    return parsed as T
  }

  // ── Token loading ──────────────────────────────────────────────────────────

  /**
   * Attempt to obtain a bearer token from the clearmemory CLI.
   *
   * Upstream README documents `clearmemory` as an HTTP+MCP daemon but does NOT
   * formally specify an `auth` subcommand at the time of this slice. We try a
   * few conservative probes and fall back silently if none succeed — the
   * daemon may not require auth in local mode. A TODO is left for Slice C to
   * refine once the CLI surface is confirmed.
   */
  async loadToken(): Promise<void> {
    if (!this.binaryPath) return

    // Probe 1: `auth status` (global --json flag may emit JSON; plain text also supported)
    try {
      const { stdout } = await execFileAsync(
        this.binaryPath,
        ['--json', 'auth', 'status'],
        { timeout: 5_000 },
      )
      const tok = extractTokenFromStdout(stdout)
      if (tok) {
        this.token = tok
        return
      }
    } catch {
      // fall through
    }

    // Probe 2: `auth create --scope read-write`
    // Upstream prints a "Token created:\n  Raw:   <token>" block in plain text.
    try {
      const { stdout } = await execFileAsync(
        this.binaryPath,
        ['auth', 'create', '--scope', 'read-write', '--label', 'clearpath-app'],
        { timeout: 5_000 },
      )
      const tok = extractTokenFromStdout(stdout)
      if (tok) {
        this.token = tok
        return
      }
    } catch {
      // fall through
    }

    // TODO(slice-c): confirm ClearMemory's actual auth subcommand surface and
    // wire up persistent token storage. For now we run unauthenticated — the
    // local-only daemon is behind a loopback bind so the blast radius is
    // limited to the current user account.
    log.warn('[clearmemory] no bearer token available — proceeding unauthenticated')
  }

  // ── First-run init ─────────────────────────────────────────────────────────

  /**
   * Ensure `clearmemory init` has run. If a config file already exists in
   * either `~/.clearmemory/` or the per-app userData config dir, we skip.
   * Otherwise spawns `clearmemory init --tier <tier>` and forwards progress.
   */
  async ensureInitialized(tier: ClearMemoryTier = 'offline'): Promise<void> {
    if (!this.binaryPath) {
      const resolved = await resolveClearMemoryBinary()
      this.binarySource = resolved.source
      this.binaryPath = resolved.path
      if (resolved.source === 'missing') {
        throw new Error(resolved.error ?? 'clearmemory binary not found')
      }
    }

    if (await this.isAlreadyInitialized()) {
      this.emitInit('log', 'ClearMemory already initialized — skipping setup.')
      this.emitInit('done', 'done')
      return
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(this.binaryPath, ['init', '--tier', tier], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const onLine = (stream: 'stdout' | 'stderr') => (chunk: Buffer) => {
        for (const raw of chunk.toString().split(/\r?\n/)) {
          const line = raw.trim()
          if (!line) continue
          this.emitInitLine(stream, line)
        }
      }
      proc.stdout?.on('data', onLine('stdout'))
      proc.stderr?.on('data', onLine('stderr'))

      proc.on('error', (err) => {
        this.emitInit('error', err.message)
        reject(err)
      })

      proc.on('exit', (code) => {
        if (code === 0) {
          this.emitInit('done', 'done')
          resolve()
        } else {
          const msg = `clearmemory init exited with code ${code}`
          this.emitInit('error', msg)
          reject(new Error(msg))
        }
      })
    })
  }

  private async isAlreadyInitialized(): Promise<boolean> {
    // Two plausible locations per upstream README: user home and userData
    const candidates = [
      join(app.getPath('home'), '.clearmemory', 'config.toml'),
      join(app.getPath('userData'), 'clearmemory', 'config.toml'),
    ]
    for (const p of candidates) {
      try {
        if (existsSync(p)) return true
      } catch { /* ignore */ }
    }
    return false
  }

  private emitInitLine(stream: 'stdout' | 'stderr', line: string): void {
    const pct = parseProgressPercent(line)
    if (pct != null) {
      this.emitInit('progress', line, pct)
    } else if (stream === 'stderr' && /error/i.test(line)) {
      this.emitInit('error', line)
    } else {
      this.emitInit('log', line)
    }
  }

  private emitInit(kind: InitProgressEvent['kind'], message: string, percent?: number): void {
    const payload: InitProgressEvent = { kind, message }
    if (percent != null) payload.percent = percent
    this.emit('init-progress', payload)
  }

  // ── Config (stub; Slice C will expand) ─────────────────────────────────────

  /**
   * Merge-write a partial config. Today this is a best-effort stub:
   * - We attempt `clearmemory config set KEY VALUE` per key.
   * - If that subcommand isn't available, we log a warning and return without
   *   touching disk (Slice C will implement a proper TOML writer).
   */
  async recordConfig(patch: Partial<ClearMemoryConfig>): Promise<void> {
    if (!this.binaryPath) return

    const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return

    for (const [key, value] of entries) {
      try {
        await execFileAsync(
          this.binaryPath,
          ['config', 'set', key, String(value)],
          { timeout: 5_000 },
        )
      } catch (err) {
        // TODO(slice-c): fall through to direct TOML edit once schema confirmed.
        log.warn('[clearmemory] `config set %s` failed: %s', key, (err as Error).message)
      }
    }
  }

  // ── CLI executor (Slice D) ─────────────────────────────────────────────────

  /**
   * Run a one-shot `clearmemory` CLI command and return captured stdout/stderr.
   *
   * Used for list/describe/add/remove-style commands that complete in
   * milliseconds. For long-running commands that the UI needs to stream
   * progress from (e.g. `import`), use {@link spawnCli} instead.
   *
   * When `opts.json` is true we prepend the global `--json` flag so
   * commands that support it emit parseable JSON. Commands that don't
   * support `--json` typically still succeed and emit their usual text,
   * so callers should try `JSON.parse(stdout)` and fall back to text
   * parsing.
   */
  async execCli(
    args: string[],
    opts: { timeoutMs?: number; json?: boolean } = {},
  ): Promise<{ stdout: string; stderr: string }> {
    if (!this.binaryPath) {
      throw new ClearMemoryCliError(null, '', '', 'clearmemory binary path is not resolved')
    }
    const finalArgs = opts.json ? ['--json', ...args] : args
    const timeout = opts.timeoutMs ?? DEFAULT_CLI_TIMEOUT_MS
    try {
      const { stdout, stderr } = await execFileAsync(this.binaryPath, finalArgs, {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB — streams/tags output can be chatty
      })
      return { stdout: stdout.toString(), stderr: stderr.toString() }
    } catch (err) {
      // execFileAsync throws a shape with {stdout, stderr, code} on non-zero exits.
      const e = err as NodeJS.ErrnoException & {
        stdout?: string | Buffer
        stderr?: string | Buffer
        code?: number | string
      }
      const stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString() ?? ''
      const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString() ?? ''
      const code = typeof e.code === 'number' ? e.code : null
      const msg = (stderr.trim() || stdout.trim() || e.message || 'clearmemory CLI failed').slice(0, 2_000)
      throw new ClearMemoryCliError(code, stdout, stderr, msg)
    }
  }

  /**
   * Spawn a long-running `clearmemory` subcommand. Caller is responsible
   * for wiring `stdout`, `stderr`, and `exit` handlers, and for killing
   * the process on cancel.
   */
  spawnCli(args: string[]): ChildProcess {
    if (!this.binaryPath) {
      throw new ClearMemoryCliError(null, '', '', 'clearmemory binary path is not resolved')
    }
    return spawn(this.binaryPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private setStatus(next: ClearMemoryState): void {
    if (this._status === next) return
    this._status = next
    this.emit('state-change', next)
  }

  private handleOutput(stream: 'stdout' | 'stderr', chunk: Buffer): void {
    for (const raw of chunk.toString().split(/\r?\n/)) {
      const line = raw.trim()
      if (!line) continue
      this.pushLog(stream, line)
      this.emit('log', { stream, line, timestamp: Date.now() } satisfies ClearMemoryLogLine)
    }
  }

  private pushLog(stream: 'stdout' | 'stderr', line: string): void {
    this.logRing.push({ stream, line, timestamp: Date.now() })
    if (this.logRing.length > LOG_RING_CAPACITY) {
      this.logRing.splice(0, this.logRing.length - LOG_RING_CAPACITY)
    }
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.proc = null
    this.startedAt = null

    if (this.stopping) {
      // Intentional stop — don't restart.
      this.setStatus('stopped')
      return
    }

    const nonZero = code != null && code !== 0
    if (nonZero || signal) {
      log.warn('[clearmemory] daemon exited (code=%s signal=%s) — scheduling restart', String(code), String(signal))
      const tail = this.getStderrTail(20)
      this.setStatus('crashed')
      this.emit('crashed', { code, signal, stderrTail: tail })
      this.scheduleRestart()
    } else {
      // Exit 0 without a stop request still leaves us idle.
      this.setStatus('stopped')
    }
  }

  private scheduleRestart(): void {
    const backoff = RESTART_BACKOFFS_MS[this.restartAttempts]
    if (backoff == null) {
      log.error('[clearmemory] exceeded max restart attempts — remaining crashed')
      this.emit('error', new Error('clearmemory failed to start after repeated attempts'))
      return
    }
    this.restartAttempts += 1
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.stopping) return
      log.info('[clearmemory] auto-restart attempt #%d', this.restartAttempts)
      void this.start().catch((err) => {
        log.error('[clearmemory] restart attempt failed: %s', err?.message ?? err)
      })
    }, backoff)
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Parse "45%" or "Downloading... 45%" or "Downloading 120/240 MB". */
export function parseProgressPercent(line: string): number | null {
  const pctMatch = line.match(/(\d{1,3})\s*%/)
  if (pctMatch) {
    const n = parseInt(pctMatch[1], 10)
    if (Number.isFinite(n) && n >= 0 && n <= 100) return n
  }
  const fracMatch = line.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:mb|gb|kb|bytes)?/i)
  if (fracMatch) {
    const num = parseFloat(fracMatch[1])
    const den = parseFloat(fracMatch[2])
    if (den > 0) {
      const pct = Math.max(0, Math.min(100, Math.round((num / den) * 100)))
      return pct
    }
  }
  return null
}

/** Extract a bearer-like token from CLI stdout — tolerant of JSON or plain. */
export function extractTokenFromStdout(stdout: string): string | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const candidates = ['token', 'bearer', 'access_token', 'accessToken', 'auth_token']
    for (const key of candidates) {
      const v = parsed[key]
      if (typeof v === 'string' && v.length > 0) return v
    }
  } catch {
    // not JSON — fall through
  }

  // Plain text: upstream `auth create` emits "  Raw:   <token>" on one line.
  // Accept "Raw:", "Token:", "Bearer:", or "Auth(-|_)Token:" keys.
  const line = trimmed
    .split(/\r?\n/)
    .find((l) => /^\s*(raw|token|bearer|auth[_-]?token)\s*[:=]/i.test(l))
  if (line) {
    const m = line.match(/[:=]\s*(\S+)/)
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, '')
  }
  return null
}

// Singleton — handlers import this rather than newing up the service
// themselves, so lifecycle state is shared across IPC entry points.
export const clearMemoryService = new ClearMemoryService()
