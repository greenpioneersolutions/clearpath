import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

export interface HistoricalSession {
  sessionId: string
  cli: 'copilot' | 'claude'
  name?: string
  firstPrompt?: string
  startedAt: number
  endedAt?: number
}

interface HistoryStore {
  sessions: HistoricalSession[]
}

const store = new Store<HistoryStore>({
  name: 'clear-path-history',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { sessions: [] },
})

const MAX_HISTORY = 100

export function registerSessionHistoryHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('session-history:list', () => {
    return store.get('sessions')
  })

  ipcMain.handle('session-history:add', (_event, session: HistoricalSession) => {
    const sessions = store.get('sessions')
    const existing = sessions.findIndex((s) => s.sessionId === session.sessionId)
    if (existing >= 0) {
      sessions[existing] = { ...sessions[existing], ...session }
    } else {
      sessions.unshift(session)
      if (sessions.length > MAX_HISTORY) sessions.splice(MAX_HISTORY)
    }
    store.set('sessions', sessions)
  })

  ipcMain.handle(
    'session-history:update',
    (_event, { sessionId, endedAt }: { sessionId: string; endedAt: number }) => {
      const sessions = store.get('sessions')
      const idx = sessions.findIndex((s) => s.sessionId === sessionId)
      if (idx >= 0) {
        sessions[idx] = { ...sessions[idx], endedAt }
        store.set('sessions', sessions)
      }
    }
  )

  ipcMain.handle('session-history:clear', () => {
    store.set('sessions', [])
  })
}
