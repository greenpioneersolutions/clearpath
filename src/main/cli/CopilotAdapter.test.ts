import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CopilotAdapter } from './CopilotAdapter'
import type { SessionOptions } from './types'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ── vi.hoisted mocks ──────────────────────────────────────────────────────────

const {
  spawnMock,
  existsSyncMock,
  readFileSyncMock,
  homedirMock,
  resolveInShellMock,
  getScopedSpawnEnvMock,
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  existsSyncMock: vi.fn().mockReturnValue(false),
  readFileSyncMock: vi.fn().mockReturnValue(''),
  homedirMock: vi.fn().mockReturnValue('/mock/home'),
  resolveInShellMock: vi.fn(),
  getScopedSpawnEnvMock: vi.fn().mockReturnValue({}),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, spawn: spawnMock }
})

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: existsSyncMock, readFileSync: readFileSyncMock }
})

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>()
  return { ...actual, homedir: homedirMock }
})

vi.mock('../utils/shellEnv', () => ({
  resolveInShell: resolveInShellMock,
  getScopedSpawnEnv: getScopedSpawnEnvMock,
  initShellEnv: vi.fn().mockResolvedValue(undefined),
  getSpawnEnv: vi.fn().mockReturnValue({}),
  setCustomEnvVars: vi.fn(),
}))

