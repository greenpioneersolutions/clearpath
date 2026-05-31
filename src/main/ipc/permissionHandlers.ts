// ── IPC for the per-tool PermissionBroker ─────────────────────────────────────
// The renderer modal answers a pending tool-permission request via
// `permission:respond`; `permission:list-pending` lets a freshly-mounted modal
// recover any in-flight requests.

import type { IpcMain } from 'electron'
import type { PermissionBroker } from '../permissions/PermissionBroker'
import type { PermissionDecision, GrantScope, PermissionRequest } from '../../shared/permissions/types'

export function registerPermissionHandlers(ipcMain: IpcMain, broker: PermissionBroker): void {
  ipcMain.handle(
    'permission:respond',
    (_e, args: { requestId: string; decision: PermissionDecision; remember?: GrantScope }): { ok: boolean } => {
      const ok = broker.respond(args.requestId, args.decision, args.remember)
      return { ok }
    },
  )

  ipcMain.handle('permission:list-pending', (): PermissionRequest[] => broker.listPending())
}
