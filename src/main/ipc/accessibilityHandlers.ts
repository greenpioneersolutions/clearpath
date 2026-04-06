import type { IpcMain } from 'electron'
import Store from 'electron-store'
import { getStoreEncryptionKey } from '../utils/storeEncryption'

interface AccessibilitySettings {
  fontScale: number
  reducedMotion: boolean
  highContrast: boolean
  focusStyle: 'ring' | 'outline' | 'both'
  screenReaderMode: boolean
  keyboardShortcutsEnabled: boolean
}

const DEFAULT: AccessibilitySettings = {
  fontScale: 1.0,
  reducedMotion: false,
  highContrast: false,
  focusStyle: 'ring',
  screenReaderMode: false,
  keyboardShortcutsEnabled: true,
}

const store = new Store<{ settings: AccessibilitySettings }>({
  name: 'clear-path-accessibility',
  encryptionKey: getStoreEncryptionKey(),
  defaults: { settings: DEFAULT },
})

export function registerAccessibilityHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('accessibility:get', () => {
    return store.get('settings')
  })

  ipcMain.handle('accessibility:set', (_e, args: Partial<AccessibilitySettings>) => {
    const current = store.get('settings')
    const merged = { ...current, ...args }
    store.set('settings', merged)
    return merged
  })

  ipcMain.handle('accessibility:reset', () => {
    store.set('settings', DEFAULT)
    return DEFAULT
  })
}
