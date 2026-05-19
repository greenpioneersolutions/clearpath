import type { IpcMain, WebContents } from 'electron'
import type { PricingService, PricingOverride, PricingSettings } from '../pricing/PricingService'

/**
 * IPC + push-event wiring for the pricing service. The renderer's
 * PricingContext consumes these to render Cost Settings and to keep the
 * displayed effective table in sync.
 *
 * Push channel: `pricing:changed` is broadcast on any mutation (override
 * set/cleared, settings change, remote sync result) so consumers can refetch
 * the effective table without polling.
 */
export function registerPricingHandlers(
  ipcMain: IpcMain,
  pricingService: PricingService,
  getWebContents: () => WebContents | null,
): void {
  ipcMain.handle('pricing:get-effective', () => pricingService.getEffectiveTable())
  ipcMain.handle('pricing:get-defaults',  () => pricingService.getDefaults())
  ipcMain.handle('pricing:get-overrides', () => pricingService.getOverrides())
  ipcMain.handle('pricing:get-settings',  () => pricingService.getSettings())

  ipcMain.handle(
    'pricing:set-override',
    (_event, { model, override }: { model: string; override: PricingOverride }) => {
      pricingService.setOverride(model, override)
    },
  )

  ipcMain.handle(
    'pricing:clear-override',
    (_event, { model }: { model: string }) => {
      pricingService.clearOverride(model)
    },
  )

  ipcMain.handle(
    'pricing:set-settings',
    (_event, { settings }: { settings: Partial<PricingSettings> }) => {
      pricingService.setSettings(settings ?? {})
    },
  )

  ipcMain.handle('pricing:sync-now', () => pricingService.syncFromRemote())

  // Push: any mutation triggers `pricing:changed` so the renderer can refresh.
  pricingService.on('changed', () => {
    const wc = getWebContents()
    if (wc && !wc.isDestroyed()) wc.send('pricing:changed')
  })
}
