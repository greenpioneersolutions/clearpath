// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import ContextMeterChip from './ContextMeterChip'
import type { SliceTokenBreakdown } from '../../../../shared/tokenization/types'

const mockInvoke = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => () => {}) },
    writable: true,
    configurable: true,
  })
})

function fixture(over: Partial<SliceTokenBreakdown> = {}): SliceTokenBreakdown {
  return {
    userPrompt: 100,
    agentPrompt: 50,
    notesFramed: 30,
    contextSources: 20,
    fleetPrefix: 0,
    injectedTotal: 100,
    total: 200,
    ...over,
  }
}

// Helper: wait for the debounce + IPC round-trip to settle. The chip
// debounces 250ms then awaits the invoke result; flushing one tick of
// real timers + a few microtasks is enough.
async function settle(ms = 300): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
  // Flush pending React state updates.
  await act(async () => { await Promise.resolve() })
}

describe('ContextMeterChip', () => {
  it('debounces the tokenizer:count-multi call and renders the result', async () => {
    mockInvoke.mockResolvedValue(fixture({ total: 1247 }))
    render(<ContextMeterChip slices={{ userText: 'hi' }} model="sonnet" />)

    // No call yet — debounce timer hasn't fired.
    expect(mockInvoke).not.toHaveBeenCalled()
    await settle()

    expect(mockInvoke).toHaveBeenCalledWith('tokenizer:count-multi', expect.objectContaining({
      model: 'sonnet',
      slices: { userText: 'hi' },
    }))
    expect(screen.getByText(/1,247 tok/)).toBeInTheDocument()
  })

  it('coalesces rapid prop changes into a single call (debounce)', async () => {
    mockInvoke.mockResolvedValue(fixture())
    const { rerender } = render(<ContextMeterChip slices={{ userText: 'a' }} model="sonnet" />)

    // Type rapidly — each rerender restarts the debounce.
    rerender(<ContextMeterChip slices={{ userText: 'ab' }} model="sonnet" />)
    rerender(<ContextMeterChip slices={{ userText: 'abc' }} model="sonnet" />)
    rerender(<ContextMeterChip slices={{ userText: 'abcd' }} model="sonnet" />)

    await settle()

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    expect(mockInvoke).toHaveBeenCalledWith('tokenizer:count-multi', expect.objectContaining({
      slices: { userText: 'abcd' },
    }))
  })

  it('opens the popover on click and closes on close button', async () => {
    mockInvoke.mockResolvedValue(fixture({ total: 200 }))
    render(<ContextMeterChip slices={{ userText: 'hi' }} model="sonnet" />)
    await settle()

    // Popover not present yet.
    expect(screen.queryByRole('dialog', { name: /context meter/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /context meter/i }))
    expect(screen.getByRole('dialog', { name: /context meter/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close context meter/i }))
    expect(screen.queryByRole('dialog', { name: /context meter/i })).not.toBeInTheDocument()
  })

  it('prefers postLintBreakdown when provided', async () => {
    mockInvoke.mockResolvedValue(fixture({ total: 9999 }))
    render(
      <ContextMeterChip
        slices={{ userText: 'hi' }}
        model="sonnet"
        postLintBreakdown={fixture({ total: 42 })}
      />,
    )

    // The chip adopts the post-lint breakdown synchronously via an effect on
    // the prop, so we just need to flush React state once — no IPC await.
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText(/42 tok/)).toBeInTheDocument()
  })

  it('falls back to default context window for unknown models', async () => {
    mockInvoke.mockResolvedValue(fixture({ total: 100 }))
    render(<ContextMeterChip slices={{ userText: 'hi' }} model="some-unknown-model" />)
    await settle()

    fireEvent.click(screen.getByRole('button', { name: /context meter/i }))
    // Default fallback is 200,000.
    expect(screen.getByText(/200,000/)).toBeInTheDocument()
  })
})
