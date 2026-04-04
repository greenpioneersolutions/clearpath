import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
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
import { registerWizardHandlers } from './ipc/wizardHandlers'
import { registerNoteHandlers } from './ipc/noteHandlers'
import { registerDataManagementHandlers } from './ipc/dataManagementHandlers'
import { registerFeatureFlagHandlers } from './ipc/featureFlagHandlers'
import { registerBrandingHandlers } from './ipc/brandingHandlers'
import { CLIManager } from './cli/CLIManager'
import { AuthManager } from './auth/AuthManager'
import { AgentManager } from './agents/AgentManager'
import { initShellEnv } from './utils/shellEnv'

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

registerIpcHandlers(ipcMain, cliManager, agentManager)
registerAuthHandlers(ipcMain, authManager)
registerAgentHandlers(ipcMain, agentManager)
registerSessionHistoryHandlers(ipcMain)
registerMemoryHandlers(ipcMain)
registerToolHandlers(ipcMain)
registerSubAgentHandlers(ipcMain, cliManager)
registerSettingsHandlers(ipcMain)
registerCostHandlers(ipcMain)
registerTemplateHandlers(ipcMain)
registerTeamHandlers(ipcMain)
registerOnboardingHandlers(ipcMain)
registerGitHandlers(ipcMain)
registerFileExplorerHandlers(ipcMain, getWebContents)
registerPolicyHandlers(ipcMain)
registerWorkspaceHandlers(ipcMain)
registerComplianceHandlers(ipcMain)
registerNotificationHandlers(ipcMain, notificationManager)
registerSchedulerHandlers(ipcMain, schedulerService)
registerKnowledgeBaseHandlers(ipcMain, cliManager)
registerDashboardHandlers(ipcMain)
registerLocalModelHandlers(ipcMain)
registerWorkflowHandlers(ipcMain)
registerLearnHandlers(ipcMain)
registerSkillHandlers(ipcMain)
registerIntegrationHandlers(ipcMain)
registerWizardHandlers(ipcMain)
registerNoteHandlers(ipcMain)
registerDataManagementHandlers(ipcMain)
registerFeatureFlagHandlers(ipcMain)
registerBrandingHandlers(ipcMain)

// Wire CLIManager to emit notifications through the central hub
cliManager.setNotifyCallback((args) => {
  notificationManager.emit({
    type: args.type as import('./notifications/NotificationManager').NotificationType,
    severity: args.severity as import('./notifications/NotificationManager').NotificationSeverity,
    title: args.title,
    message: args.message,
    source: args.source,
    sessionId: args.sessionId,
  })
})

// Wire CLIManager to record cost data for every completed turn and sub-agent
cliManager.setCostRecordCallback((args) => {
  const Store = require('electron-store')
  const costStore = new Store({ name: 'clear-path-cost' })
  const records = costStore.get('records', []) as unknown[]
  records.push({ ...args, id: require('crypto').randomUUID() })
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
    },
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'bottom' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()
  schedulerService.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
