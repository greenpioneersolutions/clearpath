import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

// ── Types ────────────────────────────────────────────────────────────────────

interface FeatureUsage {
  basicPrompts: boolean
  slashCommands: boolean
  sessionResume: boolean
  agentToggle: boolean
  customAgent: boolean
  permissionConfig: boolean
  mcpServer: boolean
  subAgentDelegate: boolean
  fleetCoordination: boolean
  templateUse: boolean
  budgetConfig: boolean
  configProfile: boolean
}

type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert'

interface SetupWizardState {
  cliInstalled: boolean
  authenticated: boolean
  agentCreated: boolean
  skillCreated: boolean
  memoryCreated: boolean
  triedWizard: boolean
  completedAt: number | null
}

interface OnboardingStoreSchema {
  completedOnboarding: boolean
  trainingModeEnabled: boolean
  featureUsage: FeatureUsage
  guidedTasksCompleted: string[]
  setupWizard: SetupWizardState
}

const DEFAULT_USAGE: FeatureUsage = {
  basicPrompts: false, slashCommands: false, sessionResume: false,
  agentToggle: false, customAgent: false, permissionConfig: false,
  mcpServer: false, subAgentDelegate: false, fleetCoordination: false,
  templateUse: false, budgetConfig: false, configProfile: false,
}

const DEFAULT_SETUP: SetupWizardState = {
  cliInstalled: false,
  authenticated: false,
  agentCreated: false,
  skillCreated: false,
  memoryCreated: false,
  triedWizard: false,
  completedAt: null,
}

const store = new Store<OnboardingStoreSchema>({
  name: 'clear-path-onboarding',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    completedOnboarding: false,
    trainingModeEnabled: false,
    featureUsage: DEFAULT_USAGE,
    guidedTasksCompleted: [],
    setupWizard: DEFAULT_SETUP,
  },
})

function calculateLevel(usage: FeatureUsage): { level: SkillLevel; progress: number; total: number } {
  const features = Object.values(usage)
  const completed = features.filter(Boolean).length
  const total = features.length
  let level: SkillLevel = 'beginner'
  if (completed >= 9) level = 'expert'
  else if (completed >= 6) level = 'advanced'
  else if (completed >= 3) level = 'intermediate'
  return { level, progress: completed, total }
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerOnboardingHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('onboarding:get-state', () => ({
    completedOnboarding: store.get('completedOnboarding'),
    trainingModeEnabled: store.get('trainingModeEnabled'),
    featureUsage: store.get('featureUsage'),
    guidedTasksCompleted: store.get('guidedTasksCompleted'),
    ...calculateLevel(store.get('featureUsage')),
  }))

  ipcMain.handle('onboarding:complete', () => {
    store.set('completedOnboarding', true)
    return { success: true }
  })

  ipcMain.handle('onboarding:set-training-mode', (_e, args: { enabled: boolean }) => {
    store.set('trainingModeEnabled', args.enabled)
    return { enabled: args.enabled }
  })

  ipcMain.handle('onboarding:record-feature', (_e, args: { feature: keyof FeatureUsage }) => {
    const usage = store.get('featureUsage')
    usage[args.feature] = true
    store.set('featureUsage', usage)
    return { usage, ...calculateLevel(usage) }
  })

  ipcMain.handle('onboarding:complete-guided-task', (_e, args: { taskId: string }) => {
    const completed = store.get('guidedTasksCompleted')
    if (!completed.includes(args.taskId)) {
      completed.push(args.taskId)
      store.set('guidedTasksCompleted', completed)
    }
    return { completed }
  })

  ipcMain.handle('onboarding:reset', () => {
    store.set('completedOnboarding', false)
    store.set('trainingModeEnabled', false)
    store.set('featureUsage', DEFAULT_USAGE)
    store.set('guidedTasksCompleted', [])
    store.set('setupWizard', DEFAULT_SETUP)
    return { success: true }
  })

  // ── Setup wizard state ──────────────────────────────────────────────────────

  ipcMain.handle('setup-wizard:get-state', () => store.get('setupWizard'))

  ipcMain.handle('setup-wizard:update-step', (_e, args: Partial<SetupWizardState>) => {
    const current = store.get('setupWizard')
    const updated = { ...current, ...args }
    // Auto-calculate completedAt
    if (updated.cliInstalled && updated.authenticated && updated.agentCreated &&
        updated.skillCreated && updated.memoryCreated && updated.triedWizard && !updated.completedAt) {
      updated.completedAt = Date.now()
    }
    store.set('setupWizard', updated)
    return updated
  })

  ipcMain.handle('setup-wizard:is-complete', () => {
    const state = store.get('setupWizard')
    return { complete: state.completedAt !== null, state }
  })
}
