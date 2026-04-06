import type { IpcMain } from 'electron'
import { dialog, shell } from 'electron'
import Store from 'electron-store'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { setCustomEnvVars } from '../utils/shellEnv'
import { storeSecret, retrieveSecret, hasSecret, getSecretPreview } from '../utils/credentialStore'
import { getStoreEncryptionKey } from '../utils/storeEncryption'
import { log } from '../utils/logger'

// ── Settings schema ──────────────────────────────────────────────────────────

interface AppSettings {
  flags: Record<string, unknown>
  model: { copilot: string; claude: string }
  maxBudgetUsd: number | null
  maxTurns: number | null
  verbose: boolean
  envVars: Record<string, string>
}

interface ConfigProfile {
  id: string
  name: string
  description: string
  createdAt: number
  settings: AppSettings
  enabledAgentIds?: string[]
  permissionConfig?: Record<string, unknown>
}

interface SettingsStoreSchema {
  settings: AppSettings
  profiles: ConfigProfile[]
}

const DEFAULT_SETTINGS: AppSettings = {
  flags: {},
  model: { copilot: '', claude: '' },
  maxBudgetUsd: null,
  maxTurns: null,
  verbose: false,
  envVars: {},
}

const store = new Store<SettingsStoreSchema>({
  name: 'clear-path-settings',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    settings: DEFAULT_SETTINGS,
    profiles: [],
  },
})

// ── Built-in starter profiles ────────────────────────────────────────────────

const STARTER_PROFILES: ConfigProfile[] = [
  {
    id: 'builtin-safe',
    name: 'Safe Mode',
    description: 'All permissions manual, no experimental features',
    createdAt: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      flags: {
        'copilot:experimental': false,
        'copilot:yolo': false,
        'copilot:allowAll': false,
        'claude:permissionMode': 'default',
      },
    },
    permissionConfig: { claudeMode: 'default', copilotPreset: 'default' },
  },
  {
    id: 'builtin-power',
    name: 'Power User',
    description: 'Accept edits, experimental on, auto mode',
    createdAt: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      flags: {
        'copilot:experimental': true,
        'claude:permissionMode': 'acceptEdits',
      },
    },
    permissionConfig: { claudeMode: 'acceptEdits', copilotPreset: 'allow-all' },
  },
  {
    id: 'builtin-cicd',
    name: 'CI/CD',
    description: 'Print mode, JSON output, budget limit set',
    createdAt: 0,
    settings: {
      ...DEFAULT_SETTINGS,
      flags: {
        'copilot:outputFormat': 'json',
        'claude:outputFormat': 'json',
      },
      maxBudgetUsd: 5,
      maxTurns: 20,
    },
  },
]

// ── Plugin discovery ─────────────────────────────────────────────────────────

interface PluginInfo {
  name: string
  source: string
  version?: string
  description?: string
  enabled: boolean
  cli: 'copilot' | 'claude'
  path?: string
}

