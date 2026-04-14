// MUST be the very first import — registers process.on('uncaughtException') and
// app.once('ready') before any electron-store constructor can run at module load time.
// See src/main/utils/corruptionHandler.ts for full explanation.
import './utils/corruptionHandler'

import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { log } from './utils/logger'
import { ExtensionRegistry } from './extensions/ExtensionRegistry'
import { ExtensionMainLoader } from './extensions/ExtensionMainLoader'
import { ExtensionStoreFactory } from './extensions/ExtensionStore'
import { registerExtensionHandlers } from './ipc/extensionHandlers'
import { assertPathWithinRoots } from './utils/pathSecurity'
import { registerIpcHandlers } from './ipc/handlers'
import { registerAuthHandlers } from './ipc/authHandlers'
import { registerAgentHandlers } from './ipc/agentHandlers'
import { registerSessionHistoryHandlers } from './ipc/sessionHistoryHandlers'
import { registerMemoryHandlers } from './ipc/memoryHandlers'
import { registerToolHandlers } from './ipc/toolHandlers'
import { registerSubAgentHandlers } from './ipc/subAgentHandlers'
import { registerSettingsHandlers } from './ipc/settingsHandlers'
import { registerCostHandlers } from './ipc/costHandlers'
import { registerTemplateHandlers } from './ipc/templateHandlers'
import { registerTeamHandlers } from './ipc/teamHandlers'
import { registerOnboardingHandlers } from './ipc/onboardingHandlers'
import { registerGitHandlers } from './ipc/gitHandlers'
import { registerFileExplorerHandlers } from './ipc/fileExplorerHandlers'
import { registerPolicyHandlers } from './ipc/policyHandlers'
import { registerWorkspaceHandlers } from './ipc/workspaceHandlers'
import { registerComplianceHandlers } from './ipc/complianceHandlers'
import { registerNotificationHandlers } from './ipc/notificationHandlers'
import { NotificationManager } from './notifications/NotificationManager'
import { registerSchedulerHandlers } from './ipc/schedulerHandlers'
import { SchedulerService } from './scheduler/SchedulerService'
import { registerKnowledgeBaseHandlers } from './ipc/knowledgeBaseHandlers'
import { registerDashboardHandlers } from './ipc/dashboardHandlers'
import { registerLocalModelHandlers } from './ipc/localModelHandlers'
import { registerWorkflowHandlers } from './ipc/workflowHandlers'
import { registerLearnHandlers } from './ipc/learnHandlers'
import { registerSkillHandlers } from './ipc/skillHandlers'
import { registerIntegrationHandlers } from './ipc/integrationHandlers'
import { registerAtlassianHandlers } from './integrations/atlassian'
import { registerServiceNowHandlers } from './integrations/servicenow'
import { registerBackstageHandlers } from './integrations/backstage'
import { registerPowerBIHandlers } from './integrations/powerbi'
import { registerSplunkHandlers } from './integrations/splunk'
import { registerDatadogHandlers } from './integrations/datadog'
import { registerCustomIntegrationHandlers } from './ipc/customIntegrationHandlers'
import { registerWizardHandlers } from './ipc/wizardHandlers'
import { registerNoteHandlers } from './ipc/noteHandlers'
import { registerDataManagementHandlers } from './ipc/dataManagementHandlers'
import { registerFeatureFlagHandlers } from './ipc/featureFlagHandlers'
import { registerBrandingHandlers } from './ipc/brandingHandlers'
import { registerStarterPackHandlers } from './ipc/starterPackHandlers'
import { registerContextSourceHandlers } from './ipc/contextSourceHandlers'
// PR Scores is now a bundled extension — see extensions/com.clearpathai.pr-scores/
import { registerAccessibilityHandlers } from './ipc/accessibilityHandlers'
import { CLIManager } from './cli/CLIManager'
import { AuthManager } from './auth/AuthManager'
import { AgentManager } from './agents/AgentManager'
import { initShellEnv } from './utils/shellEnv'
import { getStoreEncryptionKey, checkEncryptionKeyIntegrity } from './utils/storeEncryption'
import { probeAllStores, clearAllStoreFiles } from './utils/storeHealthCheck'
import Store from 'electron-store'
import { randomUUID } from 'crypto'

// Suppress Chromium Autofill protocol errors in DevTools
// (Electron's Chromium build doesn't support the Autofill domain)
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication')

