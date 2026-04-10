/**
 * Electron mock for Vitest/Wallaby.
 * Resolves all 'electron' imports in main/renderer source files so that
 * they can be loaded and instrumented in a Node.js test environment.
 * Aliased via vitest.config.ts resolve.alias.
 */

import { vi } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noop = (): any => undefined
const noopObj = () => ({})

const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeHandler: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  emit: vi.fn(),
}

const ipcRenderer = {
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
  sendSync: vi.fn(),
}

const app = {
  getPath: vi.fn().mockReturnValue('/mock/path'),
  getAppPath: vi.fn().mockReturnValue('/mock/app'),
  getVersion: vi.fn().mockReturnValue('0.0.0'),
  getName: vi.fn().mockReturnValue('test'),
  quit: vi.fn(),
  exit: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  whenReady: vi.fn().mockResolvedValue(undefined),
  isPackaged: false,
}

class BrowserWindowMock {
  webContents = {
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    reload: vi.fn(),
    openDevTools: vi.fn(),
    getURL: vi.fn().mockReturnValue(''),
  }
  on = vi.fn()
  once = vi.fn()
  loadURL = vi.fn()
  loadFile = vi.fn()
  show = vi.fn()
  hide = vi.fn()
  close = vi.fn()
  destroy = vi.fn()
  isDestroyed = vi.fn().mockReturnValue(false)
  isVisible = vi.fn().mockReturnValue(true)
  focus = vi.fn()
  static getAllWindows = vi.fn().mockReturnValue([])
  static getFocusedWindow = vi.fn().mockReturnValue(null)
}

const dialog = {
  showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
  showSaveDialog: vi.fn().mockResolvedValue({ canceled: true }),
  showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  showErrorBox: vi.fn(),
}

const shell = {
  openExternal: vi.fn().mockResolvedValue(undefined),
  openPath: vi.fn().mockResolvedValue(''),
  showItemInFolder: vi.fn(),
}

const safeStorage = {
  isEncryptionAvailable: vi.fn().mockReturnValue(false),
  encryptString: vi.fn().mockImplementation((s: string) => Buffer.from(s)),
  decryptString: vi.fn().mockImplementation((b: Buffer) => b.toString()),
}

class NotificationMock {
  constructor(_options?: object) {}
  show = vi.fn()
  close = vi.fn()
  on = vi.fn()
  once = vi.fn()
  static isSupported = vi.fn().mockReturnValue(false)
}

const contextBridge = {
  exposeInMainWorld: vi.fn(),
}

class IpcRendererEventMock {}

export {
  app,
  BrowserWindowMock as BrowserWindow,
  ipcMain,
  ipcRenderer,
  dialog,
  shell,
  safeStorage,
  NotificationMock as Notification,
  contextBridge,
  IpcRendererEventMock as IpcRendererEvent,
  noop as default,
  noopObj,
}
