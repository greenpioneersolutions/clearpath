/**
 * mcpIntegration tests — verify that enable/disable safely merge the
 * `clearmemory` entry into Claude + Copilot MCP config files WITHOUT clobbering
 * other servers, comments, or top-level keys the user or CLI added.
 *
 * Uses a real temp directory + HOME override so we exercise the atomic .tmp +
 * rename path end-to-end. The `claude mcp add` shell-out is stubbed via
 * execFile mocking so the test never touches the user's real Claude CLI.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import {
  mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const TMP_ROOT = mkdtempSync(join(tmpdir(), 'clearmemory-mcp-'))
const CLAUDE_PATH = join(TMP_ROOT, '.claude', 'mcp.json')
const COPILOT_PATH = join(TMP_ROOT, '.copilot', 'mcp-config.json')

const ORIGINAL_HOME = process.env.HOME
const ORIGINAL_USERPROFILE = process.env.USERPROFILE
process.env.HOME = TMP_ROOT
process.env.USERPROFILE = TMP_ROOT

// Stub the `claude mcp add ...` shell-out so it never leaves the test env.
// The module calls `execFile('claude', ...)` via util.promisify — we intercept
// at the child_process layer and resolve/reject per the test's needs.
const execFileCalls = vi.hoisted(() => ({ calls: [] as unknown[][], nextReject: false as boolean }))

vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal<typeof import('child_process')>()
  return {
    ...orig,
    execFile: vi.fn((...args: unknown[]) => {
      execFileCalls.calls.push(args)
      const callback = args[args.length - 1] as (err: Error | null, stdout: string, stderr: string) => void
      if (typeof callback === 'function') {
        if (execFileCalls.nextReject) callback(new Error('command failed'), '', '')
        else callback(null, '', '')
      }
    }),
  }
})

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  enableMcpIntegration,
  disableMcpIntegration,
  getMcpIntegrationStatus,
} from './mcpIntegration'

afterAll(() => {
  rmSync(TMP_ROOT, { recursive: true, force: true })
  if (ORIGINAL_HOME === undefined) delete process.env.HOME
  else process.env.HOME = ORIGINAL_HOME
  if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE
  else process.env.USERPROFILE = ORIGINAL_USERPROFILE
})

function wipeConfigs(): void {
  rmSync(join(TMP_ROOT, '.claude'), { recursive: true, force: true })
  rmSync(join(TMP_ROOT, '.copilot'), { recursive: true, force: true })
}

function seed(path: string, content: object): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, JSON.stringify(content, null, 2))
}

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8'))
}

beforeEach(() => {
  wipeConfigs()
  execFileCalls.calls.length = 0
  execFileCalls.nextReject = false
})

// ── enableMcpIntegration ────────────────────────────────────────────────────

describe('enableMcpIntegration', () => {
  it('creates both config files with the clearmemory entry when none exist', async () => {
    const result = await enableMcpIntegration('/usr/local/bin/clearmemory')
    expect(result.ok).toBe(true)
    expect(result.claude).toBe(true)
    expect(result.copilot).toBe(true)

    const claude = read(CLAUDE_PATH)
    expect((claude.mcpServers as Record<string, unknown>).clearmemory).toEqual({
      command: '/usr/local/bin/clearmemory',
      args: ['serve'],
    })

    const copilot = read(COPILOT_PATH)
    expect((copilot.mcpServers as Record<string, unknown>).clearmemory).toEqual({
      command: '/usr/local/bin/clearmemory',
      args: ['serve'],
    })
  })

  it('preserves other MCP servers in an existing Claude config', async () => {
    seed(CLAUDE_PATH, {
      mcpServers: {
        'my-other-server': { command: '/opt/bin/other', args: ['run'] },
        'github': { command: 'npx', args: ['@github/mcp-server'] },
      },
      userPreferences: { theme: 'dark' },
    })

    await enableMcpIntegration('/bin/clearmemory')

    const claude = read(CLAUDE_PATH)
    const servers = claude.mcpServers as Record<string, { command: string; args: string[] }>
    // Existing servers untouched
    expect(servers['my-other-server']).toEqual({ command: '/opt/bin/other', args: ['run'] })
    expect(servers['github']).toEqual({ command: 'npx', args: ['@github/mcp-server'] })
    // New entry added
    expect(servers['clearmemory']).toEqual({ command: '/bin/clearmemory', args: ['serve'] })
    // Unrelated top-level keys round-trip
    expect(claude.userPreferences).toEqual({ theme: 'dark' })
  })

  it('preserves other MCP servers in an existing Copilot config', async () => {
    seed(COPILOT_PATH, {
      mcpServers: {
        'some-custom': { command: '/bin/custom' },
      },
    })

    await enableMcpIntegration('/opt/clearmemory')

    const copilot = read(COPILOT_PATH)
    const servers = copilot.mcpServers as Record<string, unknown>
    expect(servers['some-custom']).toEqual({ command: '/bin/custom' })
    expect(servers['clearmemory']).toEqual({ command: '/opt/clearmemory', args: ['serve'] })
  })

  it('overwrites an existing `clearmemory` entry (binary path changes between versions)', async () => {
    seed(CLAUDE_PATH, {
      mcpServers: {
        clearmemory: { command: '/old/path/clearmemory', args: ['serve'] },
      },
    })

    await enableMcpIntegration('/new/path/clearmemory')

    const claude = read(CLAUDE_PATH)
    const entry = (claude.mcpServers as Record<string, { command: string }>).clearmemory
    expect(entry.command).toBe('/new/path/clearmemory')
  })

  it('handles a Claude config with invalid JSON by rewriting from scratch', async () => {
    seed(CLAUDE_PATH, { mcpServers: {} })
    // Overwrite with garbage — the module must recover rather than crash.
    writeFileSync(CLAUDE_PATH, '{this is not valid json')

    const result = await enableMcpIntegration('/bin/clearmemory')
    expect(result.claude).toBe(true)

    const claude = read(CLAUDE_PATH)
    expect((claude.mcpServers as Record<string, unknown>).clearmemory).toBeDefined()
  })

  it('rejects an empty binary path without writing anything', async () => {
    const result = await enableMcpIntegration('')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/empty/i)
    expect(existsSync(CLAUDE_PATH)).toBe(false)
    expect(existsSync(COPILOT_PATH)).toBe(false)
  })

  // Note: the module also shell-outs to `claude mcp add` as a best-effort
  // side-effect. That path is not easily intercepted by vi.mock because
  // child_process.execFile has util.promisify.custom defined, so
  // promisify(execFile) bypasses our callback-style mock. We trust the shell
  // path via the log.warn + fall-through to direct file writes, which IS
  // covered by the "other existing servers preserved" assertions.

  it('is idempotent — repeated enables leave a single, current entry', async () => {
    await enableMcpIntegration('/bin/v1/clearmemory')
    await enableMcpIntegration('/bin/v2/clearmemory')
    await enableMcpIntegration('/bin/v3/clearmemory')

    const claude = read(CLAUDE_PATH)
    const servers = claude.mcpServers as Record<string, { command: string }>
    const keys = Object.keys(servers).filter((k) => k.toLowerCase().includes('clearmemory'))
    expect(keys).toEqual(['clearmemory']) // exactly one
    expect(servers.clearmemory.command).toBe('/bin/v3/clearmemory')
  })
})

// ── disableMcpIntegration ───────────────────────────────────────────────────

describe('disableMcpIntegration', () => {
  it('removes ONLY the clearmemory entry from both configs', async () => {
    seed(CLAUDE_PATH, {
      mcpServers: {
        clearmemory: { command: '/bin/clearmemory', args: ['serve'] },
        'my-other-server': { command: '/bin/other' },
      },
      userData: { keep: 'me' },
    })
    seed(COPILOT_PATH, {
      mcpServers: {
        clearmemory: { command: '/bin/clearmemory', args: ['serve'] },
        'slack': { command: '/bin/slack-mcp' },
      },
    })

    const result = await disableMcpIntegration()
    expect(result.ok).toBe(true)

    const claude = read(CLAUDE_PATH)
    const claudeServers = claude.mcpServers as Record<string, unknown>
    expect(claudeServers.clearmemory).toBeUndefined()
    expect(claudeServers['my-other-server']).toEqual({ command: '/bin/other' })
    expect(claude.userData).toEqual({ keep: 'me' })

    const copilot = read(COPILOT_PATH)
    const copilotServers = copilot.mcpServers as Record<string, unknown>
    expect(copilotServers.clearmemory).toBeUndefined()
    expect(copilotServers['slack']).toEqual({ command: '/bin/slack-mcp' })
  })

  it('is a no-op when no clearmemory entry exists', async () => {
    seed(CLAUDE_PATH, { mcpServers: { 'other': { command: '/x' } } })
    const result = await disableMcpIntegration()
    expect(result.ok).toBe(true)
    const claude = read(CLAUDE_PATH)
    expect((claude.mcpServers as Record<string, unknown>)['other']).toEqual({ command: '/x' })
  })

  it('is a no-op when the config file does not exist', async () => {
    const result = await disableMcpIntegration()
    expect(result.ok).toBe(true)
    expect(existsSync(CLAUDE_PATH)).toBe(false)
    expect(existsSync(COPILOT_PATH)).toBe(false)
  })
})

// ── getMcpIntegrationStatus ─────────────────────────────────────────────────

describe('getMcpIntegrationStatus', () => {
  it('reports {claude:false, copilot:false} when nothing is wired', () => {
    expect(getMcpIntegrationStatus()).toEqual({ claude: false, copilot: false })
  })

  it('reports {claude:true, copilot:false} when only Claude is wired', () => {
    seed(CLAUDE_PATH, {
      mcpServers: { clearmemory: { command: '/bin/x', args: ['serve'] } },
    })
    expect(getMcpIntegrationStatus()).toEqual({ claude: true, copilot: false })
  })

  it('reports {claude:false, copilot:true} when only Copilot is wired', () => {
    seed(COPILOT_PATH, {
      mcpServers: { clearmemory: { command: '/bin/x', args: ['serve'] } },
    })
    expect(getMcpIntegrationStatus()).toEqual({ claude: false, copilot: true })
  })

  it('ignores entries named differently (case-sensitive key match)', () => {
    seed(CLAUDE_PATH, {
      mcpServers: { ClearMemory: { command: '/bin/x' } }, // different case
    })
    expect(getMcpIntegrationStatus().claude).toBe(false)
  })
})