// Load the login-shell PATH as early as possible so it's ready before the
// renderer triggers any IPC calls that spawn child processes.
void initShellEnv()

let mainWindow: BrowserWindow | null = null

const getWebContents = () => mainWindow?.webContents ?? null

// Singletons — created before app.ready so ipcMain.handle calls are registered
// before any renderer window connects (Electron requirement).
const cliManager = new CLIManager(getWebContents)
const authManager = new AuthManager(getWebContents)
const agentManager = new AgentManager()
const notificationManager = new NotificationManager(getWebContents)
const schedulerService = new SchedulerService(cliManager, notificationManager)
const extensionRegistry = new ExtensionRegistry()
const extensionStoreFactory = new ExtensionStoreFactory()
const extensionMainLoader = new ExtensionMainLoader(ipcMain, extensionRegistry, extensionStoreFactory)

registerIpcHandlers(ipcMain, cliManager, agentManager)
registerAuthHandlers(ipcMain, authManager)
registerAgentHandlers(ipcMain, agentManager)
registerSessionHistoryHandlers(ipcMain)
registerMemoryHandlers(ipcMain)
registerToolHandlers(ipcMain)
registerSubAgentHandlers(ipcMain, cliManager)
registerSettingsHandlers(ipcMain)
registerCostHandlers(ipcMain, notificationManager)
registerTemplateHandlers(ipcMain)
registerTeamHandlers(ipcMain)
registerOnboardingHandlers(ipcMain)
registerGitHandlers(ipcMain)
registerFileExplorerHandlers(ipcMain, getWebContents)
registerPolicyHandlers(ipcMain, notificationManager)
registerWorkspaceHandlers(ipcMain)
registerComplianceHandlers(ipcMain, notificationManager)
registerNotificationHandlers(ipcMain, notificationManager)
registerSchedulerHandlers(ipcMain, schedulerService)
registerKnowledgeBaseHandlers(ipcMain, cliManager)
registerDashboardHandlers(ipcMain)
registerLocalModelHandlers(ipcMain)
registerWorkflowHandlers(ipcMain)
registerLearnHandlers(ipcMain)
registerSkillHandlers(ipcMain)
registerIntegrationHandlers(ipcMain)
registerAtlassianHandlers(ipcMain)
registerServiceNowHandlers(ipcMain)
registerBackstageHandlers(ipcMain)
registerPowerBIHandlers(ipcMain)
registerSplunkHandlers(ipcMain)
registerDatadogHandlers(ipcMain)
registerCustomIntegrationHandlers(ipcMain)
registerWizardHandlers(ipcMain)
registerNoteHandlers(ipcMain)
registerDataManagementHandlers(ipcMain)
registerFeatureFlagHandlers(ipcMain)
registerBrandingHandlers(ipcMain)
registerStarterPackHandlers(ipcMain)
registerAccessibilityHandlers(ipcMain)
registerExtensionHandlers(ipcMain, extensionRegistry, extensionMainLoader, extensionStoreFactory, notificationManager)
registerContextSourceHandlers(ipcMain, extensionRegistry)

// Register host handlers that extensions can call through ctx.invoke()
import { retrieveSecret } from './utils/credentialStore'
import { localModelAdapter } from './ipc/localModelHandlers'

extensionMainLoader.registerHostHandler('integration:get-github-token', async () => {
  const token = retrieveSecret('github-token')
  if (!token) throw new Error('GitHub token not configured')
  return token
})

// ── Extension Host Handlers: Integration proxies ──────────────────────────────
// Proxy IPC channels registered by integration handlers so extensions can
// call them via ctx.invoke(). Uses Electron's internal _invokeHandlers map.
{
  const proxyChannels = [
    // Core integration status
    'integration:get-status',
    // GitHub
    'integration:github-repos', 'integration:github-pulls',
    'integration:github-pull-detail', 'integration:github-issues',
    'integration:github-search',
    // Backstage
    'integration:backstage-entities', 'integration:backstage-entity-detail',
    'integration:backstage-search', 'integration:backstage-techdocs',
    'integration:backstage-templates', 'integration:backstage-kubernetes',
  ]
  for (const ch of proxyChannels) {
    extensionMainLoader.registerHostHandler(ch, async (...args: unknown[]) => {
      const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, (...a: unknown[]) => unknown> })._invokeHandlers
      const handler = handlers?.get(ch)
      if (!handler) throw new Error(`No IPC handler registered for ${ch}`)
      const fakeEvent = {} as Electron.IpcMainInvokeEvent
      return handler(fakeEvent, ...args)
    })
  }
}

