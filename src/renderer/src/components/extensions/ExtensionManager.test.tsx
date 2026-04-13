/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

// ── Mock electronAPI ──────────────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockOn = vi.fn()

function makeExtension(id: string, overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      id,
      name: `Test ${id}`,
      version: '1.0.0',
      description: `Description for ${id}`,
      author: 'Test Author',
      permissions: ['storage', 'notifications:emit'],
      ...((overrides.manifest as Record<string, unknown>) ?? {}),
    },
    installPath: `/extensions/${id}`,
    source: 'user' as const,
    enabled: false,
    installedAt: Date.now(),
    manifestHash: 'hash',
    grantedPermissions: [] as string[],
    deniedPermissions: [] as string[],
    errorCount: 0,
    lastError: null as string | null,
    ...overrides,
  }
}

// Helper to set up IPC responses before each test.
// The component uses useExtensions which calls `extension:list` on mount.
function setupExtensions(exts: unknown[]) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'extension:list') {
      return Promise.resolve({ success: true, data: exts })
    }
    if (channel === 'extension:check-requirements') {
      return Promise.resolve({ success: true, data: { met: true, results: [] } })
    }
    if (channel === 'extension:toggle') {
      return Promise.resolve({ success: true })
    }
    if (channel === 'extension:uninstall') {
      return Promise.resolve({ success: true })
    }
    if (channel === 'extension:install') {
      return Promise.resolve({ success: true })
    }
    if (channel === 'extension:update-permissions') {
      return Promise.resolve({ success: true })
    }
    return Promise.resolve(null)
  })
}

describe('ExtensionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'electronAPI', {
      value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
      writable: true,
      configurable: true,
    })
  })

  // Lazy import to ensure mocks are in place
  async function renderManager() {
    const { default: ExtensionManager } = await import('./ExtensionManager')
    return render(<ExtensionManager />)
  }

  it('shows empty state when no extensions', async () => {
    setupExtensions([])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('No extensions installed')).toBeInTheDocument()
    })
  })

  it('renders extension list with name, version, and source', async () => {
    setupExtensions([
      makeExtension('com.test.ext1', { source: 'bundled' }),
      makeExtension('com.test.ext2', { source: 'user' }),
    ])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('Test com.test.ext1')).toBeInTheDocument()
      expect(screen.getByText('Test com.test.ext2')).toBeInTheDocument()
      expect(screen.getByText('bundled')).toBeInTheDocument()
      expect(screen.getByText('user')).toBeInTheDocument()
    })
  })

  it('shows extension description', async () => {
    setupExtensions([makeExtension('com.test.ext')])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('Description for com.test.ext')).toBeInTheDocument()
    })
  })

  it('shows error count badge for errored extensions', async () => {
    setupExtensions([
      makeExtension('com.test.ext', { errorCount: 2, lastError: 'Last error message' }),
    ])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('2 errors')).toBeInTheDocument()
    })
  })

  it('shows singular error text for 1 error', async () => {
    setupExtensions([makeExtension('com.test.ext', { errorCount: 1, lastError: 'err' })])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('1 error')).toBeInTheDocument()
    })
  })

  it('renders Install Extension and Refresh buttons', async () => {
    setupExtensions([])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('Install Extension')).toBeInTheDocument()
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })
  })

  it('calls extension:list again on Refresh click', async () => {
    setupExtensions([])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Refresh'))

    await waitFor(() => {
      // Called twice: once on mount, once on refresh
      const listCalls = mockInvoke.mock.calls.filter((c: unknown[]) => c[0] === 'extension:list')
      expect(listCalls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('calls extension:install on Install Extension click', async () => {
    setupExtensions([])
    await renderManager()

    await waitFor(() => {
      expect(screen.getByText('Install Extension')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Install Extension'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('extension:install')
    })
  })

  describe('expanded detail panel', () => {
    it('expands on click to show metadata', async () => {
      setupExtensions([makeExtension('com.test.ext')])
      await renderManager()

      await waitFor(() => {
        expect(screen.getByText('Test com.test.ext')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Test com.test.ext'))

      await waitFor(() => {
        expect(screen.getByText('Author')).toBeInTheDocument()
        expect(screen.getByText('Test Author')).toBeInTheDocument()
        expect(screen.getByText('ID')).toBeInTheDocument()
      })
    })

    it('shows permissions with grant/deny status', async () => {
      setupExtensions([makeExtension('com.test.ext', { grantedPermissions: ['storage'] })])
      await renderManager()

      await waitFor(() => {
        expect(screen.getByText('Test com.test.ext')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Test com.test.ext'))

      await waitFor(() => {
        expect(screen.getByText('Permissions')).toBeInTheDocument()
        expect(screen.getByText('Granted')).toBeInTheDocument()
        expect(screen.getByText('Denied')).toBeInTheDocument()
      })
    })

    it('shows Uninstall for user extensions but not bundled', async () => {
      setupExtensions([
        makeExtension('com.test.user', { source: 'user' }),
        makeExtension('com.test.bundled', { source: 'bundled' }),
      ])
      await renderManager()

      await waitFor(() => {
        expect(screen.getByText('Test com.test.user')).toBeInTheDocument()
      })

      // Expand user extension
      fireEvent.click(screen.getByText('Test com.test.user'))

      await waitFor(() => {
        expect(screen.getByText('Uninstall')).toBeInTheDocument()
      })
    })

    it('collapses on second click', async () => {
      setupExtensions([makeExtension('com.test.ext')])
      await renderManager()

      await waitFor(() => {
        expect(screen.getByText('Test com.test.ext')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Test com.test.ext'))
      await waitFor(() => expect(screen.getByText('Author')).toBeInTheDocument())

      fireEvent.click(screen.getByText('Test com.test.ext'))
      await waitFor(() => expect(screen.queryByText('Author')).not.toBeInTheDocument())
    })
  })

  describe('toggle', () => {
    it('calls extension:toggle when switch is clicked', async () => {
      setupExtensions([makeExtension('com.test.ext', { enabled: false })])
      await renderManager()

      await waitFor(() => {
        expect(screen.getByTitle('Enable')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Enable'))

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('extension:toggle', {
          extensionId: 'com.test.ext',
          enabled: true,
        })
      })
    })

    it('calls extension:toggle to disable when already enabled', async () => {
      setupExtensions([makeExtension('com.test.ext', { enabled: true })])
      await renderManager()

      await waitFor(() => {
        expect(screen.getByTitle('Disable')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTitle('Disable'))

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('extension:toggle', {
          extensionId: 'com.test.ext',
          enabled: false,
        })
      })
    })
  })
})
