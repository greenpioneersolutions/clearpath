// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Connections from './Connections'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
    configurable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

function defaultInvoke(unsafe = false) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'mcp:secrets-get-meta') return Promise.resolve({ keys: [], unsafeMode: unsafe })
    if (channel === 'mcp:catalog-list') return Promise.resolve([])
    if (channel === 'mcp:registry-list') return Promise.resolve([])
    if (channel === 'mcp:sync-now') return Promise.resolve({ success: true })
    return Promise.resolve(null)
  })
}

describe('Connections', () => {
  it('renders the page header with subtitle', async () => {
    defaultInvoke()
    render(<Connections />)
    expect(screen.getByText('Connections')).toBeDefined()
    expect(
      screen.getByText('Add MCP servers that both CoPilot and Claude Code can use.'),
    ).toBeDefined()
  })

  it('renders all three tabs', async () => {
    defaultInvoke()
    render(<Connections />)
    expect(screen.getByRole('tab', { name: 'Catalog' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Installed' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Advanced' })).toBeDefined()
  })

  it('starts on the Catalog tab', async () => {
    defaultInvoke()
    render(<Connections />)
    expect(screen.getByRole('tab', { name: 'Catalog' }).getAttribute('aria-selected')).toBe('true')
  })

  it('switches to the Installed tab', async () => {
    defaultInvoke()
    render(<Connections />)
    fireEvent.click(screen.getByRole('tab', { name: 'Installed' }))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Installed' }).getAttribute('aria-selected')).toBe('true')
    })
  })

  it('switches to Advanced and shows Re-sync button', async () => {
    defaultInvoke()
    render(<Connections />)
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    await waitFor(() => {
      expect(screen.getByText('Re-sync now')).toBeDefined()
    })
  })

  it('shows unsafe mode banner only when secrets.unsafeMode is true', async () => {
    defaultInvoke(true)
    render(<Connections />)
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    await waitFor(() => {
      expect(screen.getByText(/OS keychain isn't available/i)).toBeDefined()
    })
  })

  it('hides unsafe mode banner when secrets.unsafeMode is false', async () => {
    defaultInvoke(false)
    render(<Connections />)
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    await waitFor(() => {
      expect(screen.queryByText(/OS keychain isn't available/i)).toBeNull()
    })
  })

  it('calls mcp:sync-now when Re-sync button clicked', async () => {
    defaultInvoke()
    render(<Connections />)
    fireEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    await waitFor(() => {
      expect(screen.getByText('Re-sync now')).toBeDefined()
    })
    fireEvent.click(screen.getByText('Re-sync now'))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('mcp:sync-now')
    })
  })

  // ── External-changes banner ─────────────────────────────────────────────────

  describe('external-changes banner', () => {
    let emit: ((payload: unknown) => void) | null = null

    beforeEach(() => {
      emit = null
      mockOn.mockImplementation(((channel: string, cb: (...a: unknown[]) => void) => {
        if (channel === 'mcp:external-changes-detected') {
          emit = (payload) => cb(payload)
        }
        return () => {}
      }) as never)
    })

    it('does not render the banner when no external changes', async () => {
      defaultInvoke()
      render(<Connections />)
      await waitFor(() => {
        expect(screen.queryByText('External changes detected')).toBeNull()
      })
    })

    it('renders the banner when the main process emits a change event', async () => {
      defaultInvoke()
      render(<Connections />)
      // Simulate main-process emission via the captured callback.
      emit?.([{ path: '/fake/.claude/mcp-config.json', cli: 'claude', scope: 'global' }])
      await waitFor(() => {
        expect(screen.getByText('External changes detected')).toBeDefined()
        expect(screen.getByText(/mcp-config\.json/)).toBeDefined()
      })
    })

    it('adopting calls mcp:sync-now with reimport: true and clears the banner', async () => {
      defaultInvoke()
      render(<Connections />)
      emit?.([{ path: '/fake/path.json', cli: 'copilot', scope: 'global' }])
      await waitFor(() => {
        expect(screen.getByText('Adopt them')).toBeDefined()
      })
      fireEvent.click(screen.getByText('Adopt them'))
      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith('mcp:sync-now', { reimport: true })
      })
      await waitFor(() => {
        expect(screen.queryByText('External changes detected')).toBeNull()
      })
    })

    it('overwriting calls mcp:sync-now without a reimport flag and clears the banner', async () => {
      defaultInvoke()
      render(<Connections />)
      emit?.([{ path: '/fake/path.json', cli: 'copilot', scope: 'global' }])
      await waitFor(() => {
        expect(screen.getByText('Overwrite')).toBeDefined()
      })
      fireEvent.click(screen.getByText('Overwrite'))
      await waitFor(() => {
        // The overwrite path invokes mcp:sync-now with no arguments.
        const calls = mockInvoke.mock.calls.filter((c) => c[0] === 'mcp:sync-now')
        expect(calls.some((c) => c.length === 1)).toBe(true)
      })
      await waitFor(() => {
        expect(screen.queryByText('External changes detected')).toBeNull()
      })
    })
  })
})
