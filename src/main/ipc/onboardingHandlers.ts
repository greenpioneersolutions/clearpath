import type { IpcMain } from 'electron'
import Store from 'electron-store'

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

interface OnboardingStoreSchema {
  completedOnboarding: boolean
  trainingModeEnabled: boolean
  featureUsage: FeatureUsage
  guidedTasksCompleted: string[]
}

const DEFAULT_USAGE: FeatureUsage = {
  basicPrompts: false, slashCommands: false, sessionResume: false,
  agentToggle: false, customAgent: false, permissionConfig: false,
  mcpServer: false, subAgentDelegate: false, fleetCoordination: false,
  templateUse: false, budgetConfig: false, configProfile: false,
}

const store = new Store<OnboardingStoreSchema>({
  name: 'clear-path-onboarding',
  defaults: {
    completedOnboarding: false,
    trainingModeEnabled: false,
    featureUsage: DEFAULT_USAGE,
    guidedTasksCompleted: [],
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
    return { success: true }
  })
}