describe('CopilotAdapter', () => {
  const adapter = new CopilotAdapter()

  describe('buildArgs', () => {
    it('returns empty args for a minimal interactive session', () => {
      const options: SessionOptions = { mode: 'interactive' }
      const args = adapter.buildArgs(options)
      expect(args).toEqual([])
    })

    it('builds --prompt flag for prompt mode', () => {
      const options: SessionOptions = {
        mode: 'prompt',
        prompt: 'What is this project?',
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--prompt')
      expect(args).toContain('What is this project?')
    })

    it('includes --model when specified', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        model: 'gpt-5',
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--model')
      expect(args).toContain('gpt-5')
    })

    it('includes --yolo flag', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        yolo: true,
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--yolo')
      // yolo should not also add --allow-all
      expect(args).not.toContain('--allow-all')
    })

    it('builds allowed and denied tool flags', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        allowedTools: ['shell(git:*)'],
        deniedTools: ['shell(rm:*)'],
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--allow-tool')
      expect(args).toContain('shell(git:*)')
      expect(args).toContain('--deny-tool')
      expect(args).toContain('shell(rm:*)')
    })

    it('includes --experimental when set to true', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        experimental: true,
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--experimental')
    })

    it('includes --no-experimental when set to false', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        experimental: false,
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--no-experimental')
    })

    it('handles catch-all flags', () => {
      const options: SessionOptions = {
        mode: 'interactive',
        flags: {
          'screen-reader': true,
          'config-dir': '/custom/path',
          'streamer-mode': false,
        },
      }
      const args = adapter.buildArgs(options)
      expect(args).toContain('--screen-reader')
      expect(args).toContain('--config-dir')
      expect(args).toContain('/custom/path')
      // false flags should be omitted
      expect(args).not.toContain('--streamer-mode')
    })
  })

  describe('parseOutput', () => {
    it('parses plain text output', () => {
      const result = adapter.parseOutput('Hello, how can I help?')
      expect(result.type).toBe('text')
      expect(result.content).toBe('Hello, how can I help?')
    })

    it('returns empty text for blank lines', () => {
      const result = adapter.parseOutput('')
      expect(result.type).toBe('text')
      expect(result.content).toBe('')
    })

    it('detects permission request prompts', () => {
      const result = adapter.parseOutput(
        'Allow copilot to run: `shell(git status)` [y/n/a]?',
      )
      expect(result.type).toBe('permission-request')
      expect(result.content).toContain('Allow copilot to run')
    })

    it('detects error lines', () => {
      const result = adapter.parseOutput('Error: Connection refused')
      expect(result.type).toBe('error')
      expect(result.content).toContain('Connection refused')
    })

    it('strips ANSI escape codes from output', () => {
      const result = adapter.parseOutput(
        '\x1b[31mError: something failed\x1b[0m',
      )
      expect(result.type).toBe('error')
      expect(result.content).not.toContain('\x1b')
      expect(result.content).toContain('something failed')
    })

    it('parses JSON tool_use events', () => {
      const json = JSON.stringify({
        type: 'tool_use',
        name: 'shell',
        input: { command: 'ls' },
      })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('tool-use')
      expect(result.content).toBe('shell')
      expect(result.metadata).toBeDefined()
    })

    it('parses JSON error events', () => {
      const json = JSON.stringify({
        type: 'error',
        message: 'Rate limit exceeded',
      })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('error')
      expect(result.content).toBe('Rate limit exceeded')
    })
  })

  // ─── buildArgs additional branches ───────────────────────────────────────

  describe('buildArgs — additional branches', () => {
    it('adds --prompt without text when prompt mode but no prompt string', () => {
      const args = adapter.buildArgs({ mode: 'prompt' } as SessionOptions)
      expect(args).toEqual(['--prompt'])
    })

    it('adds --acp flag', () => {
      const args = adapter.buildArgs({ mode: 'interactive', acp: true } as SessionOptions)
      expect(args).toContain('--acp')
    })

    it('adds --resume with session id', () => {
      const args = adapter.buildArgs({ mode: 'interactive', resume: 'session-123' } as SessionOptions)
      expect(args).toContain('--resume')
      expect(args).toContain('session-123')
    })

    it('adds --continue when no resume', () => {
      const args = adapter.buildArgs({ mode: 'interactive', continue: true } as SessionOptions)
      expect(args).toContain('--continue')
    })

    it('resume takes priority over continue', () => {
      const args = adapter.buildArgs({ mode: 'interactive', resume: 'sess-1', continue: true } as SessionOptions)
      expect(args).toContain('--resume')
      expect(args).not.toContain('--continue')
    })

    it('adds --config-dir', () => {
      const args = adapter.buildArgs({ mode: 'interactive', configDir: '/path' } as SessionOptions)
      expect(args).toContain('--config-dir')
      expect(args).toContain('/path')
    })

    it('adds --agent', () => {
      const args = adapter.buildArgs({ mode: 'interactive', agent: 'explore' } as SessionOptions)
      expect(args).toContain('--agent')
      expect(args).toContain('explore')
    })

    it('adds --allow-all without yolo', () => {
      const args = adapter.buildArgs({ mode: 'interactive', allowAll: true } as SessionOptions)
      expect(args).toContain('--allow-all')
      expect(args).not.toContain('--yolo')
    })

    it('adds --allow-all-tools without yolo', () => {
      const args = adapter.buildArgs({ mode: 'interactive', allowAllTools: true } as SessionOptions)
      expect(args).toContain('--allow-all-tools')
    })

    it('yolo suppresses --allow-all and --allow-all-tools', () => {
      const args = adapter.buildArgs({ mode: 'interactive', yolo: true, allowAll: true, allowAllTools: true } as SessionOptions)
      expect(args).toContain('--yolo')
      expect(args).not.toContain('--allow-all')
      expect(args).not.toContain('--allow-all-tools')
    })

    it('adds --available-tools comma-separated', () => {
      const args = adapter.buildArgs({ mode: 'interactive', availableTools: ['tool1', 'tool2'] } as SessionOptions)
      expect(args).toContain('--available-tools')
      expect(args).toContain('tool1,tool2')
    })

    it('adds --excluded-tools', () => {
      const args = adapter.buildArgs({ mode: 'interactive', excludedTools: ['shell'] } as SessionOptions)
      expect(args).toContain('--excluded-tools')
      expect(args).toContain('shell')
    })

    it('adds --output-format', () => {
      const args = adapter.buildArgs({ mode: 'interactive', outputFormat: 'json' } as SessionOptions)
      expect(args).toContain('--output-format')
      expect(args).toContain('json')
    })

    it('adds --alt-screen off when false', () => {
      const args = adapter.buildArgs({ mode: 'interactive', altScreen: false } as SessionOptions)
      expect(args).toContain('--alt-screen')
      expect(args).toContain('off')
    })

    it('adds --alt-screen off when string "off"', () => {
      const args = adapter.buildArgs({ mode: 'interactive', altScreen: 'off' } as SessionOptions)
      expect(args).toContain('--alt-screen')
      expect(args).toContain('off')
    })

    it('adds --alt-screen on when string "on"', () => {
      const args = adapter.buildArgs({ mode: 'interactive', altScreen: 'on' } as SessionOptions)
      expect(args).toContain('--alt-screen')
      expect(args).toContain('on')
    })

    it('does not add --alt-screen when true', () => {
      const args = adapter.buildArgs({ mode: 'interactive', altScreen: true } as SessionOptions)
      expect(args).not.toContain('--alt-screen')
    })

    it('adds --banner', () => {
      const args = adapter.buildArgs({ mode: 'interactive', banner: true } as SessionOptions)
      expect(args).toContain('--banner')
    })

    it('adds --screen-reader', () => {
      const args = adapter.buildArgs({ mode: 'interactive', screenReader: true } as SessionOptions)
      expect(args).toContain('--screen-reader')
    })

    it('adds --streamer-mode', () => {
      const args = adapter.buildArgs({ mode: 'interactive', streamerMode: true } as SessionOptions)
      expect(args).toContain('--streamer-mode')
    })

    it('adds --additional-mcp-config for mcpConfig', () => {
      const args = adapter.buildArgs({ mode: 'interactive', mcpConfig: '/path/to/mcp.json' } as SessionOptions)
      expect(args).toContain('--additional-mcp-config')
      expect(args).toContain('/path/to/mcp.json')
    })

    it('adds --disable-builtin-mcps', () => {
      const args = adapter.buildArgs({ mode: 'interactive', disableBuiltinMcps: true } as SessionOptions)
      expect(args).toContain('--disable-builtin-mcps')
    })

    it('adds --disable-mcp-server', () => {
      const args = adapter.buildArgs({ mode: 'interactive', disableMcpServer: 'github' } as SessionOptions)
      expect(args).toContain('--disable-mcp-server')
      expect(args).toContain('github')
    })

    it('adds --enable-all-github-mcp-tools', () => {
      const args = adapter.buildArgs({ mode: 'interactive', enableAllGithubMcpTools: true } as SessionOptions)
      expect(args).toContain('--enable-all-github-mcp-tools')
    })

    it('adds --plugin-dir for each entry in pluginDirs', () => {
      const args = adapter.buildArgs({ mode: 'interactive', pluginDirs: ['/plugins/a', '/plugins/b'] } as SessionOptions)
      const flags = args.filter((a) => a === '--plugin-dir')
      expect(flags.length).toBe(2)
      expect(args).toContain('/plugins/a')
      expect(args).toContain('/plugins/b')
    })

    it('omits --plugin-dir when pluginDirs is empty or undefined', () => {
      expect(adapter.buildArgs({ mode: 'interactive' } as SessionOptions)).not.toContain('--plugin-dir')
      const emptyDirs: string[] = []
      expect(adapter.buildArgs({ mode: 'interactive', pluginDirs: emptyDirs } as SessionOptions)).not.toContain('--plugin-dir')
    })

    it('adds --stream false only when stream is false', () => {
      const args = adapter.buildArgs({ mode: 'interactive', stream: false } as SessionOptions)
      expect(args).toContain('--stream')
      expect(args).toContain('false')
    })

    it('does not add --stream when stream is true', () => {
      const args = adapter.buildArgs({ mode: 'interactive', stream: true } as SessionOptions)
      expect(args).not.toContain('--stream')
    })

    it('adds --save-gist', () => {
      const args = adapter.buildArgs({ mode: 'interactive', saveGist: true } as SessionOptions)
      expect(args).toContain('--save-gist')
    })

    it('adds --bash-env', () => {
      const args = adapter.buildArgs({ mode: 'interactive', bashEnv: true } as SessionOptions)
      expect(args).toContain('--bash-env')
    })
  })

  // ─── parseJsonEvent via parseOutput ──────────────────────────────────────

  describe('parseJsonEvent via parseOutput', () => {
    it('parses tool_call type', () => {
      const json = JSON.stringify({ type: 'tool_call', name: 'shell' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('tool-use')
      expect(result.content).toBe('shell')
    })

    it('parses permission_request type', () => {
      const json = JSON.stringify({ type: 'permission_request', message: 'Allow?' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('permission-request')
      expect(result.content).toBe('Allow?')
    })

    it('parses tool_permission type as permission-request', () => {
      const json = JSON.stringify({ type: 'tool_permission', description: 'Run shell' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('permission-request')
      expect(result.content).toBe('Run shell')
    })

    it('parses thinking type', () => {
      const json = JSON.stringify({ type: 'thinking', content: 'Let me consider...' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('thinking')
      expect(result.content).toBe('Let me consider...')
    })

    it('parses reasoning type as thinking', () => {
      const json = JSON.stringify({ type: 'reasoning', text: 'Analyzing...' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('thinking')
      expect(result.content).toBe('Analyzing...')
    })

    it('falls back to text for unknown type', () => {
      const json = JSON.stringify({ type: 'unknown_type', content: 'some content' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('text')
      expect(result.content).toBe('some content')
    })

    it('uses event key when type key is absent', () => {
      const json = JSON.stringify({ event: 'tool_use', name: 'read_file' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('tool-use')
      expect(result.content).toBe('read_file')
    })

    it('falls back to raw when no content fields present', () => {
      const raw = JSON.stringify({ type: 'thinking' })
      const result = adapter.parseOutput(raw)
      expect(result.type).toBe('thinking')
      // Should fall back to raw JSON string since no content/text field
      expect(result.content).toBe(raw)
    })

    it('falls back to text for JSON with no type or event', () => {
      const json = JSON.stringify({ message: 'hello' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('text')
      expect(result.content).toBe('hello')
    })

    it('uses tool field for tool_use when name is missing', () => {
      const json = JSON.stringify({ type: 'tool_use', tool: 'write_file' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('tool-use')
      expect(result.content).toBe('write_file')
    })

    it('uses error field for error when message is missing', () => {
      const json = JSON.stringify({ type: 'error', error: 'Something broke' })
      const result = adapter.parseOutput(json)
      expect(result.type).toBe('error')
      expect(result.content).toBe('Something broke')
    })

    it('falls back to raw for error: permission_request with no message or description', () => {
      const raw = JSON.stringify({ type: 'permission_request' })
      const result = adapter.parseOutput(raw)
      expect(result.type).toBe('permission-request')
      expect(result.content).toBe(raw)
    })
  })

  // ─── parseOutput edge cases ──────────────────────────────────────────────

  describe('parseOutput — edge cases', () => {
    it('detects error: prefix (lowercase)', () => {
      const result = adapter.parseOutput('error: something went wrong')
      expect(result.type).toBe('error')
    })

    it('treats invalid JSON starting with { as plain text', () => {
      const result = adapter.parseOutput('{ this is not json }')
      expect(result.type).toBe('text')
      expect(result.content).toBe('{ this is not json }')
    })
  })

  // ─── isInstalled ────────────────────────────────────────────────────────

  describe('isInstalled', () => {
    let CopilotAdapterClass: typeof CopilotAdapter

    beforeEach(async () => {
      resolveInShellMock.mockReset()
      vi.resetModules()
      const mod = await import('./CopilotAdapter')
      CopilotAdapterClass = mod.CopilotAdapter
    })

    it('returns true and sets binaryPath when resolved', async () => {
      resolveInShellMock.mockResolvedValue('/usr/local/bin/copilot')
      const a = new CopilotAdapterClass()
      const result = await a.isInstalled()
      expect(result).toBe(true)
      expect(a.binaryPath).toBe('/usr/local/bin/copilot')
    })

    it('returns false when resolveInShell returns null', async () => {
      resolveInShellMock.mockResolvedValue(null)
      const a = new CopilotAdapterClass()
      const result = await a.isInstalled()
      expect(result).toBe(false)
    })
  })

  // ─── isAuthenticated ────────────────────────────────────────────────────

  describe('isAuthenticated', () => {
    const origGH = process.env['GH_TOKEN']
    const origGITHUB = process.env['GITHUB_TOKEN']
    let CopilotAdapterClass: typeof CopilotAdapter
    // Use a real temp dir for config file tests since require('fs') bypasses vi.mock
    const tempHome = join(tmpdir(), `copilot-test-${process.pid}`)
    const configDir = join(tempHome, '.copilot')
    const configPath = join(configDir, 'config.json')

    beforeEach(async () => {
      delete process.env['GH_TOKEN']
      delete process.env['GITHUB_TOKEN']
      existsSyncMock.mockReturnValue(false)
      readFileSyncMock.mockReturnValue('')
      homedirMock.mockReturnValue(tempHome)
      // Clean up temp dir
      try { rmSync(tempHome, { recursive: true, force: true }) } catch { /* ok */ }
      vi.resetModules()
      const mod = await import('./CopilotAdapter')
      CopilotAdapterClass = mod.CopilotAdapter
    })

    afterEach(() => {
      if (origGH !== undefined) process.env['GH_TOKEN'] = origGH
      else delete process.env['GH_TOKEN']
      if (origGITHUB !== undefined) process.env['GITHUB_TOKEN'] = origGITHUB
      else delete process.env['GITHUB_TOKEN']
      try { rmSync(tempHome, { recursive: true, force: true }) } catch { /* ok */ }
    })

    it('returns true when GH_TOKEN is set', async () => {
      process.env['GH_TOKEN'] = 'test-token'
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(true)
    })

    it('returns true when GITHUB_TOKEN is set', async () => {
      process.env['GITHUB_TOKEN'] = 'test-token'
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(true)
    })

    it('returns true when config file has loggedInUsers (camelCase)', async () => {
      mkdirSync(configDir, { recursive: true })
      writeFileSync(configPath, JSON.stringify({ loggedInUsers: [{ host: 'https://github.com', login: 'user1' }] }))
      existsSyncMock.mockReturnValue(true)
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(true)
    })

    it('returns true when config file has logged_in_users (legacy snake_case)', async () => {
      mkdirSync(configDir, { recursive: true })
      writeFileSync(configPath, JSON.stringify({ logged_in_users: ['user1'] }))
      existsSyncMock.mockReturnValue(true)
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(true)
    })

    it('returns false when config file has empty logged_in_users', async () => {
      mkdirSync(configDir, { recursive: true })
      writeFileSync(configPath, JSON.stringify({ logged_in_users: [] }))
      existsSyncMock.mockReturnValue(true)
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(false)
    })

    it('returns false when config file has malformed JSON', async () => {
      mkdirSync(configDir, { recursive: true })
      writeFileSync(configPath, 'not json{{{')
      existsSyncMock.mockReturnValue(true)
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(false)
    })

    it('returns false when config file does not exist', async () => {
      existsSyncMock.mockReturnValue(false)
      const a = new CopilotAdapterClass()
      expect(await a.isAuthenticated()).toBe(false)
    })
  })

  // ─── startSession ──────────────────────────────────────────────────────

  describe('startSession', () => {
    let CopilotAdapterClass: typeof CopilotAdapter

    beforeEach(async () => {
      spawnMock.mockReset()
      getScopedSpawnEnvMock.mockReturnValue({})
      vi.resetModules()
      const mod = await import('./CopilotAdapter')
      CopilotAdapterClass = mod.CopilotAdapter
    })

    it('spawns with correct args and cwd', () => {
      const mockStdin = { end: vi.fn(), write: vi.fn() }
      const mockProc = { stdin: mockStdin, stdout: null, stderr: null }
      spawnMock.mockReturnValue(mockProc)

      const a = new CopilotAdapterClass()
      const options: SessionOptions = { mode: 'interactive', model: 'gpt-5', workingDirectory: '/my/project' } as SessionOptions
      const proc = a.startSession(options)

      expect(spawnMock).toHaveBeenCalledWith(
        'copilot',
        expect.arrayContaining(['--model', 'gpt-5']),
        expect.objectContaining({ cwd: '/my/project', stdio: ['pipe', 'pipe', 'pipe'] }),
      )
      expect(proc).toBe(mockProc)
    })

    it('calls getScopedSpawnEnv with copilot', () => {
      const mockProc = { stdin: { end: vi.fn(), write: vi.fn() }, stdout: null, stderr: null }
      spawnMock.mockReturnValue(mockProc)

      const a = new CopilotAdapterClass()
      a.startSession({ mode: 'interactive' } as SessionOptions)

      expect(getScopedSpawnEnvMock).toHaveBeenCalledWith('copilot')
    })

    it('calls stdin.end() in prompt mode', () => {
      const endFn = vi.fn()
      const mockProc = { stdin: { end: endFn, write: vi.fn() }, stdout: null, stderr: null }
      spawnMock.mockReturnValue(mockProc)

      const a = new CopilotAdapterClass()
      a.startSession({ mode: 'prompt', prompt: 'hello' } as SessionOptions)

      expect(endFn).toHaveBeenCalled()
    })

    it('does not call stdin.end() in interactive mode', () => {
      const endFn = vi.fn()
      const mockProc = { stdin: { end: endFn, write: vi.fn() }, stdout: null, stderr: null }
      spawnMock.mockReturnValue(mockProc)

      const a = new CopilotAdapterClass()
      a.startSession({ mode: 'interactive' } as SessionOptions)

      expect(endFn).not.toHaveBeenCalled()
    })
  })

  // ─── sendInput & sendSlashCommand ────────────────────────────────────────

  describe('sendInput', () => {
    it('writes input + newline to stdin', () => {
      const writeFn = vi.fn()
      const mockProc = { stdin: { write: writeFn } } as unknown as import('child_process').ChildProcess
      const a = new CopilotAdapter()
      a.sendInput(mockProc, 'hello world')
      expect(writeFn).toHaveBeenCalledWith('hello world\n')
    })
  })

  describe('sendSlashCommand', () => {
    it('writes command + newline to stdin', () => {
      const writeFn = vi.fn()
      const mockProc = { stdin: { write: writeFn } } as unknown as import('child_process').ChildProcess
      const a = new CopilotAdapter()
      a.sendSlashCommand(mockProc, '/clear')
      expect(writeFn).toHaveBeenCalledWith('/clear\n')
    })
  })

  // ─── Static properties ──────────────────────────────────────────────────

  describe('static properties', () => {
    it('has cliName set to copilot', () => {
      const a = new CopilotAdapter()
      expect(a.cliName).toBe('copilot-cli')
    })

    it('has default binaryPath set to copilot', () => {
      const a = new CopilotAdapter()
      expect(a.binaryPath).toBe('copilot')
    })
  })
})
