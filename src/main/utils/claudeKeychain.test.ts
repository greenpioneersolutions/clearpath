import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

// Mock child_process.spawn so we control the `security` exit code.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  return { ...actual, spawn: spawnMock }
})

// The setup-coverage.ts eager-load binds modules before vi.mock can intercept a
// statically-imported target (see CLAUDE.md / BUG-011). Re-importing the module
// fresh after resetModules — with the mock registry already active — makes the
// child_process mock take effect, the same pattern AuthManager.test.ts uses.
async function freshModule() {
  vi.resetModules()
  spawnMock.mockReset()
  return import('./claudeKeychain')
}

function setPlatform(value: string) {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('claudeKeychainTokenExists', () => {
  const originalPlatform = process.platform

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  it('resolves false on non-darwin without spawning `security`', async () => {
    const { claudeKeychainTokenExists } = await freshModule()
    setPlatform('linux')
    await expect(claudeKeychainTokenExists()).resolves.toBe(false)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('resolves true when `security` exits 0 (item found)', async () => {
    const { claudeKeychainTokenExists } = await freshModule()
    setPlatform('darwin')
    spawnMock.mockImplementation(() => {
      const proc = new EventEmitter() as any
      queueMicrotask(() => proc.emit('close', 0))
      return proc
    })
    await expect(claudeKeychainTokenExists()).resolves.toBe(true)
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/bin/security',
      ['find-generic-password', '-s', 'Claude Code-credentials'],
      { stdio: 'ignore' },
    )
  })

  it('resolves false when `security` exits non-zero (item absent)', async () => {
    const { claudeKeychainTokenExists } = await freshModule()
    setPlatform('darwin')
    spawnMock.mockImplementation(() => {
      const proc = new EventEmitter() as any
      queueMicrotask(() => proc.emit('close', 44))
      return proc
    })
    await expect(claudeKeychainTokenExists()).resolves.toBe(false)
  })

  it('resolves false when the spawn errors (e.g. security missing)', async () => {
    const { claudeKeychainTokenExists } = await freshModule()
    setPlatform('darwin')
    spawnMock.mockImplementation(() => {
      const proc = new EventEmitter() as any
      queueMicrotask(() => proc.emit('error', new Error('ENOENT')))
      return proc
    })
    await expect(claudeKeychainTokenExists()).resolves.toBe(false)
  })
})
