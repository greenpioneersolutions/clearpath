import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getProgressionStage, getStageFlagOverrides, type ProgressionStage } from '../lib/progressiveDisclosure'
import { BUILD_FLAGS, type FeatureFlags } from '../../../shared/featureFlags.generated'

// Re-export so existing call sites that did `import { FeatureFlags } from
// '../contexts/FeatureFlagContext'` continue to compile. The single source of
// truth for the type is now src/shared/featureFlags.generated.ts.
export type { FeatureFlags } from '../../../shared/featureFlags.generated'

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
  /** Current progression stage when the 'progressive' preset is active. */
  progressionStage: ProgressionStage | null
  /** Number of sessions used to compute the progression stage. */
  sessionCount: number
}

// Defaults come from features.json via the build-time generated module so the
// renderer and main process can never drift out of sync.
const DEFAULTS: FeatureFlags = { ...BUILD_FLAGS }

// ── Context ──────────────────────────────────────────────────────────────────

const FlagContext = createContext<FlagContextValue>({
  flags: DEFAULTS,
  activePresetId: 'all-on',
  presets: [],
  setFlag: () => {},
  applyPreset: () => {},
  resetFlags: () => {},
  loading: true,
  progressionStage: null,
  sessionCount: 0,
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
  const [storedFlags, setStoredFlags] = useState<FeatureFlags>(DEFAULTS)
  const [activePresetId, setActivePresetId] = useState<string | null>('all-on')
  const [presets, setPresets] = useState<FlagPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionCount, setSessionCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const [result, presetList, sessions] = await Promise.all([
        window.electronAPI.invoke('feature-flags:get') as Promise<{ flags: FeatureFlags; activePresetId: string | null }>,
        window.electronAPI.invoke('feature-flags:get-presets') as Promise<FlagPreset[]>,
        Promise.resolve(window.electronAPI.invoke('cli:get-persisted-sessions')).catch(() => []) as Promise<unknown[]>,
      ])
      setStoredFlags(result.flags)
      setActivePresetId(result.activePresetId)
      setPresets(presetList)
      setSessionCount(Array.isArray(sessions) ? sessions.length : 0)
    } catch {
      // Handlers not registered yet — use defaults
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const setFlag = useCallback((key: keyof FeatureFlags, value: boolean) => {
    setStoredFlags((prev) => ({ ...prev, [key]: value }))
    setActivePresetId(null)
    void window.electronAPI.invoke('feature-flags:set', { [key]: value })
  }, [])

  const applyPreset = useCallback((presetId: string) => {
    void (async () => {
      const result = await window.electronAPI.invoke('feature-flags:apply-preset', { presetId }) as FeatureFlags
      setStoredFlags(result)
      setActivePresetId(presetId)
    })()
  }, [])

  const resetFlags = useCallback(() => {
    void (async () => {
      const result = await window.electronAPI.invoke('feature-flags:reset') as FeatureFlags
      setStoredFlags(result)
      setActivePresetId('all-on')
    })()
  }, [])

  // Progressive disclosure: when 'progressive' preset is active, derive flags from session count.
  // Otherwise stored flags are used as-is.
  const progressionStage = activePresetId === 'progressive' ? getProgressionStage(sessionCount) : null
  const flags = progressionStage
    ? { ...storedFlags, ...getStageFlagOverrides(progressionStage) }
    : storedFlags

  return (
    <FlagContext.Provider value={{ flags, activePresetId, presets, setFlag, applyPreset, resetFlags, loading, progressionStage, sessionCount }}>
      {children}
    </FlagContext.Provider>
  )
}