function discoverPlugins(cli: 'copilot' | 'claude'): PluginInfo[] {
  const plugins: PluginInfo[] = []
  const home = homedir()

  if (cli === 'copilot') {
    const pluginDir = join(home, '.copilot', 'plugins')
    if (existsSync(pluginDir)) {
      for (const name of readdirSync(pluginDir)) {
        const fullPath = join(pluginDir, name)
        let desc = ''
        let version = ''
        const pkgPath = join(fullPath, 'package.json')
        if (existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>
            desc = String(pkg['description'] ?? '')
            version = String(pkg['version'] ?? '')
          } catch { /* ignore */ }
        }
        plugins.push({
          name,
          source: fullPath,
          version: version || undefined,
          description: desc || undefined,
          enabled: true,
          cli: 'copilot',
          path: fullPath,
        })
      }
    }
  } else {
    // Claude Code plugins via CLAUDE_CODE_PLUGIN_SEED_DIR or ~/.claude/plugins
    const pluginDir = join(home, '.claude', 'plugins')
    if (existsSync(pluginDir)) {
      for (const name of readdirSync(pluginDir)) {
        const fullPath = join(pluginDir, name)
        plugins.push({
          name,
          source: fullPath,
          enabled: true,
          cli: 'claude',
          path: fullPath,
        })
      }
    }
  }

  return plugins
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  // Load stored env vars into spawn environment on startup
  const initialSettings = store.get('settings')
  const startupVars = { ...initialSettings.envVars }
  // Merge encrypted secrets into spawn env
  for (const sKey of ['GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY']) {
    const secret = retrieveSecret(`env-${sKey}`)
    if (secret) startupVars[sKey] = secret
    // Remove from plaintext store if migrating
    if (initialSettings.envVars[sKey]) {
      storeSecret(`env-${sKey}`, initialSettings.envVars[sKey])
      delete initialSettings.envVars[sKey]
      store.set('settings', initialSettings)
    }
  }
  if (Object.keys(startupVars).length > 0) {
    setCustomEnvVars(startupVars)
  }

  // ── Settings CRUD ──────────────────────────────────────────────────────────

  ipcMain.handle('settings:get', () => store.get('settings'))

  ipcMain.handle('settings:set', (_e, args: { settings: AppSettings }) => {
    store.set('settings', args.settings)
    return { success: true }
  })

  ipcMain.handle('settings:update-flag', (_e, args: { key: string; value: unknown }) => {
    const settings = store.get('settings')
    if (args.value === undefined || args.value === null || args.value === '') {
      delete settings.flags[args.key]
    } else {
      settings.flags[args.key] = args.value
    }
    store.set('settings', settings)
    return settings
  })

  ipcMain.handle('settings:reset-flag', (_e, args: { key: string }) => {
    const settings = store.get('settings')
    delete settings.flags[args.key]
    store.set('settings', settings)
    return settings
  })

  ipcMain.handle('settings:reset-all', () => {
    store.set('settings', DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  })

  ipcMain.handle('settings:set-model', (_e, args: { cli: 'copilot' | 'claude'; model: string }) => {
    const settings = store.get('settings')
    settings.model[args.cli] = args.model
    store.set('settings', settings)
    return settings
  })

  ipcMain.handle('settings:set-budget', (_e, args: { maxBudgetUsd: number | null; maxTurns: number | null; verbose: boolean }) => {
    const settings = store.get('settings')
    settings.maxBudgetUsd = args.maxBudgetUsd
    settings.maxTurns = args.maxTurns
    settings.verbose = args.verbose
    store.set('settings', settings)
    return settings
  })

  // ── Env vars ───────────────────────────────────────────────────────────────

  // Sensitive keys that should be encrypted and never returned in full to the renderer
  const SENSITIVE_ENV_KEYS = new Set(['GH_TOKEN', 'GITHUB_TOKEN', 'ANTHROPIC_API_KEY'])

  ipcMain.handle('settings:get-env-vars', () => {
    const settings = store.get('settings')
    const result: Record<string, { value: string; isSet: boolean; isSensitive: boolean }> = {}
    const keys = [
      'GH_TOKEN', 'GITHUB_TOKEN', 'GITHUB_ASKPASS',
      'ANTHROPIC_API_KEY', 'CLAUDE_CODE_MODEL',
      'COPILOT_CUSTOM_INSTRUCTIONS_DIRS', 'ENABLE_TOOL_SEARCH',
    ]
    for (const key of keys) {
      const isSensitive = SENSITIVE_ENV_KEYS.has(key)
      if (isSensitive) {
        // Sensitive: return only preview from encrypted store
        const hasStored = hasSecret(`env-${key}`)
        const hasEnv = !!process.env[key]
        result[key] = {
          value: hasStored ? getSecretPreview(`env-${key}`) : (hasEnv ? '****' : ''),
          isSet: hasStored || hasEnv,
          isSensitive: true,
        }
      } else {
        // Non-sensitive: return full value
        const val = settings.envVars[key] ?? process.env[key] ?? ''
        result[key] = { value: val, isSet: !!val, isSensitive: false }
      }
    }
    return result
  })

  ipcMain.handle('settings:set-env-var', (_e, args: { key: string; value: string }) => {
    const isSensitive = SENSITIVE_ENV_KEYS.has(args.key)
    const settings = store.get('settings')

    if (isSensitive) {
      // Store sensitive values encrypted, not in plaintext settings
      if (args.value) {
        storeSecret(`env-${args.key}`, args.value)
      } else {
        const { deleteSecret: delSecret } = require('../utils/credentialStore')
        delSecret(`env-${args.key}`)
      }
      // Remove from plaintext store if it was there before (migration)
      delete settings.envVars[args.key]
    } else {
      if (args.value) {
        settings.envVars[args.key] = args.value
      } else {
        delete settings.envVars[args.key]
      }
    }

    store.set('settings', settings)

    // Rebuild env vars for spawning — sensitive vars come from credential store
    const spawnVars = { ...settings.envVars }
    for (const sKey of SENSITIVE_ENV_KEYS) {
      const secret = retrieveSecret(`env-${sKey}`)
      if (secret) spawnVars[sKey] = secret
    }
    setCustomEnvVars(spawnVars)
    return { success: true }
  })

  // ── Profiles ───────────────────────────────────────────────────────────────

  ipcMain.handle('settings:list-profiles', () => {
    const saved = store.get('profiles')
    // Merge built-in starter profiles
    const ids = new Set(saved.map((p) => p.id))
    const all = [...saved]
    for (const bp of STARTER_PROFILES) {
      if (!ids.has(bp.id)) all.push(bp)
    }
    return all
  })

  ipcMain.handle('settings:save-profile', (_e, args: { name: string; description?: string }) => {
    const settings = store.get('settings')
    const profiles = store.get('profiles')
    const existing = profiles.findIndex((p) => p.name === args.name)

    // Also capture current agent enablement state
    let enabledAgentIds: string[] | undefined
    try {
      const agentStore = new Store({ name: 'clear-path-agents', encryptionKey: getStoreEncryptionKey() })
      enabledAgentIds = (agentStore.get('enabledAgentIds') as string[]) ?? undefined
    } catch { /* ok */ }

    const profile: ConfigProfile = {
      id: existing >= 0 ? profiles[existing].id : randomUUID(),
      name: args.name,
      description: args.description ?? '',
      createdAt: Date.now(),
      settings: { ...settings },
      enabledAgentIds,
    }

    if (existing >= 0) {
      profiles[existing] = profile
    } else {
      profiles.push(profile)
    }
    store.set('profiles', profiles)
    return profile
  })

  ipcMain.handle('settings:load-profile', (_e, args: { id: string }) => {
    const profiles = store.get('profiles')
    let profile = profiles.find((p) => p.id === args.id)
    if (!profile) {
      profile = STARTER_PROFILES.find((p) => p.id === args.id)
    }
    if (!profile) return { error: 'Profile not found' }

    store.set('settings', profile.settings)

    // Also restore agent enablement state if the profile saved it
    if (profile.enabledAgentIds) {
      try {
        const agentStore = new Store({ name: 'clear-path-agents', encryptionKey: getStoreEncryptionKey() })
        agentStore.set('enabledAgentIds', profile.enabledAgentIds)
      } catch { /* ok */ }
    }

    return { settings: profile.settings, restoredAgentIds: !!profile.enabledAgentIds }
  })

  ipcMain.handle('settings:delete-profile', (_e, args: { id: string }) => {
    const profiles = store.get('profiles').filter((p) => p.id !== args.id)
    store.set('profiles', profiles)
    return { success: true }
  })

  ipcMain.handle('settings:export-profile', async (_e, args: { id: string }) => {
    const profiles = store.get('profiles')
    let profile = profiles.find((p) => p.id === args.id)
    if (!profile) profile = STARTER_PROFILES.find((p) => p.id === args.id)
    if (!profile) return { error: 'Profile not found' }

    const result = await dialog.showSaveDialog({
      defaultPath: `${profile.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    // Strip environment variables from export — they may contain secrets
    // (especially older profiles saved before credential store migration)
    const safeProfile = {
      ...profile,
      settings: { ...profile.settings, envVars: {} },
    }
    writeFileSync(result.filePath, JSON.stringify(safeProfile, null, 2) + '\n', 'utf8')
    return { path: result.filePath }
  })

  ipcMain.handle('settings:import-profile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    try {
      const raw = readFileSync(result.filePaths[0], 'utf8')
      const imported = JSON.parse(raw) as ConfigProfile
      if (!imported.name || !imported.settings) {
        return { error: 'Invalid profile file' }
      }
      imported.id = randomUUID()
      imported.createdAt = Date.now()

      const profiles = store.get('profiles')
      profiles.push(imported)
      store.set('profiles', profiles)
      return { profile: imported }
    } catch (err) {
      return { error: String(err) }
    }
  })

  // ── Plugins ────────────────────────────────────────────────────────────────

  ipcMain.handle('settings:list-plugins', (_e, args: { cli: 'copilot' | 'claude' }) =>
    discoverPlugins(args.cli),
  )

  // ── Launch command ─────────────────────────────────────────────────────────

  ipcMain.handle('settings:open-terminal', async (_e, args: { command: string }) => {
    // Security: Only open a terminal at the specified directory.
    // We treat args.command as a working directory path, NOT a shell command.
    // This prevents shell injection via AppleScript or x-terminal-emulator.
    const cwd = args.command || process.cwd()

    // Validate the path exists and is a directory
    const { existsSync: pathExists, statSync: pathStat } = await import('fs')
    const { resolve } = await import('path')
    const resolved = resolve(cwd)
    try {
      if (!pathExists(resolved) || !pathStat(resolved).isDirectory()) {
        return { success: false, error: 'Path is not a valid directory' }
      }
    } catch {
      return { success: false, error: 'Cannot access path' }
    }

    if (process.platform === 'darwin') {
      // Use 'open -a Terminal <dir>' — no shell interpolation, arguments are array-separated
      const { execFile: ef } = await import('child_process')
      ef('open', ['-a', 'Terminal', resolved], (err) => {
        if (err) log.error('[settings] Failed to open Terminal:', err)
      })
    } else {
      // On Linux, spawn a terminal emulator at the directory using execFile (not shell)
      const { execFile: ef } = await import('child_process')
      ef('x-terminal-emulator', [], { cwd: resolved }, (err) => {
        if (err) log.error('[settings] Failed to open terminal:', err)
      })
    }
    return { success: true }
  })
}
