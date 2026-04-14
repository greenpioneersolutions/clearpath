/**
 * Tests for preload/index.ts — the IPC security boundary.
 *
 * The preload script uses contextBridge.exposeInMainWorld to expose a safe
 * electronAPI object. It validates all IPC channels against explicit allowlists.
 * Extension channels are loaded dynamically via sendSync at preload init and
 * can be refreshed via refreshExtensionChannels().
 */

import { contextBridge, ipcRenderer } from 'electron'

// The preload script runs its side-effects on import — import it to trigger registration
import './index'

// Helper to get the exposed API object
function getExposedAPI(): {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void
  off: (channel: string, callback: (...args: unknown[]) => void) => void
  refreshExtensionChannels: () => void
} {
  // contextBridge.exposeInMainWorld was called with ('electronAPI', api)
  const calls = vi.mocked(contextBridge.exposeInMainWorld).mock.calls
  const apiCall = calls.find(([name]) => name === 'electronAPI')
  if (!apiCall) throw new Error('electronAPI was not exposed via contextBridge')
  return apiCall[1] as ReturnType<typeof getExposedAPI>
}

// Capture sendSync calls made during module import (before any beforeEach resets)
const sendSyncCallsDuringInit = vi.mocked(ipcRenderer.sendSync).mock.calls.slice()

