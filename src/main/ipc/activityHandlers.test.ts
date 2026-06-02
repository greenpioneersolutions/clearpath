import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { IpcMain } from 'electron'
import { shell } from 'electron'

// In-memory electron-store (shared with the hoisted vi.mock factory)
const { memory } = vi.hoisted(() => ({ memory: {} as Record<string, unknown> }))
vi.mock('electron-store', () => ({
  default: class {
    get(key: string, def?: unknown) { return memory[key] ?? def }
    set(key: string, val: unknown) { memory[key] = val }
  },
}))
vi.mock('../utils/storeEncryption', () => ({ getStoreEncryptionKey: () => 'k' }))

import {
  recordSessionActivity,
  clearSessionActivity,
  registerActivityHandlers,
} from './activityHandlers'
import type { SessionActivityEntry } from '../../shared/activity/types'

function makeFakeIpc() {
  const handlers = new Map<string, (...a: unknown[]) => unknown>()
  const ipcMain = { handle: (ch: string, fn: (...a: unknown[]) => unknown) => handlers.set(ch, fn) } as unknown as IpcMain
  return { ipcMain, invoke: <T>(ch: string, args?: unknown) => Promise.resolve(handlers.get(ch)!({}, args) as T) }
}

const entry = (over: Partial<SessionActivityEntry> = {}): Omit<SessionActivityEntry, 'id'> => ({
  sessionId: 's1', cli: 'claude', kind: 'write', toolName: 'Write', target: '/p/out.md',
  decision: 'allow', timestamp: 1, ...over,
})

beforeEach(() => { for (const k of Object.keys(memory)) delete memory[k] })

describe('recordSessionActivity', () => {
  it('appends entries with an id', () => {
    recordSessionActivity(entry())
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    return invoke<SessionActivityEntry[]>('activity:get-session', { sessionId: 's1' }).then((list) => {
      expect(list).toHaveLength(1)
      expect(list[0].id).toBeTruthy()
      expect(list[0].target).toBe('/p/out.md')
    })
  })

  it('collapses an immediate duplicate (same kind+target+decision)', async () => {
    recordSessionActivity(entry())
    recordSessionActivity(entry())
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    expect(await invoke<unknown[]>('activity:get-session', { sessionId: 's1' })).toHaveLength(1)
  })

  it('keeps distinct entries and separates by session', async () => {
    clearSessionActivity('s1'); clearSessionActivity('s2')
    recordSessionActivity(entry({ target: '/a' }))
    recordSessionActivity(entry({ target: '/b' }))
    recordSessionActivity(entry({ sessionId: 's2', target: '/a' }))
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    expect(await invoke<unknown[]>('activity:get-session', { sessionId: 's1' })).toHaveLength(2)
    expect(await invoke<unknown[]>('activity:get-session', { sessionId: 's2' })).toHaveLength(1)
  })

  it('clearSessionActivity drops only that session', async () => {
    clearSessionActivity('s1'); clearSessionActivity('s2')
    recordSessionActivity(entry({ sessionId: 's1' }))
    recordSessionActivity(entry({ sessionId: 's2' }))
    clearSessionActivity('s1')
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    expect(await invoke<unknown[]>('activity:get-session', { sessionId: 's1' })).toHaveLength(0)
    expect(await invoke<unknown[]>('activity:get-session', { sessionId: 's2' })).toHaveLength(1)
  })
})

describe('activity IPC open handlers', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cp-act-')); vi.mocked(shell.openPath).mockClear?.() })

  it('activity:open-file opens an existing file', async () => {
    const f = join(dir, 'out.md'); writeFileSync(f, 'x')
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    const r = await invoke<{ ok: boolean }>('activity:open-file', { path: f })
    expect(r.ok).toBe(true)
    expect(shell.openPath).toHaveBeenCalledWith(f)
    rmSync(dir, { recursive: true, force: true })
  })

  it('activity:open-file refuses a missing file', async () => {
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    const r = await invoke<{ ok: boolean; error?: string }>('activity:open-file', { path: join(dir, 'nope.md') })
    expect(r.ok).toBe(false)
  })

  it('activity:open-url opens http(s) only', async () => {
    const { invoke, ipcMain } = makeFakeIpc()
    registerActivityHandlers(ipcMain)
    expect((await invoke<{ ok: boolean }>('activity:open-url', { url: 'https://example.com' })).ok).toBe(true)
    expect((await invoke<{ ok: boolean }>('activity:open-url', { url: 'file:///etc/passwd' })).ok).toBe(false)
  })
})
