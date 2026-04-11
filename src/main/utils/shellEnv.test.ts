import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mock setup ───────────────────────────────────────────────────────
// shellEnv.ts does `const execFileAsync = promisify(execFile)` at module load
// time.  Node's util.promisify checks for the util.promisify.custom symbol on
// the function and, when present, returns that function directly instead of
// wrapping with a callback adapter.  So we attach execFileAsyncMock as that
// symbol so that the module's execFileAsync === execFileAsyncMock.
const { execFileMock, execFileAsyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileAsyncMock: vi.fn(),
}))

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  // Symbol.for('nodejs.util.promisify.custom') is the same symbol as
  // util.promisify.custom — this makes promisify(execFileMock) return
  // execFileAsyncMock directly, so we control the Promise-based path.
  ;(execFileMock as any)[Symbol.for('nodejs.util.promisify.custom')] = execFileAsyncMock
  return { ...actual, execFile: execFileMock }
})

// ─── Helper ───────────────────────────────────────────────────────────────────
// Returns a freshly-imported shellEnv module (module-level state reset).
// vi.resetModules() clears the loaded-module cache without touching the mock
// registry, so the child_process mock stays active on the fresh import.
type ShellEnvModule = typeof import('./shellEnv')

async function freshShellEnv(): Promise<ShellEnvModule> {
  vi.resetModules()
  execFileAsyncMock.mockReset()
  execFileMock.mockReset()
  // Re-attach the custom symbol after mockReset (mockReset clears the fn but
  // does not wipe user-assigned properties, so this is defensive).
  ;(execFileMock as any)[Symbol.for('nodejs.util.promisify.custom')] = execFileAsyncMock
  return import('./shellEnv')
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('shellEnv', () => {
  describe('initShellEnv', () => {
    it('calls execFileAsync with the login shell and correct args', async () => {
      const { initShellEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/local/bin:/usr/bin:/bin', stderr: '' })

      const saved = process.env.SHELL
      process.env.SHELL = '/bin/zsh'
      try {
        await initShellEnv()
      } finally {
        if (saved !== undefined) process.env.SHELL = saved
        else delete process.env.SHELL
      }

      expect(execFileAsyncMock).toHaveBeenCalledWith(
        '/bin/zsh',
        ['-l', '-c', 'echo $PATH'],
        expect.objectContaining({ timeout: 8000 }),
      )
    })

    it('falls back to /bin/zsh when SHELL env var is not set', async () => {
      const { initShellEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      const saved = process.env.SHELL
      delete process.env.SHELL
      try {
        await initShellEnv()
      } finally {
        if (saved !== undefined) process.env.SHELL = saved
      }

      expect(execFileAsyncMock).toHaveBeenCalledWith(
        '/bin/zsh',
        expect.any(Array),
        expect.any(Object),
      )
    })

    it('populates the env cache with the PATH returned by the shell', async () => {
      const { initShellEnv, getSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({
        stdout: '/usr/local/bin:/usr/bin:/bin\n', // trailing newline trimmed
        stderr: '',
      })

      await initShellEnv()
      const env = getSpawnEnv()

      expect(env.PATH).toBe('/usr/local/bin:/usr/bin:/bin')
    })

    it('does not throw when execFile errors — falls back to process.env', async () => {
      const { initShellEnv, getSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockRejectedValue(new Error('no shell found'))

      await expect(initShellEnv()).resolves.toBeUndefined()

      // Still returns a usable env (process.env fallback)
      const env = getSpawnEnv()
      expect(env).toBeDefined()
      expect(typeof env).toBe('object')
    })

    it('merges shell PATH into process.env (not a wholesale replacement)', async () => {
      const { initShellEnv, getSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/custom/bin', stderr: '' })

      await initShellEnv()
      const env = getSpawnEnv()

      // PATH is from the shell
      expect(env.PATH).toBe('/custom/bin')
      // Other process.env entries should still be present
      expect(env.HOME ?? env.USERPROFILE ?? env.USER).toBeDefined()
    })

    it('is idempotent — a second call does not re-invoke execFile', async () => {
      const { initShellEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await initShellEnv()
      await initShellEnv() // second call must be a no-op

      expect(execFileAsyncMock).toHaveBeenCalledTimes(1)
    })

    it('returns undefined (void) on success', async () => {
      const { initShellEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await expect(initShellEnv()).resolves.toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('setCustomEnvVars', () => {
    let mod: ShellEnvModule

    beforeEach(async () => {
      mod = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })
      await mod.initShellEnv()
    })

    it('adds custom vars that appear in getSpawnEnv()', () => {
      mod.setCustomEnvVars({ MY_TOKEN: 'abc123', CUSTOM_KEY: 'value' })
      const env = mod.getSpawnEnv()

      expect(env.MY_TOKEN).toBe('abc123')
      expect(env.CUSTOM_KEY).toBe('value')
    })

    it('overwrites previously set custom vars on re-call', () => {
      mod.setCustomEnvVars({ MY_TOKEN: 'first' })
      mod.setCustomEnvVars({ MY_TOKEN: 'second' })

      expect(mod.getSpawnEnv().MY_TOKEN).toBe('second')
    })

    it('removes a var that was present in the prior call when called again without it', () => {
      mod.setCustomEnvVars({ A: '1', B: '2' })
      mod.setCustomEnvVars({ A: '1' }) // B is no longer present

      expect(mod.getSpawnEnv().A).toBe('1')
      expect(mod.getSpawnEnv().B).toBeUndefined()
    })

    it('clears all custom vars when called with an empty object', () => {
      mod.setCustomEnvVars({ MY_TOKEN: 'abc' })
      mod.setCustomEnvVars({})

      expect(mod.getSpawnEnv().MY_TOKEN).toBeUndefined()
    })

    it('skips empty-string values — they are not merged into the env', () => {
      mod.setCustomEnvVars({ EMPTY_VAR: '' })

      // getSpawnEnv skips blank values explicitly
      expect(mod.getSpawnEnv().EMPTY_VAR).toBeUndefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('getSpawnEnv', () => {
    it('returns process.env as a fallback when initShellEnv has not run', async () => {
      const { getSpawnEnv } = await freshShellEnv() // _env is null

      const env = getSpawnEnv()

      expect(env).toBeDefined()
      expect(env.PATH).toBe(process.env.PATH)
    })

    it('returns the shell-enhanced env after initShellEnv', async () => {
      const { initShellEnv, getSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/shell/path', stderr: '' })

      await initShellEnv()

      expect(getSpawnEnv().PATH).toBe('/shell/path')
    })

    it('custom vars take precedence over the base env', async () => {
      const { initShellEnv, setCustomEnvVars, getSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await initShellEnv()
      setCustomEnvVars({ OVERRIDE_KEY: 'custom' })

      expect(getSpawnEnv().OVERRIDE_KEY).toBe('custom')
    })

    it('returns a plain object (not a reference to the internal cache)', async () => {
      const { initShellEnv, getSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await initShellEnv()
      const env1 = getSpawnEnv()
      const env2 = getSpawnEnv()

      // Different objects on each call
      expect(env1).not.toBe(env2)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('getScopedSpawnEnv', () => {
    it('scopes GH_TOKEN to copilot only — scrubs it from claude scope', async () => {
      const { initShellEnv, setCustomEnvVars, getScopedSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await initShellEnv()
      setCustomEnvVars({ GH_TOKEN: 'gh-token-value', ANTHROPIC_API_KEY: 'sk-xxx' })

      const copilotEnv = getScopedSpawnEnv('copilot')
      const claudeEnv = getScopedSpawnEnv('claude')
      const localEnv = getScopedSpawnEnv('local')

      expect(copilotEnv.GH_TOKEN).toBe('gh-token-value')
      expect(copilotEnv.ANTHROPIC_API_KEY).toBeUndefined()

      expect(claudeEnv.ANTHROPIC_API_KEY).toBe('sk-xxx')
      expect(claudeEnv.GH_TOKEN).toBeUndefined()

      expect(localEnv.GH_TOKEN).toBeUndefined()
      expect(localEnv.ANTHROPIC_API_KEY).toBeUndefined()
    })

    it('passes CLAUDE_CODE_MODEL and ENABLE_TOOL_SEARCH to claude scope only', async () => {
      const { initShellEnv, setCustomEnvVars, getScopedSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await initShellEnv()
      setCustomEnvVars({ CLAUDE_CODE_MODEL: 'claude-opus', ENABLE_TOOL_SEARCH: 'auto:5' })

      const claudeEnv = getScopedSpawnEnv('claude')
      const copilotEnv = getScopedSpawnEnv('copilot')

      expect(claudeEnv.CLAUDE_CODE_MODEL).toBe('claude-opus')
      expect(claudeEnv.ENABLE_TOOL_SEARCH).toBe('auto:5')
      expect(copilotEnv.CLAUDE_CODE_MODEL).toBeUndefined()
    })

    it('passes COPILOT_CUSTOM_INSTRUCTIONS_DIRS and GITHUB_TOKEN to copilot only', async () => {
      const { initShellEnv, setCustomEnvVars, getScopedSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      await initShellEnv()
      setCustomEnvVars({
        GITHUB_TOKEN: 'ghp_abc',
        COPILOT_CUSTOM_INSTRUCTIONS_DIRS: '/path/to/dirs',
      })

      const copilotEnv = getScopedSpawnEnv('copilot')
      const claudeEnv = getScopedSpawnEnv('claude')

      expect(copilotEnv.GITHUB_TOKEN).toBe('ghp_abc')
      expect(copilotEnv.COPILOT_CUSTOM_INSTRUCTIONS_DIRS).toBe('/path/to/dirs')
      expect(claudeEnv.GITHUB_TOKEN).toBeUndefined()
    })

    it('includes all base PATH/HOME vars (not just secrets)', async () => {
      const { initShellEnv, getScopedSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/custom/bin', stderr: '' })

      await initShellEnv()
      const env = getScopedSpawnEnv('claude')

      expect(env.PATH).toBe('/custom/bin')
    })

    it('does NOT scrub a var that came from the original system env (only custom vars are scrubbed)', async () => {
      const { initShellEnv, getScopedSpawnEnv } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin', stderr: '' })

      // Put GH_TOKEN directly into process.env (simulating existing system env)
      const saved = process.env.GH_TOKEN
      process.env.GH_TOKEN = 'system-level-token'
      try {
        await initShellEnv()
        // Scoping only scrubs vars that were injected via setCustomEnvVars,
        // NOT vars that were already in the system environment.
        const claudeEnv = getScopedSpawnEnv('claude')
        expect(claudeEnv.GH_TOKEN).toBe('system-level-token')
      } finally {
        if (saved !== undefined) process.env.GH_TOKEN = saved
        else delete process.env.GH_TOKEN
      }
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  describe('resolveInShell', () => {
    it('returns the resolved absolute path for a known binary', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin/git\n', stderr: '' })

      const result = await resolveInShell('git')

      expect(result).toBe('/usr/bin/git')
    })

    it('passes the binary name as a positional arg (not interpolated into the command string)', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin/claude\n', stderr: '' })

      await resolveInShell('claude')

      const [, args] = execFileAsyncMock.mock.calls[0]
      // Command string uses "$1", binary name is the last positional arg
      expect(args).toContain('command -v "$1"')
      expect(args[args.length - 1]).toBe('claude')
    })

    it('includes -l and -c for login-shell execution', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin/node\n', stderr: '' })

      await resolveInShell('node')

      const [, args] = execFileAsyncMock.mock.calls[0]
      expect(args).toContain('-l')
      expect(args).toContain('-c')
    })

    it('returns null when the output is not an absolute path', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: 'relative/path\n', stderr: '' })

      expect(await resolveInShell('something')).toBeNull()
    })

    it('returns null when stdout is empty', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '', stderr: '' })

      expect(await resolveInShell('unknown-tool')).toBeNull()
    })

    it('returns null and does not throw on execFile error', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockRejectedValue(new Error('command not found'))

      await expect(resolveInShell('missing-tool')).resolves.toBeNull()
    })

    it('rejects names containing shell-metacharacters (security guard)', async () => {
      const { resolveInShell } = await freshShellEnv()

      expect(await resolveInShell('$(evil command)')).toBeNull()
      expect(await resolveInShell('../../../etc/passwd')).toBeNull()
      expect(await resolveInShell('name; rm -rf /')).toBeNull()

      // execFile must never have been called for any of those
      expect(execFileAsyncMock).not.toHaveBeenCalled()
    })

    it('accepts names with dashes, underscores, and dots', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/local/bin/my-tool_v2.0\n', stderr: '' })

      const result = await resolveInShell('my-tool_v2.0')

      expect(result).toBe('/usr/local/bin/my-tool_v2.0')
    })

    it('uses the timeout option from the source code', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({ stdout: '/usr/bin/git\n', stderr: '' })

      await resolveInShell('git')

      const [, , opts] = execFileAsyncMock.mock.calls[0]
      expect(opts).toEqual(expect.objectContaining({ timeout: 8000 }))
    })

    it('only returns the first line when stdout has multiple lines', async () => {
      const { resolveInShell } = await freshShellEnv()
      execFileAsyncMock.mockResolvedValue({
        stdout: '/usr/bin/git\n/usr/local/bin/git\n',
        stderr: '',
      })

      const result = await resolveInShell('git')

      expect(result).toBe('/usr/bin/git')
    })
  })
})
