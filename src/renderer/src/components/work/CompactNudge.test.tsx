// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import CompactNudge from './CompactNudge'

describe('CompactNudge', () => {
  it('renders nothing when below 70% of the context window', () => {
    const { container } = render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={1000} onCompact={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the nudge at exactly 70%', () => {
    // gpt-5-mini context window = 128_000. 70% = 89_600.
    render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={89_600} onCompact={vi.fn()} />
    )
    expect(screen.getByTestId('compact-nudge')).toBeInTheDocument()
    expect(screen.getByText(/70%/)).toBeInTheDocument()
  })

  it('renders at 85% with the appropriate percentage in the message', () => {
    // 85% of 128_000 = 108_800
    render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={108_800} onCompact={vi.fn()} />
    )
    expect(screen.getByText(/85%/)).toBeInTheDocument()
  })

  it('dispatches onCompact when "Compact now" is clicked', () => {
    const onCompact = vi.fn()
    render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={100_000} onCompact={onCompact} />
    )
    fireEvent.click(screen.getByText(/^Compact now/))
    expect(onCompact).toHaveBeenCalledTimes(1)
  })

  it('hides the nudge after dismissal — per-session', () => {
    const { queryByTestId } = render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={100_000} onCompact={vi.fn()} />
    )
    expect(queryByTestId('compact-nudge')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dismiss'))
    expect(queryByTestId('compact-nudge')).not.toBeInTheDocument()
  })

  it('shows the projected savings amount (50% of total tokens, rounded)', () => {
    render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={100_000} onCompact={vi.fn()} />
    )
    // 50% of 100_000 = 50_000
    expect(screen.getByText(/50,000/)).toBeInTheDocument()
  })

  it('uses the routed model context window (not a hardcoded default)', () => {
    // claude-opus-4.6 = 200_000. 70% = 140_000. Below that = no nudge.
    const { container } = render(
      <CompactNudge sessionId="s1" model="claude-opus-4.6" totalTokens={100_000} onCompact={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('mentions the model in the warning text', () => {
    render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={100_000} onCompact={vi.fn()} />
    )
    expect(screen.getByText(/gpt-5-mini/i)).toBeInTheDocument()
  })

  it('does NOT re-nudge after dismissal even on re-render with higher tokens', () => {
    const { rerender, queryByTestId } = render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={100_000} onCompact={vi.fn()} />
    )
    expect(queryByTestId('compact-nudge')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dismiss'))
    rerender(<CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={120_000} onCompact={vi.fn()} />)
    expect(queryByTestId('compact-nudge')).not.toBeInTheDocument()
  })

  it('re-nudges for a different sessionId (different conversation)', () => {
    const { rerender, queryByTestId } = render(
      <CompactNudge sessionId="s1" model="gpt-5-mini" totalTokens={100_000} onCompact={vi.fn()} />
    )
    fireEvent.click(screen.getByText('Dismiss'))
    expect(queryByTestId('compact-nudge')).not.toBeInTheDocument()
    rerender(<CompactNudge sessionId="s2" model="gpt-5-mini" totalTokens={100_000} onCompact={vi.fn()} />)
    expect(queryByTestId('compact-nudge')).toBeInTheDocument()
  })
})
