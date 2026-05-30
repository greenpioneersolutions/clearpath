// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { setupElectronAPI } from '../../../../test/ipc-mock-helper'

// setup-coverage.ts force-loads the renderer source tree before vi.mock
// factories register, so a bare vi.mock() can't reliably intercept the
// reference EfficiencyTab captured for useFlag at module-load time.
// Documented workaround: vi.resetModules() + vi.doMock() + dynamic import
// per test (see ContextMeterPopover.test.tsx which uses the same pattern).
const { flagState } = vi.hoisted(() => ({
  flagState: {} as Record<string, boolean>,
}))

vi.mock('../../contexts/FeatureFlagContext', () => ({
  useFlag: (key: string) => Boolean(flagState[key]),
  useFeatureFlags: () => ({
    flags: flagState,
    activePresetId: null,
    presets: [],
    setFlag: vi.fn(),
    applyPreset: vi.fn(),
    resetFlags: vi.fn(),
    loading: false,
    progressionStage: null,
    sessionCount: 0,
    locked: false,
  }),
}))

let EfficiencyTab: typeof import('./EfficiencyTab').default

beforeEach(async () => {
  for (const k of Object.keys(flagState)) delete flagState[k]
  vi.resetModules()
  vi.doMock('../../contexts/FeatureFlagContext', () => ({
    useFlag: (key: string) => Boolean(flagState[key]),
    useFeatureFlags: () => ({
      flags: flagState,
      activePresetId: null,
      presets: [],
      setFlag: vi.fn(),
      applyPreset: vi.fn(),
      resetFlags: vi.fn(),
      loading: false,
      progressionStage: null,
      sessionCount: 0,
      locked: false,
    }),
  }))
  const mod = await import('./EfficiencyTab')
  EfficiencyTab = mod.default
})

describe('EfficiencyTab', () => {
  it('renders the no-data empty state when fewer than 3 cost records exist', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 0, user: 0, agent: 0, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 0,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText(/Send a few more sessions/i)).toBeInTheDocument()
    })
  })

  it('renders the no-data state when 2 records exist (below threshold)', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 1000, user: 1000, agent: 0, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 2,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText(/Only 2 records/i)).toBeInTheDocument()
    })
  })

  it('renders the where-did-tokens-go section with slice legend when records present', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 2000, agent: 3000, notes: 2500, contextSources: 0, cached: 500, output: 2000,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText(/Where did your tokens go/i)).toBeInTheDocument()
    })
    expect(screen.getByText('User text')).toBeInTheDocument()
    expect(screen.getByText('Agent prompt')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('renders the bloat table when sessions have attachments', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 2000, agent: 3000, notes: 2500, contextSources: 0, cached: 500, output: 2000,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [
        { kind: 'note', id: 'n1', title: 'Big style guide', sessions: 8, totalTokens: 32_000, avgTokens: 4000 },
        { kind: 'agent', id: 'coach', title: 'Coach', sessions: 5, totalTokens: 5000, avgTokens: 1000 },
      ],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText(/Top sources of injected context/i)).toBeInTheDocument()
    })
    expect(screen.getByText('Big style guide')).toBeInTheDocument()
    expect(screen.getByText('Coach')).toBeInTheDocument()
  })

  it('hides routing distribution when showModelRouting is OFF', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 5000, agent: 5000, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText(/Where did your tokens go/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Routing distribution/i)).not.toBeInTheDocument()
  })

  it('shows routing distribution when showModelRouting is ON', async () => {
    flagState.showModelRouting = true
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 5000, agent: 5000, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
      'cost:list': [
        { routedDifficulty: 'trivial', userOverride: false },
        { routedDifficulty: 'trivial', userOverride: false },
        { routedDifficulty: 'normal', userOverride: false },
      ],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText('Routing distribution')).toBeInTheDocument()
    })
  })

  it('renders savings cards ONLY when suggestions array is non-empty', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 5000, agent: 5000, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [
        {
          id: 'cache-1',
          cardId: 'enable-prompt-cache',
          title: 'Enable prompt caching',
          body: 'You spent ~$3.50 on cold-cache agent prompts.',
          estimatedSavingsUsd: 3.15,
          ctaLink: '/configure?tab=advanced',
          ctaLabel: 'Enable in Advanced settings',
        },
      ],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText('Estimated savings')).toBeInTheDocument()
    })
    expect(screen.getByText('Enable prompt caching')).toBeInTheDocument()
    expect(screen.getByTestId('savings-amount')).toHaveTextContent(/\$3\.15/)
  })

  it('does NOT render "Estimated savings" header when there are no suggestions', async () => {
    setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 5000, agent: 5000, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(screen.getByText(/Where did your tokens go/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('Estimated savings')).not.toBeInTheDocument()
  })

  it('passes cachePolicyEnabled + routingEnabled to savings-suggestions handler', async () => {
    flagState.showPromptCache = true
    flagState.showModelRouting = true
    const { mockInvoke } = setupElectronAPI({
      'efficiency:where-did-tokens-go': {
        total: 10_000, user: 5000, agent: 5000, notes: 0, contextSources: 0, cached: 0, output: 0,
        since: 0, recordCount: 5,
      },
      'efficiency:top-context-bloat': [],
      'efficiency:savings-suggestions': [],
    })
    render(<EfficiencyTab />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('efficiency:savings-suggestions', expect.objectContaining({
        cachePolicyEnabled: true,
        routingEnabled: true,
      }))
    })
  })
})
