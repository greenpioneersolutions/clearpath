import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth/AuthManager'

export function registerAuthHandlers(ipcMain: IpcMain, authManager: AuthManager): void {
  /** Return cached-or-fresh status for both CLIs. */
  ipcMain.handle('auth:get-status', () => authManager.getStatus())

  /** Force a re-check of install + auth state for both CLIs. */
  ipcMain.handle('auth:refresh', () => authManager.refresh())

  /** Begin a login flow. Output streamed via push events. */
  ipcMain.handle(
    'auth:login-start',
    (_event, { cli }: { cli: 'copilot' | 'claude' }) => {
      authManager.startLogin(cli)
    }
  )

  /** Abort an in-progress login. */
  ipcMain.handle('auth:login-cancel', () => {
    authManager.cancelLogin()
  })
}
