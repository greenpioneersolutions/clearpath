// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

import PreflightWarning, { parseSeverity } from './PreflightWarning'

describe('parseSeverity', () => {
  it('extracts "warn" prefix', () => {
    expect(parseSeverity('warn: high cost')).toEqual({ severity: 'warn', message: 'high cost' })
  })
  it('extracts "info" prefix', () => {
    expect(parseSeverity('info: routed to haiku')).toEqual({ severity: 'info', message: 'routed to haiku' })
  })
  it('defaults unprefixed notes to info', () => {
    expect(parseSeverity('routed to haiku')).toEqual({ severity: 'info', message: 'routed to haiku' })
  })
  it('strips leading whitespace in the message', () => {
    expect(parseSeverity('warn:    spaced')).toEqual({ severity: 'warn', message: 'spaced' })
  })
})

describe('PreflightWarning component', () => {
  it('renders the message and a dismiss button', () => {
    const onDismiss = vi.fn()
    render(<PreflightWarning note="warn: this prompt would cost ~$0.04" onDismiss={onDismiss} />)
    expect(screen.getByText(/this prompt would cost/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss warning/i })).toBeInTheDocument()
  })

  it('uses amber styling for warn severity', () => {
    const { container } = render(<PreflightWarning note="warn: high cost" onDismiss={vi.fn()} />)
    const banner = container.querySelector('[data-testid="preflight-warning"]')
    expect(banner?.className).toContain('amber')
  })

  it('uses teal styling for info severity', () => {
    const { container } = render(<PreflightWarning note="info: routed to haiku" onDismiss={vi.fn()} />)
    const banner = container.querySelector('[data-testid="preflight-warning"]')
    expect(banner?.className).toContain('teal')
  })

  it('calls onDismiss when "Send anyway" clicked', () => {
    const onDismiss = vi.fn()
    render(<PreflightWarning note="warn: high cost" onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss warning/i }))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders "Compact" CTA when the message mentions context window AND onCompact is provided', () => {
    const onCompact = vi.fn()
    render(
      <PreflightWarning
        note="warn: you're at 75% of opus's context window. Consider /compact or a fresh start."
        onCompact={onCompact}
        onDismiss={vi.fn()}
      />
    )
    const compactBtn = screen.getByRole('button', { name: /^compact$/i })
    expect(compactBtn).toBeInTheDocument()
    fireEvent.click(compactBtn)
    expect(onCompact).toHaveBeenCalledTimes(1)
  })

  it('does NOT render "Compact" when onCompact is missing', () => {
    render(
      <PreflightWarning
        note="warn: you're at 75% of opus's context window. Consider /compact or a fresh start."
        onDismiss={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /^compact$/i })).not.toBeInTheDocument()
  })

  it('renders "Trim" CTA when the message mentions notes', () => {
    const onTrim = vi.fn()
    render(
      <PreflightWarning
        note="warn: notes is 6,000 tok. consider trimming — you can prune this in Notes."
        onTrim={onTrim}
        onDismiss={vi.fn()}
      />
    )
    const trimBtn = screen.getByRole('button', { name: /^trim$/i })
    expect(trimBtn).toBeInTheDocument()
    fireEvent.click(trimBtn)
    expect(onTrim).toHaveBeenCalledTimes(1)
  })

  it('omits both action CTAs on a high-cost warning (no specific actionable target)', () => {
    render(
      <PreflightWarning
        note="warn: this prompt would cost ~$0.06. 60% from agent prompt."
        onCompact={vi.fn()}
        onTrim={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: /^compact$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^trim$/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss warning/i })).toBeInTheDocument()
  })

  it('shows "Trim" for huge context-sources warnings (label includes "context sources is")', () => {
    render(
      <PreflightWarning
        note="warn: context sources is 8,000 tok. consider trimming."
        onTrim={vi.fn()}
        onDismiss={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /^trim$/i })).toBeInTheDocument()
  })
})
