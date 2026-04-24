// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import McpRegistryList from './McpRegistryList'
import type { McpRegistryEntry } from '../../types/mcp'

const mockInvoke = vi.fn()

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => vi.fn()), off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
})

const sampleEntries: McpRegistryEntry[] = [
  {
    id: 'id-1',
    name: 'GitHub',
    description: 'GitHub integration',
    command: 'npx',
    args: ['-y', '@mcp/github'],
    env: {},
    secretRefs: { GITHUB_TOKEN: 'key-1' },
    scope: 'global',
    targets: { copilot: true, claude: true },
    enabled: true,
    source: 'catalog',
    catalogId: 'github',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'id-2',
    name: 'Filesystem',
    description: '',
    command: 'npx',
    args: ['-y', '@mcp/fs'],
    env: {},
    secretRefs: {},
    scope: 'project',
    projectPath: '/tmp',
    targets: { copilot: true, claude: false },
    enabled: false,
    source: 'custom',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

function setupMocks(entries: McpRegistryEntry[] = sampleEntries) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'mcp:registry-list') return Promise.resolve(entries)
    if (channel === 'mcp:registry-toggle') return Promise.resolve({ success: true })
    if (channel === 'mcp:registry-remove') return Promise.resolve({ success: true })
    if (channel === 'workspace:get-active') return Promise.resolve(null)
    if (channel === 'workspace:list') return Promise.resolve([])
    return Promise.resolve(null)
  })
}

const noop = () => {}

describe('McpRegistryList', () => {
  it('shows empty state when no entries, and CTA jumps to catalog', async () => {
    setupMocks([])
    const onBrowse = vi.fn()
    render(<McpRegistryList onBrowseCatalog={onBrowse} onToast={noop} />)
    await waitFor(() => {
      expect(screen.getByText('No MCPs installed yet')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Browse catalog'))
    expect(onBrowse).toHaveBeenCalled()
  })

  it('renders entries with name and command preview', async () => {
    setupMocks()
    render(<McpRegistryList onBrowseCatalog={noop} onToast={noop} />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeDefined()
      expect(screen.getByText('Filesystem')).toBeDefined()
      expect(screen.getAllByText('npx -y @mcp/github').length).toBeGreaterThan(0)
    })
  })

  it('shows Catalog badge on catalog-source entries', async () => {
    setupMocks()
    render(<McpRegistryList onBrowseCatalog={noop} onToast={noop} />)
    await waitFor(() => {
      expect(screen.getByText('Catalog')).toBeDefined()
    })
  })

  it('calls toggle IPC when toggle is clicked and rolls back on failure', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'mcp:registry-list') return Promise.resolve(sampleEntries)
      if (channel === 'mcp:registry-toggle') return Promise.resolve({ success: false, error: 'nope' })
      return Promise.resolve(null)
    })
    const onToast = vi.fn()
    render(<McpRegistryList onBrowseCatalog={noop} onToast={onToast} />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeDefined()
    })
    const toggles = screen.getAllByRole('switch')
    fireEvent.click(toggles[0])
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'mcp:registry-toggle',
        expect.objectContaining({ id: 'id-1', enabled: false }),
      )
      expect(onToast).toHaveBeenCalledWith('nope', 'error')
    })
  })

  it('calls toggle IPC with success does not toast error', async () => {
    setupMocks()
    const onToast = vi.fn()
    render(<McpRegistryList onBrowseCatalog={noop} onToast={onToast} />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeDefined()
    })
    const toggles = screen.getAllByRole('switch')
    fireEvent.click(toggles[0])
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'mcp:registry-toggle',
        expect.objectContaining({ id: 'id-1', enabled: false }),
      )
    })
    // No error toast
    expect(onToast).not.toHaveBeenCalledWith(expect.anything(), 'error')
  })

  it('shows confirm dialog before removing, then calls remove IPC', async () => {
    setupMocks()
    const onToast = vi.fn()
    render(<McpRegistryList onBrowseCatalog={noop} onToast={onToast} />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeDefined()
    })
    // Click first Remove button
    const removeBtns = screen.getAllByText('Remove')
    fireEvent.click(removeBtns[0])

    // Confirm dialog appears
    await waitFor(() => {
      expect(screen.getByText(/Remove GitHub\?/)).toBeDefined()
    })

    // Click confirm Remove button in dialog (the second Remove button in DOM)
    const confirmBtns = screen.getAllByText('Remove')
    fireEvent.click(confirmBtns[confirmBtns.length - 1])

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'mcp:registry-remove',
        expect.objectContaining({ id: 'id-1' }),
      )
      expect(onToast).toHaveBeenCalledWith('Removed GitHub.', 'success')
    })
  })

  it('opens editor when Edit clicked', async () => {
    setupMocks()
    render(<McpRegistryList onBrowseCatalog={noop} onToast={noop} />)
    await waitFor(() => {
      expect(screen.getByText('GitHub')).toBeDefined()
    })
    const editBtns = screen.getAllByText('Edit')
    fireEvent.click(editBtns[0])
    await waitFor(() => {
      expect(screen.getByText('Edit GitHub')).toBeDefined()
    })
  })

  // ── Test-connection button ──────────────────────────────────────────────────

  describe('test-connection button', () => {
    it('calls mcp:test-server and shows Connected on success', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'mcp:registry-list') return Promise.resolve(sampleEntries)
        if (channel === 'mcp:test-server') return Promise.resolve({ success: true, durationMs: 42 })
        return Promise.resolve(null)
      })
      render(<McpRegistryList onBrowseCatalog={noop} onToast={noop} />)
      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeDefined()
      })
      const testButtons = screen.getAllByText('Test')
      fireEvent.click(testButtons[0])
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('mcp:test-server', { id: 'id-1' })
      })
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeDefined()
      })
    })

    it('shows a Failed indicator with tooltip when the test fails', async () => {
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'mcp:registry-list') return Promise.resolve(sampleEntries)
        if (channel === 'mcp:test-server') {
          return Promise.resolve({ success: false, stderrSnippet: 'boom: bad config' })
        }
        return Promise.resolve(null)
      })
      render(<McpRegistryList onBrowseCatalog={noop} onToast={noop} />)
      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeDefined()
      })
      const testButtons = screen.getAllByText('Test')
      fireEvent.click(testButtons[0])
      await waitFor(() => {
        const failed = screen.getByText('Failed')
        expect(failed).toBeDefined()
        // The tooltip is on the nearest button — check its title attribute.
        const btn = failed.closest('button')
        expect(btn?.getAttribute('title')).toContain('boom')
      })
    })

    it('debounces concurrent clicks (only one IPC call while testing is in flight)', async () => {
      let resolveTest: (v: { success: boolean }) => void = () => {}
      mockInvoke.mockImplementation((channel: string) => {
        if (channel === 'mcp:registry-list') return Promise.resolve(sampleEntries)
        if (channel === 'mcp:test-server') {
          return new Promise<{ success: boolean }>((res) => { resolveTest = res })
        }
        return Promise.resolve(null)
      })
      render(<McpRegistryList onBrowseCatalog={noop} onToast={noop} />)
      await waitFor(() => {
        expect(screen.getByText('GitHub')).toBeDefined()
      })
      const testButtons = screen.getAllByText('Test')
      fireEvent.click(testButtons[0])
      fireEvent.click(testButtons[0])
      fireEvent.click(testButtons[0])
      // All three clicks should have triggered at most one test-server call.
      const testCalls = mockInvoke.mock.calls.filter((c) => c[0] === 'mcp:test-server')
      expect(testCalls.length).toBe(1)
      resolveTest({ success: true })
    })
  })
})
