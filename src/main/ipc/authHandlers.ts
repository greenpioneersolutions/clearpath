import type { IpcMain } from 'electron'
import type { AuthManager } from '../auth/AuthManager'
import type { InstallTarget } from '../../renderer/src/types/install'

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
    },
  )

  /** Abort an in-progress login. */
  ipcMain.handle('auth:login-cancel', () => {
    authManager.cancelLogin()
  })

  // ── Install ────────────────────────────────────────────────────────────────

  /** Check if Node.js is installed and >= v22. */
  ipcMain.handle(
    'auth:check-node',
    (_event, opts?: { forceRefresh?: boolean }) => authManager.checkNode(!!opts?.forceRefresh),
  )

  /** Install one of the CLIs (copilot | claude) via `npm install -g`. */
  ipcMain.handle(
    'auth:install-start',
    (_event, { cli }: { cli: 'copilot' | 'claude' }) => {
      if (cli === 'copilot') authManager.installCopilot()
      else if (cli === 'claude') authManager.installClaude()
    },
  )

  /** Install Node.js using the platform's native package manager. */
  ipcMain.handle('auth:install-node-managed', () => {
    authManager.installNodeManaged()
  })

  /** Cancel an in-progress install. */
  ipcMain.handle(
    'auth:install-cancel',
    (_event, { target }: { target: InstallTarget }) => {
      authManager.cancelInstall(target)
    },
  )

  /**
   * Validate + open a URL in the system default browser.
   * Only https:// URLs are allowed (validated inside AuthManager).
   * Returns boolean so renderer can show a fallback UI on refusal.
   */
  ipcMain.handle('auth:open-external', (_event, { url }: { url: string }) => {
    return authManager.openExternalUrl(url)
  })
}