// ── Extension Host Handlers: Sessions ────────────────────────────────────────

extensionMainLoader.registerHostHandler('sessions:list', async () => {
  const persisted = cliManager.getPersistedSessions()
  const active = cliManager.listSessions()
  const activeIds = new Set(active.map((s) => s.sessionId))
  const sessions = active.map((s) => ({
    sessionId: s.sessionId,
    cli: s.cli,
    name: s.name,
    status: 'running' as const,
    startedAt: s.startedAt,
  }))
  for (const s of persisted) {
    if (!activeIds.has(s.sessionId)) {
      sessions.push({
        sessionId: s.sessionId,
        cli: s.cli,
        name: s.name,
        status: 'stopped' as const,
        startedAt: s.startedAt,
      })
    }
  }
  return sessions
})

extensionMainLoader.registerHostHandler('sessions:get-messages', async (args: unknown) => {
  const { sessionId } = args as { sessionId: string }
  return cliManager.getPersistedMessageLog(sessionId)
})

extensionMainLoader.registerHostHandler('sessions:get-active', async () => {
  const active = cliManager.listSessions()
  return active.length > 0 ? active[0].sessionId : null
})

// ── Extension Host Handlers: Cost ────────────────────────────────────────────
const costStoreForExt = new Store({ name: 'clear-path-cost', encryptionKey: getStoreEncryptionKey() })

extensionMainLoader.registerHostHandler('cost:summary', async () => {
  const records = costStoreForExt.get('records', []) as Array<{
    estimatedCostUsd: number; inputTokens: number; outputTokens: number
    totalTokens: number; promptCount: number; timestamp: number
  }>
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const weekStart = now - 7 * 24 * 60 * 60 * 1000
  const monthStart = now - 30 * 24 * 60 * 60 * 1000

  let totalCost = 0, totalTokens = 0, totalInputTokens = 0, totalOutputTokens = 0, totalPrompts = 0
  let todaySpend = 0, weekSpend = 0, monthSpend = 0, todayTokens = 0, weekTokens = 0, monthTokens = 0

  for (const r of records) {
    totalCost += r.estimatedCostUsd; totalTokens += r.totalTokens
    totalInputTokens += r.inputTokens; totalOutputTokens += r.outputTokens
    totalPrompts += r.promptCount
    if (r.timestamp >= todayStart) { todaySpend += r.estimatedCostUsd; todayTokens += r.totalTokens }
    if (r.timestamp >= weekStart) { weekSpend += r.estimatedCostUsd; weekTokens += r.totalTokens }
    if (r.timestamp >= monthStart) { monthSpend += r.estimatedCostUsd; monthTokens += r.totalTokens }
  }

  const displayMode = costStoreForExt.get('analyticsDisplayMode', 'tokens') as 'tokens' | 'monetary'
  return {
    totalCost, totalTokens, totalInputTokens, totalOutputTokens,
    totalSessions: new Set(records.map((r: { sessionId?: string }) => r.sessionId)).size,
    totalPrompts, todaySpend, weekSpend, monthSpend, todayTokens, weekTokens, monthTokens, displayMode,
  }
})

extensionMainLoader.registerHostHandler('cost:list', async (args: unknown) => {
  const { since, until } = (args ?? {}) as { since?: number; until?: number }
  let records = costStoreForExt.get('records', []) as Array<Record<string, unknown>>
  if (since) records = records.filter((r) => (r.timestamp as number) >= since)
  if (until) records = records.filter((r) => (r.timestamp as number) <= until)
  return records
})

extensionMainLoader.registerHostHandler('cost:get-budget', async () => {
  return costStoreForExt.get('budget', {
    dailyCeiling: null, weeklyCeiling: null, monthlyCeiling: null,
    dailyTokenCeiling: null, weeklyTokenCeiling: null, monthlyTokenCeiling: null,
    autoPauseAtLimit: false,
  })
})

