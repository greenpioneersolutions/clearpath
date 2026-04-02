import type { IpcMain } from 'electron'
import type { SchedulerService, ScheduledJob } from '../scheduler/SchedulerService'

export function registerSchedulerHandlers(ipcMain: IpcMain, scheduler: SchedulerService): void {
  ipcMain.handle('scheduler:list', () => scheduler.listJobs())

  ipcMain.handle('scheduler:get', (_e, args: { id: string }) => scheduler.getJob(args.id))

  ipcMain.handle('scheduler:save', (_e, args: Omit<ScheduledJob, 'id' | 'createdAt' | 'executions'> & { id?: string }) =>
    scheduler.saveJob(args),
  )

  ipcMain.handle('scheduler:delete', (_e, args: { id: string }) => {
    scheduler.deleteJob(args.id)
    return { success: true }
  })

  ipcMain.handle('scheduler:toggle', (_e, args: { id: string; enabled: boolean }) => {
    scheduler.toggleJob(args.id, args.enabled)
    return { success: true }
  })

  ipcMain.handle('scheduler:run-now', (_e, args: { id: string }) => scheduler.executeJob(args.id))

  ipcMain.handle('scheduler:duplicate', (_e, args: { id: string }) => scheduler.duplicateJob(args.id))

  ipcMain.handle('scheduler:templates', () => scheduler.getTemplates())
}
