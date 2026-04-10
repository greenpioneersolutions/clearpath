// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CostExport from './CostExport'

// ── Mock electronAPI ─────────────────────────────────────────────────────────

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

  // Mock URL.createObjectURL and revokeObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  global.URL.revokeObjectURL = vi.fn()
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CostExport', () => {
  it('renders export and clear buttons', () => {
    render(<CostExport />)
    expect(screen.getByText('Export CSV')).toBeDefined()
    expect(screen.getByText('Clear History')).toBeDefined()
  })

  it('exports CSV when Export CSV button clicked', async () => {
    mockInvoke.mockResolvedValueOnce('date,cost\n2026-04-01,1.50')

    // Spy on the anchor click without breaking createElement
    const clickSpy = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = origCreateElement(tag, options)
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    })

    render(<CostExport />)
    fireEvent.click(screen.getByText('Export CSV'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:export-csv', { since: 0 })
    })

    await waitFor(() => {
      expect(screen.getByText('CSV exported')).toBeDefined()
    })

    vi.restoreAllMocks()
  })

  it('passes since prop to export', async () => {
    mockInvoke.mockResolvedValueOnce('data')

    const clickSpy = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = origCreateElement(tag, options)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    const sinceTs = 1712000000000
    render(<CostExport since={sinceTs} />)
    fireEvent.click(screen.getByText('Export CSV'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:export-csv', { since: sinceTs })
    })

    vi.restoreAllMocks()
  })

  it('shows Exporting... while in progress', async () => {
    let resolveExport!: (v: string) => void
    mockInvoke.mockReturnValueOnce(new Promise<string>((r) => { resolveExport = r }))

    render(<CostExport />)
    fireEvent.click(screen.getByText('Export CSV'))

    expect(screen.getByText('Exporting...')).toBeDefined()

    // Resolve to finish
    const clickSpy = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = origCreateElement(tag, options)
      if (tag === 'a') el.click = clickSpy
      return el
    })

    resolveExport('csv-data')

    await waitFor(() => {
      expect(screen.getByText('CSV exported')).toBeDefined()
    })

    vi.restoreAllMocks()
  })

  it('clears history after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockInvoke.mockResolvedValueOnce(undefined)

    render(<CostExport />)
    fireEvent.click(screen.getByText('Clear History'))

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:clear')
    })

    await waitFor(() => {
      expect(screen.getByText('History cleared')).toBeDefined()
    })
  })

  it('does not clear history if confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<CostExport />)
    fireEvent.click(screen.getByText('Clear History'))

    expect(mockInvoke).not.toHaveBeenCalledWith('cost:clear')
  })
})