extensionMainLoader.registerHostHandler('cost:by-session', async (args: unknown) => {
  const { since } = (args ?? {}) as { since?: number }
  let records = costStoreForExt.get('records', []) as Array<{
    sessionId: string; sessionName: string; cli: string
    estimatedCostUsd: number; totalTokens: number; promptCount: number; timestamp: number
  }>
  if (since) records = records.filter((r) => r.timestamp >= since)
  const map = new Map<string, { sessionName: string; cli: string; totalCost: number; totalTokens: number; promptCount: number }>()
  for (const r of records) {
    const entry = map.get(r.sessionId) ?? { sessionName: r.sessionName, cli: r.cli, totalCost: 0, totalTokens: 0, promptCount: 0 }
    entry.totalCost += r.estimatedCostUsd; entry.totalTokens += r.totalTokens; entry.promptCount += r.promptCount
    map.set(r.sessionId, entry)
  }
  return [...map.entries()].map(([sessionId, v]) => ({
    sessionId, ...v, costPerPrompt: v.promptCount > 0 ? v.totalCost / v.promptCount : 0,
  }))
})

// ── Extension Host Handlers: Feature Flags ───────────────────────────────────
const flagStoreForExt = new Store({ name: 'clear-path-feature-flags', encryptionKey: getStoreEncryptionKey() })

extensionMainLoader.registerHostHandler('feature-flags:get', async () => {
  return flagStoreForExt.get('flags', {})
})

extensionMainLoader.registerHostHandler('feature-flags:set', async (args: unknown) => {
  const partial = args as Record<string, boolean>
  const current = flagStoreForExt.get('flags', {}) as Record<string, boolean>
  const merged = { ...current, ...partial }
  flagStoreForExt.set('flags', merged)
  flagStoreForExt.set('activePresetId', null)
  return merged
})

// ── Extension Host Handlers: Local Models ────────────────────────────────────
extensionMainLoader.registerHostHandler('local-models:detect', async () => {
  return localModelAdapter.detectServers()
})

extensionMainLoader.registerHostHandler('local-models:chat', async (args: unknown) => {
  const { model, messages, source } = args as {
    model: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    source?: 'ollama' | 'lmstudio'
  }
  const content = await localModelAdapter.chat(model, messages, source)
  return { content }
})

// ── Extension Host Handlers: Notes ───────────────────────────────────────────
const noteStoreForExt = new Store({ name: 'clear-path-notes', encryptionKey: getStoreEncryptionKey() })

extensionMainLoader.registerHostHandler('notes:list', async () => {
  return noteStoreForExt.get('notes', [])
})

extensionMainLoader.registerHostHandler('notes:get', async (args: unknown) => {
  const { id } = args as { id: string }
  const notes = noteStoreForExt.get('notes', []) as Array<{ id: string }>
  return notes.find((n) => n.id === id) ?? null
})

extensionMainLoader.registerHostHandler('notes:get-full-content', async (args: unknown) => {
  const { ids } = args as { ids: string[] }
  const notes = noteStoreForExt.get('notes', []) as Array<{ id: string; content: string }>
  return notes.filter((n) => ids.includes(n.id))
})

// ── Extension Host Handlers: Skills ──────────────────────────────────────────
extensionMainLoader.registerHostHandler('skills:list', async () => {
  // Delegate to the existing IPC handler by invoking via ipcMain.emit
  // Skills are file-based — the skill handler scans directories
  return new Promise((resolve) => {
    ipcMain.emit('skills:list-internal', { sender: { send: () => {} } }, resolve)
  }).catch(() => [])
})

extensionMainLoader.registerHostHandler('skills:get', async (args: unknown) => {
  const { id } = args as { id: string }
  return new Promise((resolve) => {
    ipcMain.emit('skills:get-internal', { sender: { send: () => {} } }, id, resolve)
  }).catch(() => null)
})

// ── Extension Host Handlers: Context Estimation ──────────────────────────────
extensionMainLoader.registerHostHandler('context:estimate-tokens', async (args: unknown) => {
  const { text } = args as { text: string }
  const tokens = Math.ceil(text.length / 4)
  return { tokens, method: 'heuristic' as const }
})

// ── Extension Host Handlers: Notifications ───────────────────────────────────
const notifyHandler = async (args: unknown) => {
  const { title, message, severity } = args as { title: string; message: string; severity?: string }
  notificationManager.emit({
    type: 'info',
    severity: (severity as 'info' | 'warning' | 'error') ?? 'info',
    title,
    message,
    source: 'extension',
  })
}
extensionMainLoader.registerHostHandler('extension:notify', notifyHandler)
extensionMainLoader.registerHostHandler('notifications:emit', notifyHandler)

