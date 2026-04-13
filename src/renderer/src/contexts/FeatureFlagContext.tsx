import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FeatureFlags {
  showHomeHub: boolean

  showDashboard: boolean
  showWork: boolean
  showInsights: boolean
  showConfigure: boolean
  showLearn: boolean

  showSetupWizard: boolean
  showSettings: boolean
  showPolicies: boolean
  showIntegrations: boolean
  showMemory: boolean
  showSkillsManagement: boolean
  showSessionWizard: boolean
  showWorkspaces: boolean
  showTeamHub: boolean
  showScheduler: boolean

  showComposer: boolean
  showSubAgents: boolean
  showTemplates: boolean
  showKnowledgeBase: boolean
  showVoice: boolean

  showUseContext: boolean
  showAgentSelection: boolean
  showCostTracking: boolean
  showComplianceLogs: boolean

  showDataManagement: boolean
  showBudgetLimits: boolean
  showPlugins: boolean
  showEnvVars: boolean
  showWebhooks: boolean

  // Experimental features
  enableExperimentalFeatures: boolean
  showPrScores: boolean
  prScoresAiReview: boolean
  showEfficiencyCoach: boolean
  showBackstageExplorer: boolean
}

interface FlagPreset {
  id: string
  name: string
  description: string
}

interface FlagContextValue {
  flags: FeatureFlags
  activePresetId: string | null
  presets: FlagPreset[]
  setFlag: (key: keyof FeatureFlags, value: boolean) => void
  applyPreset: (presetId: string) => void
  resetFlags: () => void
  loading: boolean
}

// ── Defaults (conservative — plugins off, core nav on) ──────────────────────

const DEFAULTS: FeatureFlags = {
  showHomeHub: true,

  // Core navigation — always on
  showDashboard: true, showWork: true, showInsights: true, showConfigure: true, showLearn: true,

  // Configure sub-sections — essential settings on, plugins off
  showSetupWizard: true, showSettings: true, showPolicies: false, showIntegrations: false,
  showMemory: false, showSkillsManagement: false, showSessionWizard: false, showWorkspaces: false,
  showTeamHub: false, showScheduler: false,

  // Work page features — all off by default
  showComposer: false, showSubAgents: false, showTemplates: false, showKnowledgeBase: false, showVoice: false,

  // Session features — all off by default
  showUseContext: false, showAgentSelection: false, showCostTracking: false, showComplianceLogs: false,

  // Settings features — all off by default
  showDataManagement: false, showBudgetLimits: false, showPlugins: false, showEnvVars: false, showWebhooks: false,

  // Experimental features — all off by default
  enableExperimentalFeatures: false, showPrScores: false, prScoresAiReview: false,
  showEfficiencyCoach: false, showBackstageExplorer: false,
}

// ── Context ──────────────────────────────────────────────────────────────────

const FlagContext = createContext<FlagContextValue>({
  flags: DEFAULTS,
  activePresetId: 'all-on',
  presets: [],
  setFlag: () => {},
  applyPreset: () => {},
  resetFlags: () => {},
  loading: true,
})

export function useFeatureFlags(): FlagContextValue {
  return useContext(FlagContext)
}

export function useFlag(key: keyof FeatureFlags): boolean {
  const { flags } = useContext(FlagContext)
  return flags[key]
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function FeatureFlagProvider({ children }: { children: ReactNode }): JSX.Element {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULTS)
  const [activePresetId, setActivePresetId] = useState<string | null>('all-on')
  const [presets, setPresets] = useState<FlagPreset[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [result, presetList] = await Promise.all([
        window.electronAPI.invoke('feature-flags:get') as Promise<{ flags: FeatureFlags; activePresetId: string | null }>,
        window.electronAPI.invoke('feature-flags:get-presets') as Promise<FlagPreset[]>,
      ])
      setFlags(result.flags)
      setActivePresetId(result.activePresetId)
      setPresets(presetList)
    } catch {
      // Handlers not registered yet — use defaults
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const setFlag = useCallback((key: keyof FeatureFlags, value: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: value }))
    setActivePresetId(null)
    void window.electronAPI.invoke('feature-flags:set', { [key]: value })
  }, [])

  const applyPreset = useCallback((presetId: string) => {
    void (async () => {
      const result = await window.electronAPI.invoke('feature-flags:apply-preset', { presetId }) as FeatureFlags
      setFlags(result)
      setActivePresetId(presetId)
    })()
  }, [])

  const resetFlags = useCallback(() => {
    void (async () => {
      const result = await window.electronAPI.invoke('feature-flags:reset') as FeatureFlags
      setFlags(result)
      setActivePresetId('all-on')
    })()
  }, [])

  return (
    <FlagContext.Provider value={{ flags, activePresetId, presets, setFlag, applyPreset, resetFlags, loading }}>
      {children}
    </FlagContext.Provider>
  )
}
