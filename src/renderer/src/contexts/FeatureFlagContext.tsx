import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { getProgressionStage, getStageFlagOverrides, type ProgressionStage } from '../lib/progressiveDisclosure'
import { BUILD_FLAGS, BUILD_FLAGS_LOCKED, type FeatureFlags } from '../../../shared/featureFlags.generated'

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
  /**
   * True when the build was produced with CLEARPATH_FLAGS_LOCKED=1.
   * In that mode the runtime ignores stored overrides and the Settings →
   * Feature Flags page renders read-only with off-by-default flags hidden.
   */
  locked: boolean
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
  locked: BUILD_FLAGS_LOCKED,
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
  const [activePresetId, setActivePresetId] = useState<string | null>(BUILD_FLAGS_LOCKED ? null : 'all-on')
  const [presets, setPresets] = useState<FlagPreset[]>([])
  // Locked builds need no async load — BUILD_FLAGS is the single source of
  // truth and there are no overrides or presets to fetch.
  const [loading, setLoading] = useState(!BUILD_FLAGS_LOCKED)
  const [sessionCount, setSessionCount] = useState(0)

  const load = useCallback(async () => {
    if (BUILD_FLAGS_LOCKED) return
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
    if (BUILD_FLAGS_LOCKED) return // Locked: setter is inert
    setStoredFlags((prev) => ({ ...prev, [key]: value }))
    setActivePresetId(null)
    void window.electronAPI.invoke('feature-flags:set', { [key]: value })
  }, [])

  const applyPreset = useCallback((presetId: string) => {
    if (BUILD_FLAGS_LOCKED) return
    void (async () => {
      const result = await window.electronAPI.invoke('feature-flags:apply-preset', { presetId }) as FeatureFlags
      setStoredFlags(result)
      setActivePresetId(presetId)
    })()
  }, [])

  const resetFlags = useCallback(() => {
    if (BUILD_FLAGS_LOCKED) return
    void (async () => {
      const result = await window.electronAPI.invoke('feature-flags:reset') as FeatureFlags
      setStoredFlags(result)
      setActivePresetId('all-on')
    })()
  }, [])

  // Progressive disclosure: when 'progressive' preset is active, derive flags from session count.
  // Otherwise stored flags are used as-is. Locked builds bypass both.
  const progressionStage =
    !BUILD_FLAGS_LOCKED && activePresetId === 'progressive'
      ? getProgressionStage(sessionCount)
      : null
  const flags = progressionStage
    ? { ...storedFlags, ...getStageFlagOverrides(progressionStage) }
    : storedFlags

  return (
    <FlagContext.Provider value={{ flags, activePresetId, presets, setFlag, applyPreset, resetFlags, loading, progressionStage, sessionCount, locked: BUILD_FLAGS_LOCKED }}>
      {children}
    </FlagContext.Provider>
  )
}
