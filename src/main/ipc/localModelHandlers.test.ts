import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ───────────────────────────────────────────────────────────────────

const { detectServersMock, isInstalledMock } = vi.hoisted(() => ({
  detectServersMock: vi.fn().mockResolvedValue([]),
  isInstalledMock: vi.fn().mockResolvedValue(false),
}))

vi.mock('../cli/LocalModelAdapter', () => ({
  LocalModelAdapter: class MockLocalModelAdapter {
    detectServers = detectServersMock
    isInstalled = isInstalledMock
  },
}))

import { ipcMain } from 'electron'

// ── Helpers ─────────────────────────────────────────────────────────────────

type HandlerFn = (event: unknown, ...args: unknown[]) => unknown
function getHandler(channel: string): HandlerFn {
  const call = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.find(
    (c: unknown[]) => c[0] === channel,
  )
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as HandlerFn
}

const mockEvent = {} as Electron.IpcMainInvokeEvent

// ── Tests ───────────────────────────────────────────────────────────────────

describe('localModelHandlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Must re-import to get fresh module-level singleton with the mock
    vi.resetModules()
    const mod = await import('./localModelHandlers')
    mod.registerLocalModelHandlers(ipcMain)
  })

  it('registers all expected channels', () => {
    const channels = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0],
    )
    expect(channels).toContain('local-models:detect')
    expect(channels).toContain('local-models:is-available')
  })

  describe('local-models:detect', () => {
    it('delegates to adapter.detectServers()', async () => {
      const servers = [{ name: 'ollama', url: 'http://localhost:11434' }]
      detectServersMock.mockResolvedValue(servers)

      const handler = getHandler('local-models:detect')
      const result = await handler(mockEvent)
      expect(result).toEqual(servers)
      expect(detectServersMock).toHaveBeenCalled()
    })
  })

  describe('local-models:is-available', () => {
    it('returns true when adapter reports installed', async () => {
      isInstalledMock.mockResolvedValue(true)
      const handler = getHandler('local-models:is-available')
      const result = await handler(mockEvent)
      expect(result).toBe(true)
    })

    it('returns false when adapter reports not installed', async () => {
      isInstalledMock.mockResolvedValue(false)
      const handler = getHandler('local-models:is-available')
      const result = await handler(mockEvent)
      expect(result).toBe(false)
    })
  })
})
