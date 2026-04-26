import type { IpcMain } from 'electron'
import { EventEmitter } from 'events'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

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

// ── Feature flag definitions ─────────────────────────────────────────────────

export interface FeatureFlags {
  // Home page mode
  showHomeHub: boolean     // true = simple hub (default), false = widget dashboard

  // Navigation / top-level sections
  showDashboard: boolean
  showWork: boolean
  showInsights: boolean
  showConfigure: boolean
  showLearn: boolean

  // Configure sub-sections
  showSetupWizard: boolean
  showSettings: boolean
  showPolicies: boolean
  showIntegrations: boolean
  showMemory: boolean
  showClearMemory: boolean
  showSkillsManagement: boolean
  showSessionWizard: boolean
  showWorkspaces: boolean
  showTeamHub: boolean
  showScheduler: boolean

  // Work page features
  showComposer: boolean
  showSubAgents: boolean
  showTemplates: boolean
  showKnowledgeBase: boolean
  showVoice: boolean

  // Session features
  showUseContext: boolean
  showAgentSelection: boolean
  showCostTracking: boolean
  showComplianceLogs: boolean

  // Settings features
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

  // Backend adapters — phased-rollout gates for SDK support.
  // Default to `true` now that phase 2/3 adapters are in place; phase 5 cleanup
  // removes these flags entirely.
  enableClaudeSdk: boolean
  enableCopilotSdk: boolean
}

const DEFAULTS: FeatureFlags = {
  showHomeHub: true,

  // Core navigation — always on by default
  showDashboard: true,
  showWork: true,
  showInsights: true,
  showConfigure: true,
  showLearn: true,

  // Configure sub-sections — essential settings on, plugins off
  showSetupWizard: true,
  showSettings: true,
  showPolicies: false,
  showIntegrations: false,
  showMemory: false,
  showClearMemory: false,
  showSkillsManagement: false,
  showSessionWizard: false,
  showWorkspaces: false,
  showTeamHub: false,
  showScheduler: false,

  // Work page features — all off by default
  showComposer: false,
  showSubAgents: false,
  showTemplates: false,
  showKnowledgeBase: false,
  showVoice: false,

  // Session features — all off by default
  showUseContext: false,
  showAgentSelection: false,
  showCostTracking: false,
  showComplianceLogs: false,

  // Settings features — all off by default
  showDataManagement: false,
  showBudgetLimits: false,
  showPlugins: false,
  showEnvVars: false,
  showWebhooks: false,

  // Experimental features — all off by default
  enableExperimentalFeatures: false,
  showPrScores: false,
  prScoresAiReview: false,
  showEfficiencyCoach: false,

  // SDK adapters — on by default during phase 2/3 rollout. Can be flipped off
  // in settings if the SDK misbehaves for a user's environment.
  enableClaudeSdk: true,
  enableCopilotSdk: true,
}

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

function resolveFlags(): FeatureFlags {
  const overrides = store.get('flags')
  return { ...DEFAULTS, ...overrides }
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
    store.set('flags', { ...current, ...args })
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
