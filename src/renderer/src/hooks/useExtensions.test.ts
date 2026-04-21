/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useExtensions } from './useExtensions'

// ── Mock electronAPI ──────────────────────────────────────────────────────────

const mockInvoke = vi.fn()

function makeExtension(id: string, overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      id,
      name: `Test ${id}`,
      version: '1.0.0',
      description: 'test',
      author: 'tester',
      permissions: ['storage'],
    },
    installPath: `/extensions/${id}`,
    source: 'user',
    enabled: false,
    installedAt: Date.now(),
    manifestHash: 'hash123',
    grantedPermissions: [],
    deniedPermissions: [],
    errorCount: 0,
    lastError: null,
    ...overrides,
  }
}

describe('useExtensions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({ success: true, data: [] })

    Object.defineProperty(window, 'electronAPI', {
      // on() must return an unsubscribe function — the hook calls it on cleanup
      value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  it('loads extensions on mount', async () => {
    const exts = [makeExtension('com.test.ext1')]
    mockInvoke.mockResolvedValue({ success: true, data: exts })

    const { result } = renderHook(() => useExtensions())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.extensions).toHaveLength(1)
    expect(result.current.extensions[0].manifest.id).toBe('com.test.ext1')
    expect(result.current.error).toBeNull()
  })

  it('filters enabledExtensions correctly', async () => {
    const exts = [
      makeExtension('com.test.ext1', { enabled: true }),
      makeExtension('com.test.ext2', { enabled: false }),
      makeExtension('com.test.ext3', { enabled: true }),
    ]
    mockInvoke.mockResolvedValue({ success: true, data: exts })

    const { result } = renderHook(() => useExtensions())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.enabledExtensions).toHaveLength(2)
  })

  it('sets error when load fails', async () => {
    mockInvoke.mockResolvedValue({ success: false, error: 'Load failed' })

    const { result } = renderHook(() => useExtensions())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBe('Load failed')
    expect(result.current.extensions).toHaveLength(0)
  })

  it('sets error on IPC exception', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC crashed'))

    const { result } = renderHook(() => useExtensions())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toContain('IPC crashed')
  })

  describe('toggle', () => {
    it('invokes extension:toggle and refreshes', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [makeExtension('com.test.ext')] }) // initial load
        .mockResolvedValueOnce({ success: true }) // toggle
        .mockResolvedValueOnce({ success: true, data: [makeExtension('com.test.ext', { enabled: true })] }) // refresh

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.toggle('com.test.ext', true)
      })

      expect(mockInvoke).toHaveBeenCalledWith('extension:toggle', {
        extensionId: 'com.test.ext',
        enabled: true,
      })
    })

    it('throws on toggle failure', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] }) // initial load
        .mockResolvedValueOnce({ success: false, error: 'Toggle failed' }) // toggle

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      await expect(
        act(async () => {
          await result.current.toggle('com.test.ext', true)
        }),
      ).rejects.toThrow('Toggle failed')
    })
  })

  describe('uninstall', () => {
    it('invokes extension:uninstall and refreshes', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [makeExtension('com.test.ext')] })
        .mockResolvedValueOnce({ success: true }) // uninstall
        .mockResolvedValueOnce({ success: true, data: [] }) // refresh

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.uninstall('com.test.ext')
      })

      expect(mockInvoke).toHaveBeenCalledWith('extension:uninstall', {
        extensionId: 'com.test.ext',
      })
    })
  })

  describe('install', () => {
    it('invokes extension:install and refreshes', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] }) // initial load
        .mockResolvedValueOnce({ success: true }) // install
        .mockResolvedValueOnce({ success: true, data: [makeExtension('com.test.new')] }) // refresh

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.install()
      })

      expect(mockInvoke).toHaveBeenCalledWith('extension:install')
    })

    it('does not throw when installation is cancelled', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] }) // initial load
        .mockResolvedValueOnce({ success: false, error: 'Installation cancelled' }) // install cancelled
        .mockResolvedValueOnce({ success: true, data: [] }) // refresh

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      // Should NOT throw
      await act(async () => {
        await result.current.install()
      })
    })

    it('throws on install failure (non-cancel)', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] })
        .mockResolvedValueOnce({ success: false, error: 'Invalid extension' })

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      await expect(
        act(async () => {
          await result.current.install()
        }),
      ).rejects.toThrow('Invalid extension')
    })
  })

  describe('updatePermissions', () => {
    it('invokes extension:update-permissions and refreshes', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] })
        .mockResolvedValueOnce({ success: true }) // updatePermissions
        .mockResolvedValueOnce({ success: true, data: [] }) // refresh

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.updatePermissions('com.test.ext', ['storage'], ['http:fetch'])
      })

      expect(mockInvoke).toHaveBeenCalledWith('extension:update-permissions', {
        extensionId: 'com.test.ext',
        granted: ['storage'],
        denied: ['http:fetch'],
      })
    })
  })

  describe('checkRequirements', () => {
    it('returns requirement check results', async () => {
      const reqResult = {
        met: false,
        results: [{ integration: 'github', label: 'GitHub', message: 'Connect GitHub', met: false }],
      }

      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] }) // initial load
        .mockResolvedValueOnce({ success: true, data: reqResult }) // check

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      let checkResult: Awaited<ReturnType<typeof result.current.checkRequirements>> | undefined
      await act(async () => {
        checkResult = await result.current.checkRequirements('com.test.ext')
      })

      expect(checkResult!.met).toBe(false)
      expect(checkResult!.results).toHaveLength(1)
    })

    it('returns fallback on error', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] })
        .mockRejectedValueOnce(new Error('IPC failure'))

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))

      let checkResult: Awaited<ReturnType<typeof result.current.checkRequirements>> | undefined
      await act(async () => {
        checkResult = await result.current.checkRequirements('com.test.ext')
      })

      expect(checkResult!.met).toBe(true)
      expect(checkResult!.results).toHaveLength(0)
    })
  })

  describe('refresh', () => {
    it('reloads extensions list', async () => {
      mockInvoke
        .mockResolvedValueOnce({ success: true, data: [] }) // initial load
        .mockResolvedValueOnce({ success: true, data: [makeExtension('com.test.ext')] }) // refresh

      const { result } = renderHook(() => useExtensions())

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.extensions).toHaveLength(0)

      await act(async () => {
        await result.current.refresh()
      })

      expect(result.current.extensions).toHaveLength(1)
    })
  })
})
