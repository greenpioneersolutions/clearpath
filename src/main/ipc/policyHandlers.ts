import type { IpcMain } from 'electron'
import { dialog } from 'electron'
import Store from 'electron-store'
import { readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import type { NotificationManager } from '../notifications/NotificationManager'

interface PolicyRules {
  maxBudgetPerSession: number | null
  maxBudgetPerDay: number | null
  blockedTools: string[]
  blockedFilePatterns: string[]
  requiredPermissionMode: string | null
  allowedModels: string[]
  maxConcurrentAgents: number | null
  maxTurnsPerSession: number | null
}

interface PolicyPreset {
  id: string
  name: string
  description: string
  rules: PolicyRules
  isBuiltin: boolean
  createdAt: number
}

interface PolicyViolation {
  id: string
  timestamp: number
  action: string
  rule: string
  details: string
  presetName: string
}

interface PolicyStoreSchema {
  activePresetId: string
  presets: PolicyPreset[]
  violations: PolicyViolation[]
}

const DEFAULT_RULES: PolicyRules = {
  maxBudgetPerSession: null, maxBudgetPerDay: null,
  blockedTools: [], blockedFilePatterns: [],
  requiredPermissionMode: null, allowedModels: [],
  maxConcurrentAgents: null, maxTurnsPerSession: null,
}

const BUILTIN_PRESETS: PolicyPreset[] = [
  {
    id: 'policy-cautious', name: 'Cautious', isBuiltin: true, createdAt: 0,
    description: 'No auto-approve, $2/session budget, shell tools blocked',
    rules: {
      ...DEFAULT_RULES,
      maxBudgetPerSession: 2, maxBudgetPerDay: 20,
      blockedTools: ['shell(rm:*)', 'shell(sudo:*)', 'shell(chmod:*)'],
      requiredPermissionMode: 'default', maxConcurrentAgents: 2,
    },
  },
  {
    id: 'policy-standard', name: 'Standard', isBuiltin: true, createdAt: 0,
    description: 'Accept edits mode, $10/session budget, common tools allowed',
    rules: {
      ...DEFAULT_RULES,
      maxBudgetPerSession: 10, maxBudgetPerDay: 50,
      blockedTools: ['shell(sudo:*)', 'shell(rm -rf:*)'],
      requiredPermissionMode: 'acceptEdits', maxConcurrentAgents: 5,
    },
  },
  {
    id: 'policy-unrestricted', name: 'Unrestricted', isBuiltin: true, createdAt: 0,
    description: 'No limits or restrictions',
    rules: DEFAULT_RULES,
  },
]

const store = new Store<PolicyStoreSchema>({
  name: 'clear-path-policy',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    activePresetId: 'policy-standard',
    presets: [],
    violations: [],
  },
})

function getAllPresets(): PolicyPreset[] {
  const user = store.get('presets')
  const userIds = new Set(user.map((p) => p.id))
  return [...BUILTIN_PRESETS.filter((p) => !userIds.has(p.id)), ...user]
}

function getActiveRules(): { rules: PolicyRules; presetName: string } {
  const presets = getAllPresets()
  const activeId = store.get('activePresetId')
  const preset = presets.find((p) => p.id === activeId) ?? BUILTIN_PRESETS[1]
  return { rules: preset.rules, presetName: preset.name }
}