describe('preload IPC security boundary', () => {
  let api: ReturnType<typeof getExposedAPI>

  beforeAll(() => {
    api = getExposedAPI()
  })

  beforeEach(() => {
    vi.mocked(ipcRenderer.invoke).mockReset()
    vi.mocked(ipcRenderer.on).mockReset()
    vi.mocked(ipcRenderer.removeListener).mockReset()
    vi.mocked(ipcRenderer.removeAllListeners).mockReset()
    vi.mocked(ipcRenderer.sendSync).mockReset()
  })

  describe('initial extension channel loading', () => {
    it('calls sendSync to fetch extension channels at module load', () => {
      // sendSync was called during module import (preload init), captured before resets
      const syncCall = sendSyncCallsDuringInit.find(
        (call) => call[0] === 'extension:get-channels-sync',
      )
      expect(syncCall).toBeDefined()
    })
  })

  describe('invoke()', () => {
    it('allows whitelisted channels', async () => {
      vi.mocked(ipcRenderer.invoke).mockResolvedValue({ ok: true })

      const result = await api.invoke('settings:get')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:get')
      expect(result).toEqual({ ok: true })
    })

    it('passes arguments through to ipcRenderer.invoke', async () => {
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(undefined)

      await api.invoke('cli:send-input', { sessionId: 's1', input: 'hello' })
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(
        'cli:send-input',
        { sessionId: 's1', input: 'hello' },
      )
    })

    it('rejects non-whitelisted channels', async () => {
      await expect(api.invoke('malicious:steal-data')).rejects.toThrow(
        'IPC channel not allowed: malicious:steal-data',
      )
      expect(ipcRenderer.invoke).not.toHaveBeenCalled()
    })

    it('rejects empty channel', async () => {
      await expect(api.invoke('')).rejects.toThrow('IPC channel not allowed: ')
      expect(ipcRenderer.invoke).not.toHaveBeenCalled()
    })

    const sampleAllowedChannels = [
      'app:get-cwd',
      'auth:get-status',
      'cli:start-session',
      'agent:list',
      'cost:summary',
      'notifications:list',
      'compliance:scan-text',
      'git:status',
      'settings:get',
      'tools:list-mcp-servers',
      'skills:list',
      'templates:list',
      'policy:get-active',
      'kb:search',
      'learn:get-paths',
      'branding:get',
      'feature-flags:get',
      'team:check-setup',
      'scheduler:list',
      'subagent:list',
      'local-models:detect',
      'updater:check',
      'accessibility:get',
      'wizard:get-config',
      'starter-pack:get-agents',
      'extension:get-channels',
      'data:get-storage-stats',
      'workspace:list',
      'onboarding:get-state',
      'session-history:list',
    ]

    it.each(sampleAllowedChannels)('allows channel: %s', async (channel) => {
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke(channel)
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(channel)
    })
  })

  describe('on()', () => {
    it('registers listener for allowed receive channels', () => {
      const callback = vi.fn()
      const unsubscribe = api.on('cli:output', callback)

      expect(ipcRenderer.on).toHaveBeenCalledWith('cli:output', expect.any(Function))
      expect(typeof unsubscribe).toBe('function')
    })

    it('returns noop for disallowed channels', () => {
      const callback = vi.fn()
      const unsubscribe = api.on('not:allowed', callback)

      expect(ipcRenderer.on).not.toHaveBeenCalled()
      expect(typeof unsubscribe).toBe('function')
      // calling unsubscribe should not throw
      unsubscribe()
    })

    it('unsubscribe removes the listener', () => {
      const callback = vi.fn()
      const unsubscribe = api.on('cli:output', callback)

      unsubscribe()
      expect(ipcRenderer.removeListener).toHaveBeenCalledWith('cli:output', expect.any(Function))
    })

    it('wraps callback to strip IpcRendererEvent', () => {
      const callback = vi.fn()
      api.on('cli:output', callback)

      // Get the wrapped callback that was registered
      const wrappedCallback = vi.mocked(ipcRenderer.on).mock.calls[0][1] as Function
      const fakeEvent = {} // mock IpcRendererEvent
      wrappedCallback(fakeEvent, 'data1', 'data2')

      expect(callback).toHaveBeenCalledWith('data1', 'data2')
    })

    const allowedReceiveChannels = [
      'auth:login-output', 'auth:login-complete', 'auth:status-changed',
      'cli:output', 'cli:error', 'cli:exit', 'cli:turn-start', 'cli:turn-end',
      'cli:permission-request', 'cli:usage',
      'files:changed',
      'notification:new',
      'subagent:output', 'subagent:spawned', 'subagent:status-changed',
      'updater:status',
    ]

    it.each(allowedReceiveChannels)('allows receive channel: %s', (channel) => {
      const callback = vi.fn()
      api.on(channel, callback)
      expect(ipcRenderer.on).toHaveBeenCalledWith(channel, expect.any(Function))
    })
  })

  describe('off()', () => {
    it('removes all listeners for allowed receive channels', () => {
      const callback = vi.fn()
      api.off('cli:output', callback)

      expect(ipcRenderer.removeAllListeners).toHaveBeenCalledWith('cli:output')
    })

    it('does nothing for disallowed channels', () => {
      const callback = vi.fn()
      api.off('not:allowed', callback)

      expect(ipcRenderer.removeAllListeners).not.toHaveBeenCalled()
    })
  })

  describe('refreshExtensionChannels()', () => {
    it('adds extension channels to the allowlist after fetching from main process', async () => {
      // Initially, a custom extension channel should be blocked
      await expect(api.invoke('com.custom-ext:do-thing')).rejects.toThrow(
        'IPC channel not allowed: com.custom-ext:do-thing',
      )

      // Mock the sendSync response for extension channels
      vi.mocked(ipcRenderer.sendSync).mockReturnValueOnce({
        success: true,
        data: ['com.custom-ext:do-thing', 'com.custom-ext:query'],
      })

      api.refreshExtensionChannels()

      // The channel should now be allowed
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('com.custom-ext:do-thing')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('com.custom-ext:do-thing')

      expect(ipcRenderer.sendSync).toHaveBeenCalledWith('extension:get-channels-sync')
    })

    it('preserves static channels after refresh', async () => {
      // Mock the sendSync response
      vi.mocked(ipcRenderer.sendSync).mockReturnValueOnce({
        success: true,
        data: ['com.new-ext:action'],
      })

      api.refreshExtensionChannels()

      // Extension channel should work
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('com.new-ext:action')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('com.new-ext:action')

      // Static channels should still work
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('settings:get')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:get')
    })

    it('clears previous extension channels on refresh', async () => {
      // First refresh: add channel A
      vi.mocked(ipcRenderer.sendSync).mockReturnValueOnce({
        success: true,
        data: ['ext-a:action'],
      })
      api.refreshExtensionChannels()

      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('ext-a:action') // should work

      // Second refresh: only channel B (A was removed from the extension)
      vi.mocked(ipcRenderer.sendSync).mockReturnValueOnce({
        success: true,
        data: ['ext-b:action'],
      })
      api.refreshExtensionChannels()

      // Channel A should now be blocked
      await expect(api.invoke('ext-a:action')).rejects.toThrow(
        'IPC channel not allowed: ext-a:action',
      )

      // Channel B should work
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('ext-b:action')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('ext-b:action')
    })

    it('silently ignores errors from the main process', async () => {
      vi.mocked(ipcRenderer.sendSync).mockImplementationOnce(() => {
        throw new Error('IPC failed')
      })

      // Should not throw
      api.refreshExtensionChannels()

      // Static channels should still work fine
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('settings:get')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:get')
    })

    it('handles malformed response gracefully', async () => {
      vi.mocked(ipcRenderer.sendSync).mockReturnValueOnce({ success: false })

      // Should not throw
      api.refreshExtensionChannels()

      // Static channels should still work
      vi.mocked(ipcRenderer.invoke).mockResolvedValue(null)
      await api.invoke('settings:get')
      expect(ipcRenderer.invoke).toHaveBeenCalledWith('settings:get')
    })
  })
})
