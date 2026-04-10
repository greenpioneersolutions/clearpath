import { describe, it, expect, vi } from 'vitest'

// Try with node:fs prefix
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) }
})

// Try with absolute path for shellEnv
vi.mock('/Users/jaredkremer/development/clearpath/src/main/utils/shellEnv', () => ({
  resolveInShell: vi.fn().mockResolvedValue('/mocked/bin/claude'),
  getScopedSpawnEnv: vi.fn().mockReturnValue({ PATH: '/usr/bin' }),
  initShellEnv: vi.fn(),
  getSpawnEnv: vi.fn().mockReturnValue({}),
  setCustomEnvVars: vi.fn(),
}))

import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'

describe('diag2', () => {
  /**
   * BUG: bugs/open/BUG-011-claude-adapter-test-esm-mock-not-applied.md
   * Absolute-path vi.mock for shellEnv also fails — real resolveInShell is called.
   */
  it.skip('isInstalled with absolute path mock', async () => {
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.isInstalled()
    console.log('binaryPath:', adapter.binaryPath)
    expect(adapter.binaryPath).toBe('/mocked/bin/claude')
  })
  /**
   * BUG: bugs/open/BUG-011-claude-adapter-test-esm-mock-not-applied.md
   * vi.mock('node:fs') also fails to intercept — real fs.existsSync is called.
   */
  it.skip('isAuthenticated with node:fs mock', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.isAuthenticated()
    console.log('isAuthenticated:', result)
    expect(result).toBe(true)
  })
})