export function registerPolicyHandlers(ipcMain: IpcMain, notificationManager?: NotificationManager): void {
  ipcMain.handle('policy:get-active', () => {
    const { rules, presetName } = getActiveRules()
    return { activePresetId: store.get('activePresetId'), rules, presetName }
  })

  ipcMain.handle('policy:list-presets', () => getAllPresets())

  ipcMain.handle('policy:set-active', (_e, args: { id: string }) => {
    store.set('activePresetId', args.id)
    return getActiveRules()
  })

  ipcMain.handle('policy:save-preset', (_e, args: { name: string; description?: string; rules: PolicyRules; id?: string }) => {
    const presets = store.get('presets')
    const preset: PolicyPreset = {
      id: args.id ?? randomUUID(), name: args.name,
      description: args.description ?? '', rules: args.rules,
      isBuiltin: false, createdAt: Date.now(),
    }
    const idx = presets.findIndex((p) => p.id === preset.id)
    if (idx >= 0) presets[idx] = preset
    else presets.push(preset)
    store.set('presets', presets)
    return preset
  })

  ipcMain.handle('policy:delete-preset', (_e, args: { id: string }) => {
    store.set('presets', store.get('presets').filter((p) => p.id !== args.id))
    if (store.get('activePresetId') === args.id) store.set('activePresetId', 'policy-standard')
    return { success: true }
  })

  ipcMain.handle('policy:check-action', (_e, args: { action: string; details?: Record<string, unknown> }) => {
    const { rules, presetName } = getActiveRules()
    const violations: string[] = []

    if (args.action === 'set-permission-mode' && rules.requiredPermissionMode) {
      const requested = args.details?.['mode'] as string
      if (requested && requested !== rules.requiredPermissionMode && requested !== 'default') {
        violations.push(`Your active policy requires permission mode: ${rules.requiredPermissionMode}`)
      }
    }

    if (args.action === 'set-model' && rules.allowedModels.length > 0) {
      const model = args.details?.['model'] as string
      if (model && !rules.allowedModels.includes(model)) {
        violations.push(`Model "${model}" is not in the allowed list: ${rules.allowedModels.join(', ')}`)
      }
    }

    if (args.action === 'use-tool' && rules.blockedTools.length > 0) {
      const tool = args.details?.['tool'] as string
      if (tool && rules.blockedTools.some((b) => tool.includes(b.replace('*', '')))) {
        violations.push(`Tool "${tool}" is blocked by policy`)
      }
    }

    if (violations.length > 0) {
      // Log violation
      for (const v of violations) {
        const entry: PolicyViolation = {
          id: randomUUID(), timestamp: Date.now(),
          action: args.action, rule: v,
          details: JSON.stringify(args.details ?? {}), presetName,
        }
        const viols = store.get('violations')
        viols.push(entry)
        if (viols.length > 500) viols.splice(0, viols.length - 500)
        store.set('violations', viols)
      }
      // Emit a notification for policy violations
      notificationManager?.emit({
        type: 'policy-violation',
        severity: 'warning',
        title: `Policy violation: ${args.action}`,
        message: violations.join('; '),
        source: 'policy-engine',
        action: { label: 'View Policies', ipcChannel: '', navigate: '/configure', tab: 'policies' },
      })
    }

    return { allowed: violations.length === 0, violations, presetName }
  })

  ipcMain.handle('policy:get-violations', (_e, args?: { limit?: number }) => {
    const all = store.get('violations')
    return all.slice(-(args?.limit ?? 50)).reverse()
  })

  ipcMain.handle('policy:export', async (_e, args: { id: string }) => {
    const preset = getAllPresets().find((p) => p.id === args.id)
    if (!preset) return { error: 'Not found' }
    const result = await dialog.showSaveDialog({
      defaultPath: `${preset.name.toLowerCase().replace(/\s+/g, '-')}-policy.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    writeFileSync(result.filePath, JSON.stringify(preset, null, 2) + '\n', 'utf8')
    return { path: result.filePath }
  })

  ipcMain.handle('policy:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }
    try {
      const raw = readFileSync(result.filePaths[0], 'utf8')
      const imported = JSON.parse(raw) as PolicyPreset
      if (!imported.name || !imported.rules) return { error: 'Invalid policy file' }
      imported.id = randomUUID()
      imported.isBuiltin = false
      imported.createdAt = Date.now()
      const presets = store.get('presets')
      presets.push(imported)
      store.set('presets', presets)
      return { preset: imported }
    } catch (err) {
      return { error: String(err) }
    }
  })
}
