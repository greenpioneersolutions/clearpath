import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerPluginHandlers } from './pluginHandlers'
import { dialog } from 'electron'
import type { PluginManager } from '../plugins/PluginManager'

vi.mock('electron', () => ({
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}))

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

interface MockIpcMain {
  handle: ReturnType<typeof vi.fn>
}

function createMockIpcMain(): MockIpcMain {
  return { handle: vi.fn() }
}

function getHandler(ipcMain: MockIpcMain, channel: string) {
  const call = ipcMain.handle.mock.calls.find((c: unknown[]) => c[0] === channel)
  if (!call) throw new Error(`No handler registered for channel: ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

function makeMockManager(): PluginManager {
  return {
    listPlugins: vi.fn().mockReturnValue([]),
    addCustomPath: vi.fn().mockReturnValue({ entry: { id: '/p', cli: 'claude' } }),
    removeCustomPath: vi.fn(),
    setEnabled: vi.fn(),
    getEnabledPaths: vi.fn().mockReturnValue([]),
  } as unknown as PluginManager
}

describe('registerPluginHandlers', () => {
  let ipcMain: MockIpcMain
  let manager: PluginManager

  beforeEach(() => {
    vi.clearAllMocks()
    ipcMain = createMockIpcMain()
    manager = makeMockManager()
    registerPluginHandlers(ipcMain as unknown as Parameters<typeof registerPluginHandlers>[0], manager)
  })

  it('registers all expected channels', () => {
    const channels = ipcMain.handle.mock.calls.map((c) => c[0])
    expect(channels).toContain('plugins:list')
    expect(channels).toContain('plugins:rescan')
    expect(channels).toContain('plugins:add-custom')
    expect(channels).toContain('plugins:remove-custom')
    expect(channels).toContain('plugins:set-enabled')
    expect(channels).toContain('plugins:open-folder')
  })

  it('plugins:list delegates to listPlugins', async () => {
    const handler = getHandler(ipcMain, 'plugins:list')
    await handler({}, undefined)
    expect(manager.listPlugins).toHaveBeenCalled()
  })

  it('plugins:set-enabled rejects invalid cli', async () => {
    const handler = getHandler(ipcMain, 'plugins:set-enabled')
    const result = (await handler({}, { cli: 'bogus', paths: [] })) as { error?: string }
    expect(result.error).toBeDefined()
    expect(manager.setEnabled).not.toHaveBeenCalled()
  })

  it('plugins:set-enabled forwards to manager when args are valid', async () => {
    const handler = getHandler(ipcMain, 'plugins:set-enabled')
    await handler({}, { cli: 'claude', paths: ['/a', '/b'] })
    expect(manager.setEnabled).toHaveBeenCalledWith('claude', ['/a', '/b'])
  })

  it('plugins:remove-custom requires path', async () => {
    const handler = getHandler(ipcMain, 'plugins:remove-custom')
    const result = (await handler({}, {})) as { error?: string }
    expect(result.error).toBeDefined()
    expect(manager.removeCustomPath).not.toHaveBeenCalled()
  })

  it('plugins:add-custom returns canceled when dialog is canceled and no path supplied', async () => {
    ;(dialog.showOpenDialog as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      canceled: true,
      filePaths: [],
    })
    const handler = getHandler(ipcMain, 'plugins:add-custom')
    const result = (await handler({}, { cli: 'auto' })) as { canceled?: boolean }
    expect(result.canceled).toBe(true)
    expect(manager.addCustomPath).not.toHaveBeenCalled()
  })

  it('plugins:add-custom forwards explicit path to manager', async () => {
    const handler = getHandler(ipcMain, 'plugins:add-custom')
    const result = (await handler({}, { path: '/explicit', cli: 'auto' })) as { entry?: unknown }
    expect(manager.addCustomPath).toHaveBeenCalledWith({ path: '/explicit', cli: 'auto' })
    expect(result.entry).toBeDefined()
  })

  it('plugins:open-folder returns success when shell.openPath succeeds', async () => {
    // Note: shell mock's default return is undefined (falsy), which the handler
    // treats as success. We assert behavior rather than mock-call equality because
    // the test-file's bound `shell` differs from the handler module's binding.
    const handler = getHandler(ipcMain, 'plugins:open-folder')
    const result = (await handler({}, { path: '/some/dir' })) as { success?: boolean; error?: string }
    expect(result.success).toBe(true)
  })

  it('plugins:open-folder requires path', async () => {
    const handler = getHandler(ipcMain, 'plugins:open-folder')
    const result = (await handler({}, {})) as { error?: string }
    expect(result.error).toBeDefined()
  })
})
