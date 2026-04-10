// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BudgetAlerts, { ToastContainer } from './BudgetAlerts'
import { DEFAULT_BUDGET } from '../../types/cost'
import type { BudgetConfig } from '../../types/cost'

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
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultSummary = {
  todaySpend: 1.5,
  weekSpend: 10,
  monthSpend: 25,
  todayTokens: 50000,
  weekTokens: 300000,
  monthTokens: 1000000,
}

function setupMocks(budget: Partial<BudgetConfig> = {}, summary = defaultSummary) {
  mockInvoke.mockImplementation((channel: string) => {
    if (channel === 'cost:get-budget') return Promise.resolve({ ...DEFAULT_BUDGET, ...budget })
    if (channel === 'cost:summary') return Promise.resolve(summary)
    if (channel === 'cost:check-budget') return Promise.resolve({ alerts: [], autoPause: false })
    if (channel === 'cost:set-budget') return Promise.resolve()
    return Promise.resolve(null)
  })
}

// ── ToastContainer tests ─────────────────────────────────────────────────────

describe('ToastContainer', () => {
  it('renders nothing when toasts array is empty', () => {
    const { container } = render(<ToastContainer toasts={[]} onDismiss={vi.fn()} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders toast messages', () => {
    const toasts = [
      { id: 1, message: 'Budget warning', type: 'warning' as const },
      { id: 2, message: 'Budget exceeded', type: 'danger' as const },
    ]
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />)
    expect(screen.getByText('Budget warning')).toBeDefined()
    expect(screen.getByText('Budget exceeded')).toBeDefined()
  })

  it('calls onDismiss when Dismiss button clicked', () => {
    const onDismiss = vi.fn()
    const toasts = [{ id: 42, message: 'Alert!', type: 'warning' as const }]
    render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByText('Dismiss'))
    expect(onDismiss).toHaveBeenCalledWith(42)
  })
})

// ── BudgetAlerts tests ───────────────────────────────────────────────────────

describe('BudgetAlerts', () => {
  it('shows loading state initially', () => {
    mockInvoke.mockReturnValue(new Promise(() => {})) // never resolves
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeDefined()
  })

  it('renders budget controls after loading', async () => {
    setupMocks()
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Token Budget Limits')).toBeDefined()
    })
    expect(screen.getByText('Auto-pause at limit')).toBeDefined()
  })

  it('renders monetary mode when displayMode is monetary', async () => {
    setupMocks()
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} displayMode="monetary" />)
    await waitFor(() => {
      expect(screen.getByText('Spending Limits')).toBeDefined()
    })
  })

  it('loads budget and summary data on mount', async () => {
    setupMocks()
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:get-budget')
      expect(mockInvoke).toHaveBeenCalledWith('cost:summary')
    })
  })

  it('saves budget when input changes', async () => {
    setupMocks({ dailyTokenCeiling: 100000 })
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Token Budget Limits')).toBeDefined()
    })

    // Find the first number input (Daily Limit) and change it
    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '200000' } })

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:set-budget', expect.objectContaining({
        dailyTokenCeiling: 200000,
      }))
    })
  })

  it('toggles auto-pause setting', async () => {
    setupMocks()
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Auto-pause at limit')).toBeDefined()
    })

    // The auto-pause toggle button — find the container, then the button inside it
    const autoPauseLabel = screen.getByText('Auto-pause at limit')
    const container = autoPauseLabel.closest('.flex.items-center.justify-between')!
    const toggle = container.querySelector('button')!
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('cost:set-budget', expect.objectContaining({
        autoPauseAtLimit: true,
      }))
    })
  })

  it('calls onAlert when budget check returns alerts', async () => {
    const onAlert = vi.fn()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cost:get-budget') return Promise.resolve(DEFAULT_BUDGET)
      if (channel === 'cost:summary') return Promise.resolve(defaultSummary)
      if (channel === 'cost:check-budget') {
        return Promise.resolve({
          alerts: [{ period: 'daily', pct: 90, spend: 9, ceiling: 10, unit: 'usd' }],
          autoPause: false,
        })
      }
      return Promise.resolve(null)
    })

    render(<BudgetAlerts onAlert={onAlert} onAutoPause={vi.fn()} />)

    await waitFor(() => {
      expect(onAlert).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Daily budget 90% reached'),
        type: 'warning',
      }))
    })
  })

  it('calls onAutoPause when budget is 100% and autoPause is true', async () => {
    const onAutoPause = vi.fn()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cost:get-budget') return Promise.resolve(DEFAULT_BUDGET)
      if (channel === 'cost:summary') return Promise.resolve(defaultSummary)
      if (channel === 'cost:check-budget') {
        return Promise.resolve({
          alerts: [{ period: 'daily', pct: 100, spend: 10, ceiling: 10, unit: 'usd' }],
          autoPause: true,
        })
      }
      return Promise.resolve(null)
    })

    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={onAutoPause} />)

    await waitFor(() => {
      expect(onAutoPause).toHaveBeenCalled()
    })
  })

  it('shows progress bar when ceiling is set', async () => {
    setupMocks({ dailyTokenCeiling: 100000 })
    render(<BudgetAlerts onAlert={vi.fn()} onAutoPause={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Token Budget Limits')).toBeDefined()
    })

    // There should be a progress bar element (div with width style)
    const progressBars = document.querySelectorAll('[style*="width"]')
    expect(progressBars.length).toBeGreaterThan(0)
  })

  it('fires token-based alert messages when unit is tokens', async () => {
    const onAlert = vi.fn()
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'cost:get-budget') return Promise.resolve(DEFAULT_BUDGET)
      if (channel === 'cost:summary') return Promise.resolve(defaultSummary)
      if (channel === 'cost:check-budget') {
        return Promise.resolve({
          alerts: [{ period: 'daily', pct: 75, spend: 75000, ceiling: 100000, unit: 'tokens' }],
          autoPause: false,
        })
      }
      return Promise.resolve(null)
    })

    render(<BudgetAlerts onAlert={onAlert} onAutoPause={vi.fn()} />)

    await waitFor(() => {
      expect(onAlert).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('token budget'),
        type: 'warning',
      }))
    })
  })
})
