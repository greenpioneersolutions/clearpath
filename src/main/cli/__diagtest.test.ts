import { describe, it, expect, vi } from 'vitest'

vi.mock('../utils/shellEnv', () => ({
  resolveInShell: vi.fn().mockResolvedValue('/mocked/bin/claude'),
  getScopedSpawnEnv: vi.fn().mockReturnValue({ PATH: '/usr/bin' }),
  initShellEnv: vi.fn(),
  getSpawnEnv: vi.fn().mockReturnValue({}),
  setCustomEnvVars: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn().mockReturnValue(true) }
})

import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'

describe('diag', () => {
  /**
   * todo: these tests are pretty basic and just check that the mocked methods are working. We should add more thorough tests of the actual logic in ClaudeCodeAdapter, but that will require refactoring to make it more testable (e.g. by injecting dependencies rather than hardcoding imports). For now, this at least verifies that our test setup is working and that we can mock the shell environment and file system as expected.
   */
  /**
   * BUG: bugs/open/BUG-011-claude-adapter-test-esm-mock-not-applied.md
   * vi.mock('../utils/shellEnv') is not applied at runtime — real resolveInShell is called.
   */
  it.skip('isInstalled mock check', async () => {
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.isInstalled()
    console.log('binaryPath:', adapter.binaryPath, 'result:', result)
    expect(adapter.binaryPath).toBe('/mocked/bin/claude')
  })
  /**
   * BUG: bugs/open/BUG-011-claude-adapter-test-esm-mock-not-applied.md
   * vi.mock('fs') is not applied at runtime — real fs.existsSync is called.
   */
  it.skip('isAuthenticated with existsSync mocked to true', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.isAuthenticated()
    console.log('isAuthenticated result:', result)
    expect(result).toBe(true)
  })
})
