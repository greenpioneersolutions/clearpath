import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

interface WidgetConfig {
  i: string
  type: string
  x: number
  y: number
  w: number
  h: number
  config: Record<string, unknown>
}

interface DashboardLayout {
  id: string
  name: string
  widgets: WidgetConfig[]
}

interface DashboardStoreSchema {
  activeLayoutId: string
  layouts: DashboardLayout[]
}

const PRESET_LAYOUTS: DashboardLayout[] = [
  {
    id: 'layout-developer', name: 'Developer',
    widgets: [
      { i: 'quick-prompt', type: 'quick-prompt', x: 0, y: 0, w: 8, h: 3, config: {} },
      { i: 'running-agents', type: 'running-agents', x: 8, y: 0, w: 4, h: 3, config: {} },
      { i: 'recent-sessions', type: 'recent-sessions', x: 0, y: 3, w: 4, h: 3, config: { limit: 5 } },
      { i: 'token-usage', type: 'token-usage', x: 4, y: 3, w: 4, h: 3, config: {} },
      { i: 'cost-summary', type: 'cost-summary', x: 8, y: 3, w: 4, h: 3, config: { range: 'today' } },
    ],
  },
  {
    id: 'layout-manager', name: 'Manager',
    widgets: [
      { i: 'cost-summary', type: 'cost-summary', x: 0, y: 0, w: 6, h: 3, config: { range: 'week' } },
      { i: 'workspace-activity', type: 'workspace-activity', x: 6, y: 0, w: 6, h: 3, config: {} },
      { i: 'schedule-overview', type: 'schedule-overview', x: 0, y: 3, w: 4, h: 3, config: {} },
      { i: 'security-events', type: 'security-events', x: 4, y: 3, w: 4, h: 3, config: {} },
      { i: 'notification-feed', type: 'notification-feed', x: 8, y: 3, w: 4, h: 3, config: {} },
    ],
  },
  {
    id: 'layout-team-lead', name: 'Team Lead',
    widgets: [
      { i: 'repo-status', type: 'repo-status', x: 0, y: 0, w: 8, h: 3, config: {} },
      { i: 'running-agents', type: 'running-agents', x: 8, y: 0, w: 4, h: 3, config: {} },
      { i: 'quick-launch', type: 'quick-launch', x: 0, y: 3, w: 4, h: 2, config: {} },
      { i: 'schedule-overview', type: 'schedule-overview', x: 4, y: 3, w: 4, h: 3, config: {} },
      { i: 'notification-feed', type: 'notification-feed', x: 8, y: 3, w: 4, h: 3, config: {} },
    ],
  },
]

const store = new Store<DashboardStoreSchema>({
  name: 'clear-path-dashboard',
  encryptionKey: getStoreEncryptionKey(),
  defaults: {
    activeLayoutId: 'layout-developer',
    layouts: [],
  },
})

function getAllLayouts(): DashboardLayout[] {
  const user = store.get('layouts')
  const userIds = new Set(user.map((l) => l.id))
  return [...PRESET_LAYOUTS.filter((l) => !userIds.has(l.id)), ...user]
}

export function registerDashboardHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('dashboard:get-active-layout', () => {
    const all = getAllLayouts()
    const activeId = store.get('activeLayoutId')
    return all.find((l) => l.id === activeId) ?? all[0]
  })

  ipcMain.handle('dashboard:list-layouts', () => getAllLayouts())

  ipcMain.handle('dashboard:set-active', (_e, args: { id: string }) => {
    store.set('activeLayoutId', args.id)
    return { success: true }
  })

  ipcMain.handle('dashboard:save-layout', (_e, args: { id: string; name: string; widgets: WidgetConfig[] }) => {
    const layouts = store.get('layouts')
    const idx = layouts.findIndex((l) => l.id === args.id)
    const layout: DashboardLayout = { id: args.id, name: args.name, widgets: args.widgets }
    if (idx >= 0) layouts[idx] = layout
    else layouts.push(layout)
    store.set('layouts', layouts)
    return layout
  })

  ipcMain.handle('dashboard:reset-layout', (_e, args: { id: string }) => {
    const preset = PRESET_LAYOUTS.find((l) => l.id === args.id)
    if (preset) {
      // Remove user override
      store.set('layouts', store.get('layouts').filter((l) => l.id !== args.id))
      return preset
    }
    return null
  })
}
