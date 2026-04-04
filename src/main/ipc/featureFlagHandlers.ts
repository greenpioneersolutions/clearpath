import type { IpcMain } from 'electron'
import Store from 'electron-store'

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
}

const ALL_ON: FeatureFlags = {
  showHomeHub: true,

  showDashboard: true,
  showWork: true,
  showInsights: true,
  showConfigure: true,
  showLearn: true,

  showSetupWizard: true,
  showSettings: true,
  showPolicies: true,
  showIntegrations: true,
  showMemory: true,
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
    id: 'all-on',
    name: 'Everything On',
    description: 'All features enabled (default)',
    flags: {},
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
  defaults: {
    flags: {},
    activePresetId: 'all-on',
  },
})

function resolveFlags(): FeatureFlags {
  const overrides = store.get('flags')
  return { ...ALL_ON, ...overrides }
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
    const current = store.get('flags')
    store.set('flags', { ...current, ...args })
    store.set('activePresetId', null) // Custom override = no preset
    return resolveFlags()
  })

  /** Apply a preset (replaces all overrides). */
  ipcMain.handle('feature-flags:apply-preset', (_e, args: { presetId: string }) => {
    const preset = PRESETS.find((p) => p.id === args.presetId)
    if (!preset) return { error: 'Unknown preset' }
    store.set('flags', preset.flags)
    store.set('activePresetId', args.presetId)
    return resolveFlags()
  })

  /** Get available presets. */
  ipcMain.handle('feature-flags:get-presets', () => PRESETS)

  /** Reset to all-on defaults. */
  ipcMain.handle('feature-flags:reset', () => {
    store.set('flags', {})
    store.set('activePresetId', 'all-on')
    return resolveFlags()
  })
}
