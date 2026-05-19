// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import ModelRoutingChip from './ModelRoutingChip'
import type { ClassificationResult } from '../../types/routing'

const mockInvoke = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: vi.fn(() => () => {}) },
    writable: true,
    configurable: true,
  })
})

function classifyResult(over: {
  difficulty?: 'trivial' | 'normal' | 'hard'
  confidence?: number
  reasons?: string[]
  routedModel?: string
  enabled?: boolean
} = {}): { classification: ClassificationResult; routedModel: string; enabled: boolean } {
  return {
    classification: {
      difficulty: over.difficulty ?? 'trivial',
      confidence: over.confidence ?? 0.85,
      reasons: over.reasons ?? ['short prompt'],
    },
    routedModel: over.routedModel ?? 'gpt-5-mini',
    enabled: over.enabled ?? true,
  }
}

async function settle(ms = 300): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
  await act(async () => { await Promise.resolve() })
}

describe('ModelRoutingChip', () => {
  it('renders the routed model after the debounced classify IPC', async () => {
    mockInvoke.mockResolvedValue(classifyResult({ routedModel: 'haiku', difficulty: 'trivial' }))
    render(
      <ModelRoutingChip
        cli="claude-cli"
        userText="What time is it?"
        promptTokens={5}
        userOverride={null}
        onOverride={vi.fn()}
      />,
    )
    await settle()
    expect(mockInvoke).toHaveBeenCalledWith('routing:classify', expect.objectContaining({
      cli: 'claude-cli',
      userText: 'What time is it?',
    }))
    // The chip's main button reports both the routed model and the difficulty.
    expect(screen.getByText(/haiku/)).toBeInTheDocument()
    // Use the tier button to verify the trivial active state (since "trivial" appears in multiple places).
    const trivialBtn = screen.getByRole('button', { name: /force trivial tier/i })
    expect(trivialBtn).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows "routing off" state when the rules are disabled', async () => {
    mockInvoke.mockResolvedValue(classifyResult({ enabled: false }))
    render(
      <ModelRoutingChip cli="copilot-cli" userText="hi" promptTokens={1}
        userOverride={null} onOverride={vi.fn()} />,
    )
    await settle()
    expect(screen.getByText(/Routing off/i)).toBeInTheDocument()
  })

  it('calls onOverride with the resolved tier model when a tier button is clicked', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'routing:classify') return Promise.resolve(classifyResult({
        routedModel: 'gpt-5-mini', difficulty: 'trivial',
      }))
      if (channel === 'routing:resolve-tier') return Promise.resolve({ model: 'claude-opus-4.6' })
      return Promise.resolve(null)
    })
    const onOverride = vi.fn()
    render(
      <ModelRoutingChip
        cli="copilot-cli"
        userText="What time is it?"
        promptTokens={5}
        userOverride={null}
        onOverride={onOverride}
      />,
    )
    await settle()

    // Click the "hard" tier button
    const hardBtn = screen.getByRole('button', { name: /force hard tier/i })
    fireEvent.click(hardBtn)
    await act(async () => { await Promise.resolve() })

    expect(mockInvoke).toHaveBeenCalledWith('routing:resolve-tier', { cli: 'copilot-cli', tier: 'hard' })
    expect(onOverride).toHaveBeenCalledWith('claude-opus-4.6')
  })

  it('clears the override when the chosen tier matches the auto-routed tier', async () => {
    mockInvoke.mockImplementation((channel: string) => {
      if (channel === 'routing:classify') return Promise.resolve(classifyResult({
        routedModel: 'gpt-5-mini', difficulty: 'trivial',
      }))
      if (channel === 'routing:resolve-tier') return Promise.resolve({ model: 'gpt-5-mini' })
      return Promise.resolve(null)
    })
    const onOverride = vi.fn()
    render(
      <ModelRoutingChip
        cli="copilot-cli"
        userText="hi"
        promptTokens={1}
        userOverride="gpt-5-mini"
        onOverride={onOverride}
      />,
    )
    await settle()
    const trivialBtn = screen.getByRole('button', { name: /force trivial tier/i })
    fireEvent.click(trivialBtn)
    await act(async () => { await Promise.resolve() })
    expect(onOverride).toHaveBeenLastCalledWith(null)
  })

  it('shows the reasons popover when the chip is clicked', async () => {
    mockInvoke.mockResolvedValue(classifyResult({
      reasons: ['short prompt (5 tok)', 'no code fences', 'single sentence'],
      difficulty: 'trivial',
    }))
    render(
      <ModelRoutingChip cli="copilot-cli" userText="hi?" promptTokens={2}
        userOverride={null} onOverride={vi.fn()} />,
    )
    await settle()
    // The popover lists reasons — click the main chip button (the one with aria-expanded).
    const expandable = screen.getAllByRole('button').find((b) => b.getAttribute('aria-expanded') === 'false')!
    fireEvent.click(expandable)
    expect(await screen.findByText(/no code fences/i)).toBeInTheDocument()
  })

  it('shows an "override" pill when userOverride differs from the routed model', async () => {
    mockInvoke.mockResolvedValue(classifyResult({ routedModel: 'gpt-5-mini', difficulty: 'trivial' }))
    render(
      <ModelRoutingChip
        cli="copilot-cli" userText="hi" promptTokens={1}
        userOverride="claude-opus-4.6" onOverride={vi.fn()}
      />,
    )
    await settle()
    expect(screen.getByText(/override/i)).toBeInTheDocument()
    // Active model in display should be the override, not the routed model.
    expect(screen.getByText(/claude-opus-4.6/)).toBeInTheDocument()
  })
})
