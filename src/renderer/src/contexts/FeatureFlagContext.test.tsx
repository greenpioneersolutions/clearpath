// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { FeatureFlagProvider, useFeatureFlags, useFlag } from './FeatureFlagContext'
import type { ReactNode } from 'react'

// ── Mock electronAPI ─────────────────────────────────────────────────────────

const mockInvoke = vi.fn()
const mockOn = vi.fn()

beforeEach(() => {
  mockInvoke.mockReset()
  mockOn.mockReset()
  Object.defineProperty(window, 'electronAPI', {
    value: { invoke: mockInvoke, on: mockOn },
    writable: true,
    configurable: true,
  })
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <FeatureFlagProvider>{children}</FeatureFlagProvider>
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useFeatureFlags (default context)', () => {
  it('returns defaults when used outside provider', () => {
    const { result } = renderHook(() => useFeatureFlags())

    expect(result.current.flags.showDashboard).toBe(true)
    expect(result.current.flags.showWork).toBe(true)
    expect(result.current.activePresetId).toBe('all-on')
    expect(result.current.loading).toBe(true)
    expect(typeof result.current.setFlag).toBe('function')
    expect(typeof result.current.applyPreset).toBe('function')
    expect(typeof result.current.resetFlags).toBe('function')
  })
})

describe('useFlag (default context)', () => {
  it('returns specific flag value', () => {
    const { result } = renderHook(() => useFlag('showWork'))
    expect(result.current).toBe(true)
  })

  it('returns false for flags that default to false', () => {
    const { result } = renderHook(() => useFlag('enableExperimentalFeatures'))
    expect(result.current).toBe(false)
  })
})

describe('FeatureFlagProvider', () => {
  it('renders children', () => {
    mockInvoke.mockRejectedValue(new Error('not ready'))

    render(
      <FeatureFlagProvider>
        <div data-testid="child">Content</div>
      </FeatureFlagProvider>,
    )
    expect(screen.getByTestId('child')).toBeDefined()
  })

  it('loads flags and presets on mount', async () => {
    const flags = {
      showHomeHub: true, showDashboard: false, showWork: true, showInsights: true,
      showConfigure: true, showLearn: true, showSetupWizard: true, showSettings: true,
      showPolicies: true, showIntegrations: true, showMemory: true, showSkillsManagement: true,
      showSessionWizard: true, showWorkspaces: true, showTeamHub: true, showScheduler: false,
      showComposer: false, showSubAgents: false, showTemplates: true, showKnowledgeBase: false,
      showVoice: false, showUseContext: true, showAgentSelection: true, showCostTracking: true,
      showComplianceLogs: false, showDataManagement: true, showBudgetLimits: true,
      showPlugins: false, showEnvVars: false, showWebhooks: false,
      enableExperimentalFeatures: false, showPrScores: false, prScoresAiReview: false,
    }
    const presets = [{ id: 'minimal', name: 'Minimal', description: 'Minimal set' }]

    mockInvoke
      .mockResolvedValueOnce({ flags, activePresetId: 'minimal' }) // feature-flags:get
      .mockResolvedValueOnce(presets) // feature-flags:get-presets

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.flags.showDashboard).toBe(false)
    expect(result.current.activePresetId).toBe('minimal')
    expect(result.current.presets).toEqual(presets)
  })

  it('setFlag updates local state and calls IPC', async () => {
    mockInvoke
      .mockResolvedValueOnce({ flags: { showDashboard: true }, activePresetId: 'all-on' })
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    act(() => {
      result.current.setFlag('showDashboard', false)
    })

    expect(result.current.flags.showDashboard).toBe(false)
    expect(result.current.activePresetId).toBe(null) // custom, not a preset
    expect(mockInvoke).toHaveBeenCalledWith('feature-flags:set', { showDashboard: false })
  })

  it('applyPreset calls IPC and updates flags', async () => {
    mockInvoke
      .mockResolvedValueOnce({ flags: { showDashboard: true }, activePresetId: 'all-on' })
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const newFlags = { showDashboard: false }
    mockInvoke.mockResolvedValueOnce(newFlags)

    await act(async () => {
      result.current.applyPreset('minimal')
    })

    expect(mockInvoke).toHaveBeenCalledWith('feature-flags:apply-preset', { presetId: 'minimal' })
    expect(result.current.activePresetId).toBe('minimal')
  })

  it('resetFlags calls IPC and restores defaults', async () => {
    mockInvoke
      .mockResolvedValueOnce({ flags: { showDashboard: false }, activePresetId: 'custom' })
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const resetResult = { showDashboard: true }
    mockInvoke.mockResolvedValueOnce(resetResult)

    await act(async () => {
      result.current.resetFlags()
    })

    expect(mockInvoke).toHaveBeenCalledWith('feature-flags:reset')
    expect(result.current.activePresetId).toBe('all-on')
  })

  it('handles load failure gracefully', async () => {
    mockInvoke.mockRejectedValue(new Error('IPC not ready'))

    const { result } = renderHook(() => useFeatureFlags(), { wrapper })

    await vi.waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Should still have default flags
    expect(result.current.flags.showWork).toBe(true)
  })
})