// Wire CLIManager to broadcast lifecycle events to extensions
cliManager.setExtensionEventCallback(async (event, data) => {
  await extensionMainLoader.broadcastEvent(event, data)
})

// Wire CLIManager to emit notifications through the central hub
cliManager.setNotifyCallback((args) => {
  notificationManager.emit({
    type: args.type as import('./notifications/NotificationManager').NotificationType,
    severity: args.severity as import('./notifications/NotificationManager').NotificationSeverity,
    title: args.title,
    message: args.message,
    source: args.source,
    sessionId: args.sessionId,
    action: args.action as import('./notifications/NotificationManager').NotificationAction | undefined,
  })
})

// Wire CLIManager to log audit events through the compliance system
cliManager.setAuditCallback((entry) => {
  const compStore = new Store({ name: 'clear-path-compliance', encryptionKey: getStoreEncryptionKey() })
  const log = compStore.get('auditLog', []) as unknown[]
  log.push({ ...entry, id: randomUUID(), timestamp: Date.now() })
  if (log.length > 10000) log.splice(0, log.length - 10000)
  compStore.set('auditLog', log)
})

// Wire CLIManager to record cost data for every completed turn and sub-agent
cliManager.setCostRecordCallback((args) => {
  const costStore = new Store({ name: 'clear-path-cost', encryptionKey: getStoreEncryptionKey() })
  const records = costStore.get('records', []) as unknown[]
  records.push({ ...args, id: randomUUID() })
  if ((records as unknown[]).length > 10000) (records as unknown[]).splice(0, (records as unknown[]).length - 10000)
  costStore.set('records', records)
})

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Content Security Policy — blocks inline scripts, eval, and external resource loading.
  // Defense-in-depth against XSS even if sanitization is bypassed in the renderer.
  //
  // NOTE on style-src 'unsafe-inline':
  // React's style attribute and Tailwind's dynamic brand theming via CSS variables
  // generate inline styles throughout the app. Removing 'unsafe-inline' for style-src
  // would break the UI. The CSS injection risk is mitigated by:
  //   1. script-src 'self' — inline scripts cannot execute regardless of CSS injection
  //   2. rehype-sanitize strips style attributes from AI/markdown output
  //   3. connect-src restricts where CSS url() can fetch from
  //   4. img-src restricts image-based exfiltration to 'self' and data: URIs
  const isDev = !!process.env['ELECTRON_RENDERER_URL']

  // Content Security Policy — blocks inline scripts, eval, and external resource loading.
  // In dev mode, Vite's React plugin injects an inline HMR preamble script, so we must
  // allow 'unsafe-inline' for script-src during development only.
  const cspScriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'"
  const cspConnectSrc = isDev
    ? "'self' https://api.github.com ws://localhost:* http://localhost:*"
    : "'self' https://api.github.com"

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${cspScriptSrc} clearpath-ext:; style-src 'self' 'unsafe-inline' clearpath-ext:; img-src 'self' data: clearpath-ext:; font-src 'self' data:; connect-src ${cspConnectSrc}; frame-src 'self' blob: data:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`
        ],
      },
    })
  })
  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
    // Only open DevTools in development — never in packaged builds
    if (process.env['NODE_ENV'] !== 'production') {
      mainWindow.webContents.openDevTools({ mode: 'bottom' })
    }
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  // ── Extension System: Custom Protocol ──────────────────────────────────
  // Registers clearpath-ext:// protocol so extension iframes can load assets
  // from their install directory without a local HTTP server.
  protocol.registerFileProtocol('clearpath-ext', (request, callback) => {
    try {
      const url = new URL(request.url)
      const extensionId = url.hostname
      const filePath = url.pathname

      const ext = extensionRegistry.get(extensionId)
      if (!ext || !ext.enabled) {
        callback({ statusCode: 403 })
        return
      }

      const resolved = assertPathWithinRoots(
        join(ext.installPath, filePath),
        [ext.installPath],
      )
      callback({ path: resolved })
    } catch (err) {
      log.error('[ext-protocol] Error resolving extension asset: %s', err)
      callback({ statusCode: 404 })
    }
  })

  // ── Extension System: Discovery & Loading ──────────────────────────────
  const extResult = extensionRegistry.discoverAll()
  log.info('[ext] Discovered %d extensions (%d errors)', extResult.discovered, extResult.errors.length)
  for (const e of extResult.errors) {
    log.warn('[ext] Validation error at %s: %s', e.dir, e.errors.join('; '))
  }

  // Load main process entries for enabled extensions
  await extensionMainLoader.loadAll()

  // ── Store Health Check ────────────────────────────────────────────────────
  // Probe every known store before the window loads. If any store file is
  // corrupted (bad encryption key, truncated write, disk error) we surface a
  // native dialog now — before the renderer ever requests data — so the user
  // gets a clear recovery path instead of a broken UI.
  const corruptedStores = probeAllStores()
  if (corruptedStores.length > 0) {
    log.warn('[startup] Corrupted stores detected: %s', corruptedStores.join(', '))

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Quit', 'Clear Data & Restart'],
      defaultId: 1,
      cancelId: 0,
      title: 'Corrupted Data Detected',
      message: 'ClearPath AI could not load its local data.',
      detail:
        'One or more data stores are corrupted and cannot be read. This can happen ' +
        'after a system migration, a hostname or username change, or a disk error.\n\n' +
        'Clicking "Clear Data & Restart" will permanently delete all local app data ' +
        '(sessions, settings, costs, etc.) and restart with a clean slate. ' +
        'Your CLI tools, GitHub account, and any external services will not be affected.\n\n' +
        'If you choose Quit, the app will close without making any changes.',
    })

    if (response === 1) {
      const { deleted, failed } = clearAllStoreFiles()
      log.info('[startup] Cleared %d store file(s) for recovery. Failed: %d', deleted.length, failed.length)
      app.relaunch()
      app.exit(0)
    } else {
      app.quit()
    }
    return
  }

  // Check if encryption key has changed (hostname/username change)
  const keyCheck = checkEncryptionKeyIntegrity()
  if (keyCheck.changed) {
    dialog.showMessageBoxSync({
      type: 'warning',
      title: 'Encryption Key Changed',
      message: 'Your system hostname or username has changed since ClearPathAI was last used.',
      detail: 'Encrypted app data (sessions, notes, settings) may be unreadable with the new key. You may need to reset your data via Settings > Data Management if you experience issues.\n\nTo avoid this in the future, ensure your hostname and username remain stable.',
    })
  }

  createWindow()

  // Give extension system access to webContents for event forwarding
  if (mainWindow) {
    extensionMainLoader.setWebContents(mainWindow.webContents)
  }

  schedulerService.start()

  // ── Auto-updater (checks GitHub Releases) ──────────────────────────────
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'available',
      version: info.version,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'downloaded',
      version: info.version,
    })
  })

  autoUpdater.on('error', (err) => {
    // Silently ignore update errors — not critical to app operation
    log.warn('[updater] Update check failed:', err.message)
  })

  // Check for updates after a short delay (don't block startup)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // No-op — errors handled by 'error' event
    })
  }, 5000)

  // Restart the app (used by extension manager after changes that require restart)
  ipcMain.handle('app:restart', async () => {
    const isDev = !!process.env['ELECTRON_RENDERER_URL']

    if (isDev) {
      // In dev mode, app.relaunch() can't work because the Vite dev server is
      // managed by electron-vite — the relaunched process loses ELECTRON_RENDERER_URL
      // and shows a blank screen. Instead, reload extensions in-place and refresh the renderer.
      log.info('[app] Dev-mode restart: reloading extensions and refreshing renderer')
      await extensionMainLoader.unloadAll()
      extensionRegistry.discoverAll()
      await extensionMainLoader.loadAll()
      if (mainWindow && !mainWindow.isDestroyed()) {
        extensionMainLoader.setWebContents(mainWindow.webContents)
        mainWindow.webContents.reload()
      }
    } else {
      // In production, do a full process restart
      log.info('[app] Production restart: relaunching app')
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        win.removeAllListeners('close')
        win.close()
      }
      await new Promise((resolve) => setTimeout(resolve, 200))
      app.relaunch()
      app.exit(0)
    }
  })

  // IPC handlers for manual update control
  ipcMain.handle('updater:check', () => {
    return autoUpdater.checkForUpdates().then((r) => ({
      available: !!r?.updateInfo,
      version: r?.updateInfo?.version,
    })).catch(() => ({ available: false }))
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
