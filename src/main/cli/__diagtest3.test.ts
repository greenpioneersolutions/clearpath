import { describe, it, expect, vi } from 'vitest'

// Try spyOn approach after importing as namespace
import * as shellEnv from '../utils/shellEnv'
import * as fsModule from 'fs'
import { ClaudeCodeAdapter } from './ClaudeCodeAdapter'

describe('diag3 - spyOn approach', () => {
  it('isInstalled via spyOn', async () => {
    const spy = vi.spyOn(shellEnv, 'resolveInShell').mockResolvedValue('/spied/bin/claude')
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.isInstalled()
    console.log('binaryPath:', adapter.binaryPath, 'spy calls:', spy.mock.calls.length)
    expect(adapter.binaryPath).toBe('/spied/bin/claude')
    spy.mockRestore()
  })

  /**
   * BUG: bugs/open/BUG-011-claude-adapter-test-esm-mock-not-applied.md
   * TypeError: Cannot spy on export "existsSync" — ESM namespace is not configurable.
   */
  it.skip('isAuthenticated via spyOn existsSync', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const spy = vi.spyOn(fsModule, 'existsSync').mockReturnValue(true)
    const adapter = new ClaudeCodeAdapter()
    const result = await adapter.isAuthenticated()
    console.log('isAuthenticated:', result, 'spy calls:', spy.mock.calls.length)
    expect(result).toBe(true)
    spy.mockRestore()
  })
})
