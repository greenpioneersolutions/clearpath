import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc/handlers'
import { registerAuthHandlers } from './ipc/authHandlers'
import { registerAgentHandlers } from './ipc/agentHandlers'
import { registerSessionHistoryHandlers } from './ipc/sessionHistoryHandlers'
import { CLIManager } from './cli/CLIManager'
import { AuthManager } from './auth/AuthManager'
import { AgentManager } from './agents/AgentManager'
import { initShellEnv } from './utils/shellEnv'

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

registerIpcHandlers(ipcMain, cliManager, agentManager)
registerAuthHandlers(ipcMain, authManager)
registerAgentHandlers(ipcMain, agentManager)
registerSessionHistoryHandlers(ipcMain)

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
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
