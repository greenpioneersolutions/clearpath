import { describe, it, expect, vi, beforeEach } from 'vitest'
// `electron` is aliased to src/test/electron-mock.ts in vitest.config.ts, so
// this `dialog`/`shell` is the shared mock — we drive them per test.
import { dialog, shell } from 'electron'

vi.mock('../utils/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// open-path uses the REAL fs.existsSync + isSensitiveSystemPath (mocking `fs`
// across the module graph is unreliable in vitest), so the tests drive it with
// real paths: process.cwd() always exists and is non-sensitive; /etc is flagged.
const openPathMock = shell.openPath as unknown as ReturnType<typeof vi.fn>

import { registerLocationHandlers } from './locationHandlers'
import type { LocationsManager } from '../locations/LocationsManager'

const showOpenDialogMock = dialog.showOpenDialog as unknown as ReturnType<typeof vi.fn>

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockIpcMain() {
  return { handle: vi.fn() } as unknown as Parameters<typeof registerLocationHandlers>[0]
}

function getHandler(ipcMain: { handle: ReturnType<typeof vi.fn> }, channel: string) {
  const call = ipcMain.handle.mock.calls.find((c: unknown[]) => c[0] === channel)
  if (!call) throw new Error(`No handler for ${channel}`)
  return call[1] as (...args: unknown[]) => unknown
}

function makeLocations(overrides: Partial<Record<keyof LocationsManager, unknown>> = {}): LocationsManager {
  return {
    listApproved: vi.fn().mockReturnValue([]),
    addApproved: vi.fn(),
    removeApproved: vi.fn(),
    getDefaultWorkingDir: vi.fn().mockReturnValue(null),
    setDefaultWorkingDir: vi.fn().mockReturnValue({ ok: true }),
    listSources: vi.fn().mockReturnValue([]),
    addSource: vi.fn(),
    removeSource: vi.fn(),
    getExistingSourceFolders: vi.fn().mockReturnValue([]),
    health: vi.fn(),
    ...overrides,
  } as unknown as LocationsManager
}

beforeEach(() => {
  // Default to "cancelled" so a test that forgets to configure the dialog can't
  // accidentally pick a stale path leaked from another test.
  showOpenDialogMock.mockReset().mockResolvedValue({ canceled: true, filePaths: [] })
  openPathMock.mockReset().mockResolvedValue('')
})

describe('locationHandlers', () => {
  it('adds an approved folder using a provided path (no dialog)', async () => {
    const entry = { id: 'a', label: 'Repos', path: '/home/u/repos', addedAt: 0 }
    const locations = makeLocations({ addApproved: vi.fn().mockReturnValue({ entry }) })
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    const res = await getHandler(ipcMain as never, 'locations:add-approved')({}, { path: '/home/u/repos' })
    expect(res).toEqual({ entry })
    expect(locations.addApproved).toHaveBeenCalledWith('/home/u/repos', undefined)
    expect(showOpenDialogMock).not.toHaveBeenCalled()
  })

  it('opens the folder picker when no path is provided', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ['/home/u/picked'] })
    const entry = { id: 'b', label: 'picked', path: '/home/u/picked', addedAt: 0 }
    const locations = makeLocations({ addApproved: vi.fn().mockReturnValue({ entry }) })
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    const res = await getHandler(ipcMain as never, 'locations:add-approved')({})
    expect(showOpenDialogMock).toHaveBeenCalled()
    expect(locations.addApproved).toHaveBeenCalledWith('/home/u/picked', undefined)
    expect(res).toEqual({ entry })
  })

  it('returns {canceled} when the picker is dismissed', async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] })
    const locations = makeLocations()
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    const res = await getHandler(ipcMain as never, 'locations:add-approved')({})
    expect(res).toEqual({ canceled: true })
    expect(locations.addApproved).not.toHaveBeenCalled()
  })

  it('surfaces validation errors from the manager', async () => {
    const locations = makeLocations({ addApproved: vi.fn().mockReturnValue({ error: 'Folder does not exist' }) })
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    const res = await getHandler(ipcMain as never, 'locations:add-approved')({}, { path: '/nope' })
    expect(res).toEqual({ error: 'Folder does not exist' })
  })

  it('proxies health() through', () => {
    const health = { defaultWorkingDir: null, approvedFolders: [], sourceFolders: [] }
    const locations = makeLocations({ health: vi.fn().mockReturnValue(health) })
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    expect(getHandler(ipcMain as never, 'locations:health')()).toEqual(health)
  })

  it('sets the default working dir', () => {
    const locations = makeLocations()
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    const res = getHandler(ipcMain as never, 'locations:set-default-cwd')({}, { path: '/home/u/dev' })
    expect(locations.setDefaultWorkingDir).toHaveBeenCalledWith('/home/u/dev')
    expect(res).toEqual({ success: true })
  })

  it('resets the default working dir to the app default (null clears it)', () => {
    const locations = makeLocations()
    const ipcMain = createMockIpcMain()
    registerLocationHandlers(ipcMain, locations)

    const res = getHandler(ipcMain as never, 'locations:set-default-cwd')({}, { path: null })
    expect(locations.setDefaultWorkingDir).toHaveBeenCalledWith(null)
    expect(res).toEqual({ success: true })
  })

  describe('locations:open-path', () => {
    it('reveals an existing, non-sensitive folder', async () => {
      const ipcMain = createMockIpcMain()
      registerLocationHandlers(ipcMain, makeLocations())

      const cwd = process.cwd()
      const res = await getHandler(ipcMain as never, 'locations:open-path')({}, { path: cwd })
      expect(openPathMock).toHaveBeenCalledWith(cwd)
      expect(res).toEqual({ success: true })
    })

    it('refuses a sensitive system path', async () => {
      const ipcMain = createMockIpcMain()
      registerLocationHandlers(ipcMain, makeLocations())

      const res = await getHandler(ipcMain as never, 'locations:open-path')({}, { path: '/etc' })
      expect(res).toEqual({ error: 'That location is protected' })
      expect(openPathMock).not.toHaveBeenCalled()
    })

    it('reports a folder that no longer exists', async () => {
      const ipcMain = createMockIpcMain()
      registerLocationHandlers(ipcMain, makeLocations())

      const res = await getHandler(ipcMain as never, 'locations:open-path')({}, { path: '/home/nobody/clearpath-does-not-exist-xyz' })
      expect(res).toEqual({ error: 'Folder no longer exists' })
      expect(openPathMock).not.toHaveBeenCalled()
    })

    it('requires a path', async () => {
      const ipcMain = createMockIpcMain()
      registerLocationHandlers(ipcMain, makeLocations())

      const res = await getHandler(ipcMain as never, 'locations:open-path')({}, {})
      expect(res).toEqual({ error: 'path required' })
    })
  })
})
