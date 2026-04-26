import type { IpcMain } from 'electron'
import { EventEmitter } from 'events'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import {
  BUILD_FLAGS,
  EXPERIMENTAL_FLAG_KEYS,
  type FeatureFlags,
} from '../../shared/featureFlags.generated'

// ── Flag-change event bus ────────────────────────────────────────────────────
// Other subsystems (e.g. ClearMemoryService) subscribe here to react when a
// specific flag flips. Payload is `{ key, value, flags }`. Exported so
// src/main/index.ts can wire lifecycle side-effects without importing
// electron-store directly.
export const featureFlagEvents = new EventEmitter()

export interface FlagChangeEvent {
  key: string
  value: boolean
  flags: FeatureFlags
}

export type { FeatureFlags, FeatureFlagKey } from '../../shared/featureFlags.generated'

// Build-time defaults come from features.json via the generated module.
// Runtime overrides (set via the Settings UI) layer on top of these.
const DEFAULTS: FeatureFlags = { ...BUILD_FLAGS }

// ── Presets ──────────────────────────────────────────────────────────────────

export interface FlagPreset {
  id: string
  name: string
  description: string
  flags: Partial<FeatureFlags>
}

const PRESETS: FlagPreset[] = [
  {
    id: 'progressive',
    name: 'Auto-Reveal',
    description: 'Start simple. Features unlock automatically as you complete more sessions. Best for new users.',
    // The renderer applies stage overrides on top of the stored flags when this
    // preset is active, so the stored values here are a sane "starter" baseline.
    flags: {
      showDashboard: true,
      showWork: true,
      showInsights: false,
      showConfigure: true,
      showLearn: true,
      showSetupWizard: true,
      showSettings: true,
      showMemory: true,
      showAgentSelection: false,
      showSkillsManagement: false,
      showSessionWizard: false,
      showWorkspaces: false,
      showTeamHub: false,
      showScheduler: false,
      showComposer: false,
      showSubAgents: false,
      showTemplates: false,
      showKnowledgeBase: false,
      showVoice: false,
      showPolicies: false,
      showIntegrations: false,
      showPlugins: false,
      showEnvVars: false,
      showWebhooks: false,
      showDataManagement: false,
      showCostTracking: false,
    },
  },
  {
    id: 'all-on',
    name: 'Everything On',
    description: 'All features enabled — unlocks every section, tool, and experimental feature.',
    flags: {
      showPolicies: true,
      showIntegrations: true,
      showMemory: true,
      showClearMemory: true,
      showSkillsManagement: true,
      showSessionWizard: true,
      showWorkspaces: true,
      showTeamHub: true,
      showScheduler: true,
      showComposer: true,
      showSubAgents: true,
      showTemplates: true,
      showKnowledgeBase: true,
      showVoice: true,
      showUseContext: true,
      showAgentSelection: true,
      showCostTracking: true,
      showComplianceLogs: true,
      showDataManagement: true,
      showBudgetLimits: true,
      showPlugins: true,
      showEnvVars: true,
      showWebhooks: true,
      enableExperimentalFeatures: true,
      showPrScores: true,
      prScoresAiReview: true,
      showEfficiencyCoach: true,
    },
  },
  {
    id: 'essentials',
    name: 'Essentials Only',
    description: 'Core features — Work, Dashboard, Settings. Great for demos and new users.',
    flags: {
      showInsights: false,
      showLearn: false,
      showPolicies: false,
      showIntegrations: false,
      showWorkspaces: false,
      showTeamHub: false,
      showScheduler: false,
      showComposer: false,
      showSubAgents: false,
      showKnowledgeBase: false,
      showVoice: false,
      showComplianceLogs: false,
      showWebhooks: false,
      showPlugins: false,
      showEnvVars: false,
      showPrScores: false,
    },
  },
  {
    id: 'demo',
    name: 'Demo Mode',
    description: 'Clean view for presentations — Work, Dashboard, Agents, Session Wizard.',
    flags: {
      showInsights: false,
      showLearn: false,
      showPolicies: false,
      showIntegrations: false,
      showWorkspaces: false,
      showTeamHub: false,
      showScheduler: false,
      showComposer: false,
      showSubAgents: false,
      showKnowledgeBase: false,
      showVoice: false,
      showComplianceLogs: false,
      showWebhooks: false,
      showPlugins: false,
      showEnvVars: false,
      showDataManagement: false,
      showBudgetLimits: false,
      showSkillsManagement: false,
      showPrScores: false,
    },
  },
  {
    id: 'manager',
    name: 'Manager View',
    description: 'Non-technical view — Dashboard, Work with wizard, Insights, no dev tools.',
    flags: {
      showPolicies: false,
      showIntegrations: false,
      showWorkspaces: false,
      showScheduler: false,
      showComposer: false,
      showSubAgents: false,
      showKnowledgeBase: false,
      showVoice: false,
      showComplianceLogs: false,
      showPlugins: false,
      showEnvVars: false,
      showWebhooks: false,
      showPrScores: false,
    },
  },
  {
    id: 'efficiency',
    name: 'Efficiency Mode',
    description: 'Cost-conscious defaults — sub-agents, fleet, composer, scheduler off. Focus on single sessions with minimal context.',
    flags: {
      showComposer: false,
      showSubAgents: false,
      showScheduler: false,
      showKnowledgeBase: false,
      showVoice: false,
      showTeamHub: false,
      showWebhooks: false,
      showPlugins: false,
      showEfficiencyCoach: true,
    },
  },
]

