// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { SliceTokenBreakdown } from '../../../../shared/tokenization/types'

// We can't reliably vi.mock('../../contexts/FeatureFlagContext') here because
// setup-coverage.ts force-loads the renderer source tree before vi.mock
// factories register — same harness limitation that's documented in agent
// memory under feedback_test_mocking_pattern. Workaround: use vi.resetModules
// + dynamic import per-test so the popover's `import { useFlag }` sees a
// freshly-mocked module on each render.

// Hoisted state visible to the factory and the test body. Mutating
// `flagState` BEFORE the dynamic import below makes the factory return the
// updated value, because the factory closes over the variable, not over a
// snapshot of its initial value.
const { flagState } = vi.hoisted(() => ({ flagState: { showPromptCache: false } }))

vi.mock('../../contexts/FeatureFlagContext', () => ({
  useFlag: (key: string) => Boolean((flagState as Record<string, boolean>)[key]),
}))

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

// Re-import the popover for each test so the vi.mock above takes effect even
// under the eager-load harness. We bind it to a local variable rather than a
// top-level import so the mock factory always wins.
let ContextMeterPopover: typeof import('./ContextMeterPopover').default

beforeEach(async () => {
  flagState.showPromptCache = false
  vi.resetModules()
  vi.doMock('../../contexts/FeatureFlagContext', () => ({
    useFlag: (key: string) => Boolean((flagState as Record<string, boolean>)[key]),
  }))
  const mod = await import('./ContextMeterPopover')
  ContextMeterPopover = mod.default
})

describe('ContextMeterPopover', () => {
  it('renders without cache badge when showPromptCache flag is OFF', () => {
    flagState.showPromptCache = false
    render(
      <ContextMeterPopover
        breakdown={fixture({ cachedInputTokens: 1234 })}
        contextWindow={200000}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/^cached$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reused from prompt cache/i)).not.toBeInTheDocument()
  })

  it('renders without cache badge when cachedInputTokens is 0', () => {
    flagState.showPromptCache = true
    render(
      <ContextMeterPopover
        breakdown={fixture({ cachedInputTokens: 0 })}
        contextWindow={200000}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/^cached$/i)).not.toBeInTheDocument()
  })

  it('renders without cache badge when cachedInputTokens is undefined (CLI passthrough)', () => {
    flagState.showPromptCache = true
    // No cachedInputTokens at all — simulates a CLI passthrough turn.
    render(
      <ContextMeterPopover
        breakdown={fixture()}
        contextWindow={200000}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/^cached$/i)).not.toBeInTheDocument()
  })

  it('renders cache badge on agent + notes slices when flag is ON and cachedInputTokens > 0', () => {
    flagState.showPromptCache = true
    render(
      <ContextMeterPopover
        breakdown={fixture({ cachedInputTokens: 800 })}
        contextWindow={200000}
        onClose={() => {}}
      />,
    )

    const badges = screen.getAllByText(/^cached$/i)
    expect(badges.length).toBe(2)
  })

  it('shows the "tokens reused" footer with the real cache count', () => {
    flagState.showPromptCache = true
    render(
      <ContextMeterPopover
        breakdown={fixture({ cachedInputTokens: 1234 })}
        contextWindow={200000}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/1,234 tokens reused from prompt cache/i)).toBeInTheDocument()
    expect(screen.getByText(/90% discount/i)).toBeInTheDocument()
  })

  it('does NOT put the cached badge on userPrompt or contextSources slices', () => {
    flagState.showPromptCache = true
    render(
      <ContextMeterPopover
        breakdown={fixture({ cachedInputTokens: 500, contextSources: 25, userPrompt: 75 })}
        contextWindow={200000}
        onClose={() => {}}
      />,
    )

    // The cached badges that DO show up should be exactly 2 (agent + notes).
    const badges = screen.getAllByText(/^cached$/i)
    expect(badges.length).toBe(2)

    // And neither the "Your message" row nor the "Sources" row should contain
    // one — assert by walking up from the label text and looking for a sibling
    // badge with the cached aria-label.
    const userRow = screen.getByText(/Your message/i).closest('div')
    expect(userRow).not.toBeNull()
    expect(userRow!.querySelector('[aria-label="Cached — reused from previous turn"]')).toBeNull()

    const sourcesRow = screen.getByText(/^Sources$/i).closest('div')
    expect(sourcesRow).not.toBeNull()
    expect(sourcesRow!.querySelector('[aria-label="Cached — reused from previous turn"]')).toBeNull()
  })

  it('renders the close button and calls onClose when clicked', () => {
    flagState.showPromptCache = false
    const onClose = vi.fn()
    render(
      <ContextMeterPopover
        breakdown={fixture()}
        contextWindow={200000}
        onClose={onClose}
      />,
    )
    const close = screen.getByRole('button', { name: /close context meter/i })
    close.click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
