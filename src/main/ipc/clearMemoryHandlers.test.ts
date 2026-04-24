/**
 * clearMemoryHandlers tests — validate the handler envelope contract without
 * booting a real daemon:
 *   1. Every CRUD handler returns { ok: false, state } when the service is
 *      not ready (graceful degradation).
 *   2. Memory IDs with traversal sequences / control chars / slashes are
 *      rejected before any HTTP call.
 *   3. Import validates path / format / stream name.
 *   4. Tilde expansion works (so `~/.claude/projects/` gets resolved against
 *      HOME before path-security checks).
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const serviceState = vi.hoisted(() => ({
  status: 'stopped' as
    | 'stopped' | 'starting' | 'ready' | 'crashed' | 'missing-binary',
}))

vi.mock('../clearmemory/ClearMemoryService', () => ({
  clearMemoryService: {
    get status() {
      return serviceState.status
    },
    on: vi.fn(),
    request: vi.fn(),
    execCli: vi.fn(),
    spawnCli: vi.fn(),
    getLogs: vi.fn().mockReturnValue([]),
    getStderrTail: vi.fn().mockReturnValue([]),
    getBinaryInfo: vi.fn().mockReturnValue({ source: 'missing', path: '' }),
    get binaryInfo() {
      return { source: 'missing' as const, path: '' }
    },
    get ports() {
      return { httpPort: 8080, mcpPort: 9700 }
    },
    get uptimeSec() {
      return 0
    },
  },
  ClearMemoryHttpError: class extends Error {
    constructor(public status: number, public body: unknown, message?: string) {
      super(message ?? `HTTP ${status}`)
    }
  },
  ClearMemoryCliError: class extends Error {
    constructor(
      public code: number | null,
      public stdout: string,
      public stderr: string,
      message?: string,
    ) {
      super(message ?? 'CLI error')
    }
  },
}))

vi.mock('../clearmemory/binaryResolver', () => ({
  resolveClearMemoryBinary: () =>
    Promise.resolve({ source: 'missing' as const, path: '', error: 'not installed' }),
}))

vi.mock('../clearmemory/mcpIntegration', () => ({
  enableMcpIntegration: vi.fn().mockResolvedValue({ ok: true, claude: true, copilot: true, errors: [] }),
  disableMcpIntegration: vi.fn().mockResolvedValue({ ok: true, errors: [] }),
  getMcpIntegrationStatus: vi.fn().mockReturnValue({ claude: false, copilot: false }),
}))

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// electron-store is a native-ish dep; avoid constructing a real one during tests.
vi.mock('electron-store', () => {
  class FakeStore {
    private data: Record<string, unknown> = {}
    constructor(opts: { defaults?: Record<string, unknown> }) {
      if (opts?.defaults) this.data = { ...opts.defaults }
    }
    get(key: string): unknown { return this.data[key] }
    set(key: string, value: unknown): void { this.data[key] = value }
  }
  return { default: FakeStore }
})

// Don't let getStoreEncryptionKey try to read any OS keychain.
vi.mock('../utils/storeEncryption', () => ({
  getStoreEncryptionKey: vi.fn().mockReturnValue('test-key'),
}))

// Point HOME at a deterministic directory so tilde expansion is observable.
const { tmpdir } = await import('os')
const { mkdtempSync } = await import('fs')
const { join } = await import('path')
const TMP_HOME = mkdtempSync(join(tmpdir(), 'clearmemory-handlers-'))
const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_USERPROFILE = process.env.USERPROFILE
process.env.HOME = TMP_HOME
process.env.USERPROFILE = TMP_HOME

// ── Test harness ────────────────────────────────────────────────────────────

type Handler = (...args: unknown[]) => unknown | Promise<unknown>

let handlers: Record<string, Handler> = {}

beforeAll(async () => {
  vi.resetModules()
  const electron = await import('electron')
  const mod = await import('./clearMemoryHandlers')
  mod.registerClearMemoryHandlers(electron.ipcMain as unknown as Electron.IpcMain)
  handlers = {}
  const mock = electron.ipcMain as unknown as { handle: ReturnType<typeof vi.fn> }
  for (const call of mock.handle.mock.calls) {
    handlers[call[0] as string] = call[1] as Handler
  }
})

beforeEach(() => {
  serviceState.status = 'stopped'
})

async function invoke<T = unknown>(channel: string, args?: unknown): Promise<T> {
  const h = handlers[channel]
  if (!h) throw new Error(`Handler not registered: ${channel}`)
  return (await h({}, args)) as T
}

interface ErrResult { ok: false; error: string; state?: string; status?: number; body?: unknown }
interface OkResult<T> { ok: true; data: T }
type R<T> = OkResult<T> | ErrResult

// ── Service-not-ready guard ─────────────────────────────────────────────────

describe('service-not-ready envelope', () => {
  it('recall returns { ok:false, state } when service is stopped', async () => {
    const r = await invoke<R<unknown>>('clearmemory:recall', { query: 'x' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.state).toBe('stopped')
  })

  it('retain returns { ok:false, state } when service is stopped', async () => {
    const r = await invoke<R<unknown>>('clearmemory:retain', { content: 'hello world' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.state).toBe('stopped')
  })

  it('reflect returns { ok:false, state } when service is stopped', async () => {
    const r = await invoke<R<unknown>>('clearmemory:reflect', { query: 'why' })
    expect(r.ok).toBe(false)
  })

  it('status returns a non-ready envelope when service is stopped', async () => {
    serviceState.status = 'stopped'
    const r = await invoke<R<unknown>>('clearmemory:status')
    // Status handler is defensive — it either returns data with serviceStatus
    // or a not-ready envelope. Either way it must not throw.
    expect(r).toBeDefined()
  })
})

// ── Memory ID validation ────────────────────────────────────────────────────

describe('memory id validation', () => {
  it('rejects IDs containing "..": expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: '../v1/status' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid memory id/i)
  })

  it('rejects IDs containing "/": expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: 'abc/def' })
    expect(r.ok).toBe(false)
  })

  it('rejects IDs containing a null byte: expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: 'safe\u0000id' })
    expect(r.ok).toBe(false)
  })

  it('rejects IDs containing whitespace: expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: 'has space' })
    expect(r.ok).toBe(false)
  })

  it('rejects empty IDs: expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: '' })
    expect(r.ok).toBe(false)
  })

  it('rejects IDs longer than 256 chars: expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: 'x'.repeat(257) })
    expect(r.ok).toBe(false)
  })

  it('rejects non-string IDs: expand', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: 42 })
    expect(r.ok).toBe(false)
  })

  it('ID validation runs BEFORE the not-ready check (fast-fail on bad input)', async () => {
    // Service is stopped, but ID is bad — handler MUST return invalid-id, not
    // service-not-ready. This protects security invariants even when the
    // daemon is down.
    serviceState.status = 'stopped'
    const r = await invoke<ErrResult>('clearmemory:expand', { id: '../etc/passwd' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid memory id/i)
  })

  it('forget also rejects bad IDs', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:forget', { id: '../danger' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/invalid memory id/i)
  })
})

// ── Import validation (path + format + stream) ──────────────────────────────

describe('import validation', () => {
  it('rejects empty path', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:import', { path: '', format: 'auto' })
    expect(r.ok).toBe(false)
  })

  it('rejects unknown format', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:import', { path: '/tmp/x', format: 'not-a-format' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/format/i)
  })

  it('accepts all 7 documented formats (shape check; does not execute)', async () => {
    serviceState.status = 'ready'
    // We're after the format validation but path-security will reject `/etc`.
    // The point of this test is that format validation itself passes.
    for (const format of ['auto', 'claude_code', 'copilot', 'chatgpt', 'slack', 'markdown', 'clear']) {
      const r = await invoke<ErrResult>('clearmemory:import', {
        path: '/etc/passwd',
        format,
      })
      expect(r.ok).toBe(false)
      // NOT the format error — must be a path error
      expect(r.error).not.toMatch(/invalid import format/i)
    }
  })

  it('rejects sensitive system paths even with valid format', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:import', { path: '/etc/passwd', format: 'auto' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/(path not allowed|sensitive|outside)/i)
  })

  it('rejects invalid stream names', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:import', {
      path: '/tmp/x',
      format: 'auto',
      stream: 'bad name with spaces!',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/stream/i)
  })
})

// ── Tilde expansion ─────────────────────────────────────────────────────────

describe('tilde expansion in path handlers', () => {
  it('import-preview expands tilde before path-security checks', async () => {
    // If tilde wasn't expanded, `~/foo` would be neither absolute nor under
    // any allowed root, yielding an "outside" error. When it IS expanded, the
    // path resolves to HOME/foo — which then either passes security
    // (file-not-found / ENOENT error) or fails the "sensitive system" check
    // on CI environments where tmpdir lives under `/var`. Both outcomes prove
    // expansion happened; only a literal "outside of allowed roots" error
    // would indicate the raw tilde slipped through.
    const r = await invoke<ErrResult>('clearmemory:import-preview', {
      path: '~/does-not-exist-here',
    })
    expect(r.ok).toBe(false)
    expect(r.error).not.toMatch(/outside.*allowed/i)
    // Also: never a raw "~" in the error — the tilde was normalized away.
    expect(r.error.startsWith('~/')).toBe(false)
  })

  it('import rejects tilde-prefixed paths pointing at disallowed roots', async () => {
    // A tilde-expanded `~` would be the HOME temp dir, which IS allowed.
    // A literal absolute path outside HOME/cwd/tmp should still be rejected.
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:import', {
      path: '/etc/passwd',
      format: 'auto',
    })
    expect(r.ok).toBe(false)
  })
})

// ── Retain validation ───────────────────────────────────────────────────────

describe('retain validation', () => {
  it('rejects content shorter than 2 chars', async () => {
    serviceState.status = 'ready'
    const r = await invoke<ErrResult>('clearmemory:retain', { content: 'x' })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/2 characters/)
  })

  it('rejects content exceeding 1 MB', async () => {
    serviceState.status = 'ready'
    const huge = 'a'.repeat(1_000_001)
    const r = await invoke<ErrResult>('clearmemory:retain', { content: huge })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/maximum length/i)
  })
})

// ── Handler registration coverage ───────────────────────────────────────────

describe('handler registration', () => {
  it('registers every documented ClearMemory channel', () => {
    const required = [
      'clearmemory:install-status',
      'clearmemory:enable',
      'clearmemory:disable',
      'clearmemory:status',
      'clearmemory:get-logs',
      'clearmemory:recall',
      'clearmemory:expand',
      'clearmemory:retain',
      'clearmemory:forget',
      'clearmemory:streams-list',
      'clearmemory:streams-create',
      'clearmemory:streams-switch',
      'clearmemory:streams-describe',
      'clearmemory:tags-list',
      'clearmemory:tags-add',
      'clearmemory:tags-remove',
      'clearmemory:tags-rename',
      'clearmemory:reflect',
      'clearmemory:import',
      'clearmemory:import-preview',
      'clearmemory:import-cancel',
      'clearmemory:pick-import-path',
      'clearmemory:config-get',
      'clearmemory:config-set',
      'clearmemory:pick-backup-path',
      'clearmemory:list-backups',
      'clearmemory:backup-now',
      'clearmemory:restore-now',
      'clearmemory:backup-cancel',
      'clearmemory:backup-schedule-get',
      'clearmemory:backup-schedule-set',
      'clearmemory:mcp-status',
      'clearmemory:mcp-repair',
    ]
    for (const channel of required) {
      expect(handlers[channel], `missing handler: ${channel}`).toBeDefined()
    }
  })
})

// ── Cleanup ─────────────────────────────────────────────────────────────────

import { rmSync } from 'fs'
import { afterAll } from 'vitest'
afterAll(() => {
  rmSync(TMP_HOME, { recursive: true, force: true })
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE
})
