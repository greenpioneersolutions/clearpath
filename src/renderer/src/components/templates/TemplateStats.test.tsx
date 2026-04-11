// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TemplateStats from './TemplateStats'

const mockInvoke = vi.fn()
const mockOn = vi.fn(() => vi.fn())

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn, off: vi.fn() },
    writable: true,
  })
  mockInvoke.mockReset()
  mockOn.mockReset().mockReturnValue(vi.fn())
})

describe('TemplateStats', () => {
  const mockStats = [
    {
      templateId: 't1', name: 'Bug Fix', category: 'Bug Fix',
      usageCount: 10, avgCost: 0.0125, totalCost: 0.125,
      lastUsedAt: Date.now() - 86400000,
    },
    {
      templateId: 't2', name: 'Code Review', category: 'Code Review',
      usageCount: 5, avgCost: 0.008, totalCost: 0.04,
      lastUsedAt: undefined,
    },
  ]

  it('shows loading state', () => {
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<TemplateStats />)
    expect(screen.getByText('Loading stats...')).toBeInTheDocument()
  })

  it('shows empty state when no stats', async () => {
    mockInvoke.mockResolvedValue([])
    render(<TemplateStats />)
    await waitFor(() => {
      expect(screen.getByText('No usage data yet')).toBeInTheDocument()
      expect(screen.getByText('Use some templates to see stats here')).toBeInTheDocument()
    })
  })

  it('renders stats table with heading', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      expect(screen.getByText('Template Usage Stats')).toBeInTheDocument()
    })
  })

  it('renders table headers', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      expect(screen.getByText('Template')).toBeInTheDocument()
      expect(screen.getByText('Category')).toBeInTheDocument()
      expect(screen.getByText('Uses')).toBeInTheDocument()
      expect(screen.getByText('Avg Cost')).toBeInTheDocument()
      expect(screen.getByText('Total Cost')).toBeInTheDocument()
      expect(screen.getByText('Last Used')).toBeInTheDocument()
    })
  })

  it('renders stat rows with template names', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      // "Bug Fix" and "Code Review" appear in both name (td) and category (span) columns
      const bugFixEls = screen.getAllByText('Bug Fix')
      expect(bugFixEls.length).toBeGreaterThanOrEqual(2)
      const codeReviewEls = screen.getAllByText('Code Review')
      expect(codeReviewEls.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('renders usage counts', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })
  })

  it('formats costs with dollar signs', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      expect(screen.getByText('$0.0125')).toBeInTheDocument()
      expect(screen.getByText('$0.1250')).toBeInTheDocument()
    })
  })

  it('shows dash for templates without last used date', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      // The second template has no lastUsedAt so should show dash
      const cells = screen.getAllByText(/—/)
      expect(cells.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows formatted date for last used', async () => {
    mockInvoke.mockResolvedValue(mockStats)
    render(<TemplateStats />)
    await waitFor(() => {
      // The first template has a lastUsedAt, so it should render a date
      const dateCell = screen.getByText(new Date(mockStats[0].lastUsedAt!).toLocaleDateString())
      expect(dateCell).toBeInTheDocument()
    })
  })

  it('calls templates:usage-stats on mount', async () => {
    mockInvoke.mockResolvedValue([])
    render(<TemplateStats />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('templates:usage-stats')
    })
  })
})