// ── Store ────────────────────────────────────────────────────────────────────

interface FlagStoreSchema {
  flags: Partial<FeatureFlags>
  activePresetId: string | null
}

const store = new Store<FlagStoreSchema>({
  name: 'clear-path-feature-flags',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    flags: {},
    activePresetId: 'all-on',
  },
})

// Experimental flags that were compiled OUT of this build (BUILD_FLAGS[key]
// === false) cannot be turned on at runtime — their code path no longer
// exists in the bundle. We clamp stale overrides here so a value left in the
// store from a prior build doesn't silently leave the UI in an inconsistent
// state. Non-experimental flags are unaffected.
function clampToCompiledIn(flags: FeatureFlags): FeatureFlags {
  const out = { ...flags }
  for (const key of EXPERIMENTAL_FLAG_KEYS) {
    if (!BUILD_FLAGS[key] && out[key]) out[key] = false
  }
  return out
}

function resolveFlags(): FeatureFlags {
  const overrides = store.get('flags')
  return clampToCompiledIn({ ...DEFAULTS, ...overrides })
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerFeatureFlagHandlers(ipcMain: IpcMain): void {
  /** Get resolved flags (all defaults + overrides). */
  ipcMain.handle('feature-flags:get', () => ({
    flags: resolveFlags(),
    activePresetId: store.get('activePresetId'),
  }))

  /** Set individual flag overrides. */
  ipcMain.handle('feature-flags:set', (_e, args: Partial<FeatureFlags>) => {
    const previous = resolveFlags()
    const current = store.get('flags')
    // Drop attempts to enable experimental flags whose code is compiled out of
    // this build — the override would be silently clamped on the next read,
    // and saving it would just leak across re-builds.
    const sanitized: Partial<FeatureFlags> = { ...args }
    for (const key of EXPERIMENTAL_FLAG_KEYS) {
      if (!BUILD_FLAGS[key] && sanitized[key]) sanitized[key] = false
    }
    store.set('flags', { ...current, ...sanitized })
    store.set('activePresetId', null) // Custom override = no preset
    const next = resolveFlags()
    emitFlagChanges(previous, next)
    return next
  })

  /** Apply a preset (replaces all overrides). */
  ipcMain.handle('feature-flags:apply-preset', (_e, args: { presetId: string }) => {
    const preset = PRESETS.find((p) => p.id === args.presetId)
    if (!preset) return { error: 'Unknown preset' }
    const previous = resolveFlags()
    store.set('flags', preset.flags)
    store.set('activePresetId', args.presetId)
    const next = resolveFlags()
    emitFlagChanges(previous, next)
    return next
  })

  /** Get available presets. */
  ipcMain.handle('feature-flags:get-presets', () => PRESETS)

  /** Reset to all-on defaults. */
  ipcMain.handle('feature-flags:reset', () => {
    const previous = resolveFlags()
    store.set('flags', {})
    store.set('activePresetId', 'all-on')
    const next = resolveFlags()
    emitFlagChanges(previous, next)
    return next
  })
}

// ── Internals ────────────────────────────────────────────────────────────────

function emitFlagChanges(previous: FeatureFlags, next: FeatureFlags): void {
  for (const key of Object.keys(next) as (keyof FeatureFlags)[]) {
    if (previous[key] !== next[key]) {
      const payload: FlagChangeEvent = {
        key,
        value: next[key],
        flags: next,
      }
      featureFlagEvents.emit('change', payload)
      featureFlagEvents.emit(`change:${key}`, payload)
    }
  }
}

/** Read current flags without going through IPC — for main-process subsystems. */
export function readCurrentFlags(): FeatureFlags {
  return resolveFlags()
}
